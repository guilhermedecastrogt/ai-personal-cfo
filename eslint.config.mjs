import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/', '**/.next/', '**/node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/ai/openai/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^openai(/.*)?$',
              message: 'Only the OpenAI provider may import the OpenAI SDK. Depend on AIProvider.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/finance/domain/**/*.ts', 'apps/api/src/money/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                '**/application/**',
                '**/infrastructure/**',
                '**/database/**',
              ],
              message:
                'The finance domain is pure. It must not depend on frameworks, persistence, transport or AI providers.',
            },
            {
              regex: '^openai(/.*)?$',
              message: 'The finance domain must not depend on an AI provider.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
