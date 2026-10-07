import { z } from "zod";

export const MAX_PAGE_SIZE = 100;
/** Hard ceiling on OFFSET depth so a hostile client cannot force deep scans. Use filters/search to go deeper. */
export const MAX_OFFSET = 10_000;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function pageToSkipTake({ page, pageSize }: PaginationInput) {
  const skip = (page - 1) * pageSize;
  return { skip: Math.min(skip, MAX_OFFSET), take: pageSize };
}

export function buildPageMeta({ page, pageSize }: PaginationInput, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export const paginated = <T>(items: T[], input: PaginationInput, total: number): Paginated<T> => ({
  items,
  meta: buildPageMeta(input, total),
});
