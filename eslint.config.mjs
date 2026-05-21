import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext Cloudflare build output:
    ".open-next/**",
  ]),
  {
    rules: {
      // Downgrade to warning: rule produces false positives for async fetches
      // (it can't statically detect that setState happens after an await, not synchronously)
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
