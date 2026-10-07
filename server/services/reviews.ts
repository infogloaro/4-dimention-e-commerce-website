import { db, withTransaction, Prisma } from "../db/client";
import { AppError, notFound } from "../core/errors";
import type { AuthUser } from "../auth/session";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { ReviewStatus } from "../db/generated/client";

/** Delivered-or-later orders count as a real purchase; cancelled / failed / pending ones do not. */
const PURCHASED_STATUSES = ["DELIVERED", "RETURN_REQUESTED", "RETURNED"] as const;

export async function createReview(user: AuthUser, productId: string, input: { rating: number; title?: string; body?: string; imageUrls?: string[] }) {
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true } });
  if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product");
  // Verified purchase is derived from the order ledger — never from anything the client sends.
  const purchase = await db.orderItem.findFirst({ where: { productId, order: { userId: user.id, status: { in: [...PURCHASED_STATUSES] } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  try {
    const review = await db.review.create({
      data: { productId, userId: user.id, rating: input.rating, title: input.title, body: input.body, orderItemId: purchase?.id, isVerifiedPurchase: !!purchase, media: input.imageUrls?.length ? { create: input.imageUrls.map((url) => ({ url })) } : undefined },
    });
    return { id: review.id, status: review.status, isVerifiedPurchase: review.isVerifiedPurchase };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("REVIEW_ALREADY_EXISTS", "You've already reviewed this product");
    throw e;
  }
}

export async function updateOwnReview(user: AuthUser, reviewId: string, input: { rating?: number; title?: string; body?: string }) {
  const r = await db.review.findFirst({ where: { id: reviewId, userId: user.id } });
  if (!r) throw notFound("REVIEW_NOT_FOUND", "Review");
  await db.review.update({ where: { id: reviewId }, data: { ...input, status: "PENDING", moderatedAt: null, moderatedById: null, rejectionReason: null } });
  if (r.status === "APPROVED") await recomputeRating(r.productId);
}

export async function deleteOwnReview(user: AuthUser, reviewId: string) {
  const r = await db.review.findFirst({ where: { id: reviewId, userId: user.id } });
  if (!r) throw notFound("REVIEW_NOT_FOUND", "Review");
  await db.review.delete({ where: { id: reviewId } });
  if (r.status === "APPROVED") await recomputeRating(r.productId);
}

export type ReviewSort = "recent" | "helpful" | "rating_desc" | "rating_asc";

export async function listProductReviews(productId: string, q: { sort: ReviewSort; rating?: number; verifiedOnly?: boolean; page: number; pageSize: number }, viewerId?: string | null) {
  const where: Prisma.ReviewWhereInput = { productId, status: "APPROVED", ...(q.rating ? { rating: q.rating } : {}), ...(q.verifiedOnly ? { isVerifiedPurchase: true } : {}) };
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] = q.sort === "helpful" ? [{ helpfulCount: "desc" }, { createdAt: "desc" }] : q.sort === "rating_desc" ? [{ rating: "desc" }, { createdAt: "desc" }] : q.sort === "rating_asc" ? [{ rating: "asc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
  const [rows, total, product] = await Promise.all([
    db.review.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { user: { select: { name: true, avatarUrl: true } }, media: { select: { url: true, type: true } }, ...(viewerId ? { votes: { where: { userId: viewerId }, select: { userId: true } } } : {}) } }),
    db.review.count({ where }),
    db.product.findUnique({ where: { id: productId }, select: { ratingAvg: true, ratingCount: true, ratingBreakdown: true } }),
  ]);
  return {
    total,
    summary: product ? { average: Number(product.ratingAvg), count: product.ratingCount, breakdown: product.ratingBreakdown } : null,
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body, // user-generated: the client must render as text, never as HTML
      isVerifiedPurchase: r.isVerifiedPurchase,
      helpfulCount: r.helpfulCount,
      author: { name: maskName(r.user.name), avatarUrl: r.user.avatarUrl },
      images: r.media.map((m) => m.url),
      votedHelpful: "votes" in r ? (r.votes as unknown[]).length > 0 : false,
      createdAt: r.createdAt,
    })),
  };
}

const maskName = (n: string) => {
  const [first = "", ...rest] = n.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : first;
};

export async function toggleHelpful(user: AuthUser, reviewId: string) {
  const r = await db.review.findFirst({ where: { id: reviewId, status: "APPROVED" } });
  if (!r) throw notFound("REVIEW_NOT_FOUND", "Review");
  if (r.userId === user.id) throw new AppError("REVIEW_STATE_INVALID", "You can't vote on your own review");
  return withTransaction(async (tx) => {
    const del = await tx.reviewVote.deleteMany({ where: { reviewId, userId: user.id } });
    if (del.count > 0) {
      const u = await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { decrement: 1 } }, select: { helpfulCount: true } });
      return { voted: false, helpfulCount: u.helpfulCount };
    }
    await tx.reviewVote.create({ data: { reviewId, userId: user.id } });
    const u = await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: { increment: 1 } }, select: { helpfulCount: true } });
    return { voted: true, helpfulCount: u.helpfulCount };
  });
}

export async function myReviews(userId: string) {
  return db.review.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, include: { product: { select: { name: true, slug: true } } } });
}

/** Recompute the denormalised rating summary shown on cards and PDP. One aggregate query. */
export async function recomputeRating(productId: string) {
  const rows = await db.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED" }, _count: { _all: true } });
  const breakdown: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    breakdown[String(r.rating)] = r._count._all;
    count += r._count._all;
    sum += r.rating * r._count._all;
  }
  await db.product.update({ where: { id: productId }, data: { ratingCount: count, ratingAvg: count ? (Math.round((sum / count) * 100) / 100).toFixed(2) : "0", ratingBreakdown: breakdown } });
}

// ───────────────────────────── moderation ─────────────────────────────

export async function adminListReviews(q: { status?: ReviewStatus; productId?: string; page: number; pageSize: number }) {
  const where: Prisma.ReviewWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.productId ? { productId: q.productId } : {}) };
  const [items, total] = await Promise.all([
    db.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { user: { select: { name: true, email: true } }, product: { select: { name: true, slug: true } }, media: { select: { url: true } } } }),
    db.review.count({ where }),
  ]);
  return { items, total };
}

export async function moderateReview(actor: AuthUser, reviewId: string, decision: { approve: boolean; reason?: string }) {
  const r = await db.review.findUnique({ where: { id: reviewId }, include: { product: { select: { name: true } } } });
  if (!r) throw notFound("REVIEW_NOT_FOUND", "Review");
  await db.review.update({ where: { id: reviewId }, data: { status: decision.approve ? "APPROVED" : "REJECTED", moderatedById: actor.id, moderatedAt: new Date(), rejectionReason: decision.approve ? null : decision.reason } });
  await recomputeRating(r.productId);
  await audit({ action: decision.approve ? "review.approved" : "review.rejected", resourceType: "review", resourceId: reviewId, actor, metadata: { reason: decision.reason } });
  if (decision.approve) await notify("review.approved", { userId: r.userId }, { product: r.product.name });
}

// ───────────────────────────── Q&A ─────────────────────────────

export async function askQuestion(user: AuthUser, productId: string, question: string) {
  if (!(await db.product.findFirst({ where: { id: productId, status: "ACTIVE", deletedAt: null }, select: { id: true } }))) throw notFound("PRODUCT_NOT_FOUND", "Product");
  const q = await db.productQuestion.create({ data: { productId, userId: user.id, question } });
  return { id: q.id, status: q.status };
}

export async function listQuestions(productId: string, page: number, pageSize: number) {
  const where = { productId, status: "APPROVED" as const };
  const [rows, total] = await Promise.all([db.productQuestion.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { answers: { orderBy: [{ isOfficial: "desc" }, { createdAt: "asc" }] }, user: { select: { name: true } } } }), db.productQuestion.count({ where })]);
  return { total, items: rows.map((q) => ({ id: q.id, question: q.question, askedBy: maskName(q.user.name), createdAt: q.createdAt, answers: q.answers.map((a) => ({ id: a.id, body: a.body, isOfficial: a.isOfficial, createdAt: a.createdAt })) })) };
}

export async function adminListQuestions(q: { status?: "PENDING" | "APPROVED" | "REJECTED"; page: number; pageSize: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([db.productQuestion.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { product: { select: { name: true, slug: true } }, answers: true } }), db.productQuestion.count({ where })]);
  return { items, total };
}

export async function moderateQuestion(actor: AuthUser, id: string, approve: boolean) {
  const res = await db.productQuestion.updateMany({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED" } });
  if (res.count === 0) throw notFound("QUESTION_NOT_FOUND", "Question");
  await audit({ action: approve ? "question.approved" : "question.rejected", resourceType: "question", resourceId: id, actor });
}

export async function answerQuestion(actor: AuthUser, questionId: string, body: string) {
  const q = await db.productQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw notFound("QUESTION_NOT_FOUND", "Question");
  const a = await db.productAnswer.create({ data: { questionId, userId: actor.id, body, isOfficial: true } });
  if (q.status !== "APPROVED") await db.productQuestion.update({ where: { id: questionId }, data: { status: "APPROVED" } });
  await audit({ action: "question.answered", resourceType: "question", resourceId: questionId, actor });
  return a;
}
