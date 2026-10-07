import { db, Prisma } from "../../db/client";
import { memo } from "../../core/cache";
import { escapeLike } from "../../core/text";
import { logger } from "../../core/logger";
import { cardInclude, toMini } from "./dto";

const MAX_TOKENS = 6;
const MAX_QUERY_LEN = 100;

export function normalizeQuery(q: string): { text: string; tokens: string[] } {
  const text = q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LEN);
  const tokens = [...new Set(text.split(" ").filter(Boolean))].slice(0, MAX_TOKENS);
  return { text, tokens };
}

/** term → alternative terms (bidirectional), cached. */
function loadSynonyms(): Promise<Map<string, string[]>> {
  return memo("search:synonyms", 5 * 60_000, async () => {
    const rows = await db.searchSynonym.findMany();
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => (map.get(a) ?? map.set(a, new Set()).get(a)!).add(b);
    for (const r of rows) {
      const term = r.term.toLowerCase();
      for (const s of r.synonyms.map((x) => x.toLowerCase())) {
        add(term, s);
        add(s, term);
      }
    }
    return new Map([...map].map(([k, v]) => [k, [...v]]));
  });
}

const like = (s: string) => `%${escapeLike(s)}%`;

export interface SearchHit {
  id: string;
  score: number;
}

/**
 * Ranked product ids for a free-text query. All tokens must match (name, brand, category, tags, attributes or SKU),
 * each either as a substring or — for tokens of 4+ chars — fuzzily via pg_trgm word similarity (typo tolerance).
 * Synonyms widen a token to alternatives. Ranking favours exact/prefix name matches, SKU hits, then similarity,
 * with a gentle popularity prior.
 */
export async function searchProductIds(q: string, limit = 1000): Promise<SearchHit[]> {
  const { text, tokens } = normalizeQuery(q);
  if (tokens.length === 0) return [];
  const synonyms = await loadSynonyms();

  const tokenClauses: Prisma.Sql[] = tokens.map((tok) => {
    const alts = [tok, ...(synonyms.get(tok) ?? [])].slice(0, 6);
    const ors = alts.map((a) =>
      a.length >= 4
        ? Prisma.sql`(p."searchText" LIKE ${like(a)} OR ${a}::text <% p."searchText")`
        : Prisma.sql`p."searchText" LIKE ${like(a)}`,
    );
    return Prisma.sql`(${Prisma.join(ors, " OR ")})`;
  });
  const simSum = Prisma.join(tokens.map((t) => Prisma.sql`word_similarity(${t}::text, p."searchText")`), " + ");
  const skuPrefix = `${escapeLike(text)}%`;

  try {
    // looser word-similarity threshold (default 0.6) so single-letter typos like "headfones" still match; transaction-local
    const [, rows] = await db.$transaction([
      db.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.45', true)`,
      db.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
      SELECT p.id,
        ( CASE WHEN lower(p.name) = ${text} THEN 5 ELSE 0 END
        + CASE WHEN lower(p.name) LIKE ${skuPrefix} THEN 2 ELSE 0 END
        + CASE WHEN lower(p.name) LIKE ${like(text)} THEN 1 ELSE 0 END
        + CASE WHEN EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND lower(v.sku) LIKE ${skuPrefix}) THEN 4 ELSE 0 END
        + (${simSum})
        + ln(1 + p."soldCount") * 0.1 + p."ratingAvg"::float * 0.05 )::float AS score
      FROM "Product" p
      WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL
        AND ( (${Prisma.join(tokenClauses, " AND ")})
              OR EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND lower(v.sku) LIKE ${skuPrefix}) )
      ORDER BY score DESC, p."createdAt" DESC
      LIMIT ${limit}`),
    ]);
    return rows;
  } catch (e) {
    logger.error("search query failed", { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/** Fire-and-forget analytics for trending / popular queries. */
export function logSearch(q: string, resultCount: number, userId?: string | null) {
  const { text } = normalizeQuery(q);
  if (text.length < 2) return;
  void db.searchLog.create({ data: { query: text, resultCount, userId: userId ?? undefined } }).catch(() => undefined);
}

export async function suggest(q: string) {
  const { text } = normalizeQuery(q);
  if (text.length < 1) return { products: [], categories: [], brands: [], queries: [], didYouMean: null as string | null };

  const hits = await searchProductIds(text, 8);
  const ids = hits.slice(0, 6).map((h) => h.id);
  const [productRows, categories, brands, queries] = await Promise.all([
    ids.length ? db.product.findMany({ where: { id: { in: ids } }, include: cardInclude }) : [],
    db.category.findMany({ where: { isActive: true, name: { contains: text, mode: "insensitive" } }, take: 4, orderBy: { depth: "asc" }, select: { id: true, name: true, slug: true, imageUrl: true } }),
    db.brand.findMany({ where: { isActive: true, name: { contains: text, mode: "insensitive" } }, take: 3, select: { id: true, name: true, slug: true, logoUrl: true } }),
    db.$queryRaw<Array<{ query: string }>>`
      SELECT query FROM "SearchLog"
      WHERE query LIKE ${`${escapeLike(text)}%`} AND "resultCount" > 0 AND "createdAt" > now() - interval '30 days'
      GROUP BY query ORDER BY count(*) DESC LIMIT 5`,
  ]);
  const order = new Map(ids.map((id, i) => [id, i]));
  const products = productRows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(toMini);

  let didYouMean: string | null = null;
  if (products.length === 0 && text.length >= 4) {
    const near = await db.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM "Product" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL AND word_similarity(${text}::text, lower(name)) > 0.45
      ORDER BY word_similarity(${text}::text, lower(name)) DESC LIMIT 1`;
    didYouMean = near[0]?.name ?? null;
  }
  return { products, categories, brands, queries: queries.map((r) => r.query), didYouMean };
}

/** Popular recent queries — powers "trending searches" in the search overlay. */
export function trendingQueries(limit = 8) {
  return memo(`search:trending:${limit}`, 5 * 60_000, async () => {
    const rows = await db.$queryRaw<Array<{ query: string; n: number }>>`
      SELECT query, count(*)::int AS n FROM "SearchLog"
      WHERE "createdAt" > now() - interval '7 days' AND "resultCount" > 0
      GROUP BY query ORDER BY n DESC, query ASC LIMIT ${limit}`;
    return rows.map((r) => r.query);
  });
}
