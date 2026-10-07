import { route, reply, publicCache } from "@/server/core/http";
import { trendingQueries } from "@/server/services/catalog/search";
import { getCategoryTree } from "@/server/services/catalog/categories";

export const GET = route({}, async () => {
  const [queries, tree] = await Promise.all([trendingQueries(8), getCategoryTree()]);
  const categories = tree.slice().sort((a, b) => b.productCount - a.productCount).slice(0, 6).map(({ id, name, slug, imageUrl }) => ({ id, name, slug, imageUrl }));
  return reply({ queries, categories }, { headers: publicCache(120, 600) });
});
