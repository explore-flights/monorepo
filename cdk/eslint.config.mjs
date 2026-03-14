import { defineConfig } from 'eslint/config';
import { includeIgnoreFile } from '@eslint/compat';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
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
      'no-new': 0,
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
    files: ['**/*.ts'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    plugins: {
      '@typescript-eslint': tsEslint,
    },

    extends: ['@typescript-eslint/recommended'],

    rules: {
      'no-unused-vars': 0,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^[_]+$', varsIgnorePattern: '^[_]+$' }],
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/lines-between-class-members': 0,
      'typescript-sort-keys/interface': 0,
    }
  },
]);