// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno (npm: specifiers); they are type-checked by Supabase.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
