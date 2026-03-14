import { defineConfig, globalIgnores } from 'eslint/config';
import { includeIgnoreFile } from '@eslint/compat';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';
import reactEslint from 'eslint-plugin-react';
import reactHooksEslint from 'eslint-plugin-react-hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
  globalIgnores(['vite.config.ts', 'src/vite-env.d.ts']),
  {
    rules: {
      'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'import/prefer-default-export': 0,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^[_]+$', varsIgnorePattern: '^[_]+$' }],
      'object-shorthand': 0,
      'no-restricted-syntax': 0,
      'no-underscore-dangle': 0,
      'max-classes-per-file': 0,
      'no-lonely-if': 0,
      'no-plusplus': 0,
      'max-len': 0,
      'no-trailing-spaces': 0,
      'no-bitwise': 0,
      'no-case-declarations': 0,
      'semi': 'warn',
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    plugins: {
      'js': js,
    },
    extends: ['js/recommended'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },

    plugins: {
      '@typescript-eslint': tsEslint,
      'eslint-plugin-react': reactEslint,
      'eslint-plugin-react-hooks': reactHooksEslint,
    },

    extends: ['@typescript-eslint/recommended'],

    rules: {
      'no-unused-vars': 0,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^[_]+$', varsIgnorePattern: '^[_]+$' }],
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/lines-between-class-members': 0,
      '@typescript-eslint/no-use-before-define': 0,
      '@typescript-eslint/array-type': 0,
      'typescript-sort-keys/string-enum': 0,
      'typescript-sort-keys/interface': 0,
    },
  },
]);