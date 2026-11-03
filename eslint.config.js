// The launcher runs on Samsung's Tizen web runtime (Chromium-based, but older models lag),
// so legacy scripts retain ES5 syntax and compiled Settings targets Chromium 69.
const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");
const simpleImportSort = require("eslint-plugin-simple-import-sort");
const perfectionist = require("eslint-plugin-perfectionist");
const unusedImports = require("eslint-plugin-unused-imports");

module.exports = [
  {
    ignores: [
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/out/**",
      "test-results/**",
      "playwright-report/**",
      "launcher/js/logos.js",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      // ES5 has no optional catch binding, so `catch (e) {}` is the idiom.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["launcher/js/**/*.js", "tests/fixtures/legacy-launcher/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        ...globals.browser,
        AeroTizen: "writable",
        tizen: "readonly",
        webapis: "readonly",
        Uint8Array: "readonly",
        Uint8ClampedArray: "readonly",
      },
    },
    rules: {
      eqeqeq: "error",
      "no-var": "off",
    },
  },
  {
    files: ["launcher/src/**/*.{ts,tsx}", "vite.config.mts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: {
          allowDefaultProject: ["vite.config.mts"],
          defaultProject: "tsconfig.node.json",
        },
        tsconfigRootDir: __dirname,
      },
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@typescript-eslint": tsPlugin,
      perfectionist,
      "unused-imports": unusedImports,
    },
    // Use React 16 component detection for Preact; React is not a dependency.
    settings: { react: { pragma: "h", fragment: "Fragment", version: "16.0" } },
    rules: {
      ...tsPlugin.configs["recommended-type-checked"].rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/unbound-method": "off",
      "perfectionist/sort-interfaces": ["error", { type: "natural", order: "asc" }],
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-multi-comp": "error",
      "react/function-component-definition": ["error", { namedComponents: "arrow-function" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'ImportDeclaration[source.value="lucide-preact"] > ImportNamespaceSpecifier',
          message: "Import named Lucide icons so unused icons can be removed.",
        },
        {
          selector: 'ImportDeclaration[source.value="lucide-preact"] > ImportSpecifier[imported.name="icons"]',
          message: "Do not import the Lucide icon catalogue.",
        },
        {
          selector: 'ImportExpression[source.value="lucide-preact"]',
          message: "Import named Lucide icons statically.",
        },
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration",
          message: "Export functions as const arrow functions.",
        },
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration[kind!="const"]',
          message: "Use const for named exports.",
        },
      ],
      eqeqeq: "error",
    },
  },
  {
    files: ["launcher/src/**/*.{ts,tsx}", "vite.config.mts", "tools/build-launcher.mjs"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": ["error", { groups: [["^\\u0000"], ["^@?\\w"], ["^@", "^"], ["^\\./"]] }],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["launcher/src/{contracts,platform,services,shared}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "**/home/**", "**/settings/**", "**/status/**"],
              message: "Shared contracts, services and platform adapters must not import screens or app composition.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["launcher/src/**/*.{ts,tsx}", "vite.config.mts", "tools/build-launcher.mjs", "*.config.{js,cjs}"],
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "one-var": ["error", "never"],
      "no-nested-ternary": "error",
      "no-param-reassign": ["error", { props: true }],
    },
  },
  {
    files: ["launcher/src/app/createLauncherApp.ts"],
    rules: {
      // Composition publishes and restores the UI bridges on the legacy runtime.
      "no-param-reassign": ["error", { props: true, ignorePropertyModificationsFor: ["runtime"] }],
    },
  },
  {
    files: ["tools/build-launcher.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["tests/**/*.cjs", "eslint.config.js", "playwright.config.cjs", "stylelint.config.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    // Playwright callbacks run in the page; the surrounding test runs in Node.
    files: ["tests/browser/**/*.cjs", "tests/*.browser.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser, AeroTizen: "readonly" },
    },
  },
  {
    files: ["launcher/service/**/*.js"],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: "commonjs",
      globals: { ...globals.node, tizen: "readonly" },
    },
  },
  prettier,
  {
    files: [
      "launcher/js/**/*.js",
      "tests/fixtures/legacy-launcher/js/**/*.js",
      "launcher/src/**/*.{ts,tsx}",
      "vite.config.mts",
    ],
    // Keep required braces. The "all" option is compatible with Prettier.
    rules: { curly: ["error", "all"] },
  },
];
