import "dotenv/config";
import { execSync } from "node:child_process";

/** Applies all migrations to the test database once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, "/fourd_commerce_test$1");
  if (!url || !/test/i.test(new URL(url).pathname)) throw new Error("Refusing to migrate a non-test database");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url }, timeout: 120_000 });
}
