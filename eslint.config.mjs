import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Destructuring-to-omit (`const { secret, ...safe } = row`) is intentional in DTO mappers.
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" }] } },
  // Tests assert on arbitrary JSON returned by the API, which is intentionally loosely typed.
  { files: ["tests/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "server/db/generated/**",
  ]),
]);

export default eslintConfig;
