// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const bannedHtmlSinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
  property,
  message: 'Render text with textContent or h() (ADR 0011).',
}));

export default defineConfig(
  {
    ignores: ['**/dist', '**/coverage', '**/node_modules', 'assets/', 'verification/'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'vitest.config.ts',
            'packages/server/vitest.config.ts',
            'packages/shared/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Security baseline (ADR 0011).
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': ['error', ...bannedHtmlSinks],
    },
  },
  {
    files: ['packages/client/src/main/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['packages/client/src/worker/**'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: [
      'packages/server/**',
      'scripts/**',
      'e2e/**',
      'packages/shared/src/**/*.test.ts',
      '*.config.{js,ts}',
      'packages/*/*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  // Plain JavaScript (config and script files) is linted without type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
