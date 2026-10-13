import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['runs/**', 'node_modules/**', 'templates/**/dist/**', 'prototypes/**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  // Preserve frozen QA bytes; its redundant global directive is a lint-only exception.
  { files: ['tools/lean-pilot/h5-mobile-browser-qa.mjs'],
    languageOptions: { globals: { URL: 'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': 'off' } },
);
