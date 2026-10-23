import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['runs/**', 'node_modules/**', 'templates/**/dist/**', 'prototypes/**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['.agents/skills/**/scripts/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } } },
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
