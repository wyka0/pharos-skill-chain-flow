import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "vendor/**",
      "node_modules/**",
      "coverage/**",
      ".agents/**",
      "skills/**",
      "demo/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      // scripts are plain Node ESM; keep defaults, just be explicit
      "no-console": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
);
