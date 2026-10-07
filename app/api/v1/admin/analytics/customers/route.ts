import { route } from "@/server/core/http";
import { RL } from "@/server/core/rate-limit";
import { rangeQuery } from "@/server/validation/admin";
import { customerMetrics, funnel } from "@/server/services/analytics";

export const GET = route({ permission: "analytics:read", query: rangeQuery, rateLimit: RL.admin }, async (ctx) => {
  const [customers, conversion] = await Promise.all([customerMetrics(ctx.query), funnel(ctx.query)]);
  return { customers, funnel: conversion };
});
