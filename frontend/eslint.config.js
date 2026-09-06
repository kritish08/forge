import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Flat config (eslint 9). CRA used to run eslint as part of `react-scripts build`
// with warnings-as-errors under CI=true; Vite does not, so linting is its own CI
// step instead.
export default [
  { ignores: ["build/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The exhaustive-deps warning is what would have caught the stale
      // fetchData closure during the timezone work — keep it loud.
      "react-hooks/exhaustive-deps": "error",
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.test.{js,jsx}", "src/test-setup.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "no-undef": "off",
      // test.each callbacks receive positional args that a given case may not use
      "no-unused-vars": "off",
    },
  },
];
