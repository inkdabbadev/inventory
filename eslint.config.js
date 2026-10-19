// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native Animated values intentionally live in refs and are consumed by styles.
      "react-hooks/refs": "off",
      // Route params and debounced searches legitimately reset screen-local state.
      "react-hooks/set-state-in-effect": "off",
      // Shared query hooks accept caller-provided dependencies by design.
      "react-hooks/use-memo": "off",
    },
  }
]);
