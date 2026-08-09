import { defineConfig, globalIgnores } from 'eslint/config';
import { includeIgnoreFile } from '@eslint/compat';
import eslintReact from '@eslint-react/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';
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
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],
      curly: ['error', 'all'],
      'no-nested-ternary': 'error',
      'nonblock-statement-body-position': ['error', 'below'],
      quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^[_]+$', varsIgnorePattern: '^[_]+$' }],
      semi: 'warn',
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    plugins: {
      js: js,
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
      'react-hooks': reactHooksEslint,
    },

    extends: ['@typescript-eslint/recommended', eslintReact.configs.recommended],

    rules: {
      'no-unused-vars': 0,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^[_]+$', varsIgnorePattern: '^[_]+$' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]);
