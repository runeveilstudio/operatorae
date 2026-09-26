import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-es2020/**",
      "**/*.jsx",
      "apps/panel/CSXS/**",
      "tools/build/tmp/**"
    ]
  },
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.ts", "**/*.tsx"]
  })),
  {
    files: ["apps/jsx/src/**/*.ts", "packages/ae-mock/src/**/*.ts"],
    languageOptions: {
      globals: {
        // ExtendScript runtime globals (see docs/04 §3 — paths travel as JSON args, never interpolated)
        $: "readonly",
        app: "readonly",
        ExternalObject: "readonly",
        File: "readonly",
        Folder: "readonly",
        CSXSEvent: "readonly"
      }
    }
  },
  {
    files: ["**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
