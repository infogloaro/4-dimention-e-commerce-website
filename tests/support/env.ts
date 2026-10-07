import "dotenv/config";

/** Every test runs against the dedicated test database with deterministic, credential-free settings. */
const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, "/fourd_commerce_test$1");
if (!testUrl) throw new Error("TEST_DATABASE_URL is not set");
if (!/test/i.test(new URL(testUrl).pathname)) throw new Error(`Refusing to run tests against a non-test database: ${testUrl}`);

process.env.DATABASE_URL = testUrl;
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.STORE_PRICES_INCLUDE_TAX = "true";
process.env.APP_URL = "http://localhost:3000";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";
process.env.TRUST_PROXY = "true";
process.env.LOG_LEVEL = "silent";
