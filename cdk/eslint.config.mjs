import { defineConfig, globalIgnores } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'cdk.out/**',
    'bin/**/*.d.ts',
    'bin/**/*.js',
    'lib/**/*.d.ts',
    'lib/**/*.js',
  ]),
  {
    extends: compat.extends('eslint:recommended'),
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

    rules: {
      'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'import/prefer-default-export': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/lines-between-class-members': 0,
      'object-shorthand': 0,
      'no-restricted-syntax': 0,
      'typescript-sort-keys/interface': 0,
      'no-underscore-dangle': 0,
      'max-classes-per-file': 0,
      'no-lonely-if': 0,
      'max-len': 0,
      'no-new': 0,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^[_]+$' }],
    }
  }]);