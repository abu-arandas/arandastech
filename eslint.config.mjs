// Flat ESLint config for the TypeScript workspaces (packages/*, apps/web, agents, scripts).
// Uses only what is already installed: eslint and typescript-eslint. The Flutter owner app has its own analyzer.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/coverage/**', '**/dist/**', 'apps/owner/**', '**/next-env.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Readable and maintainable: no file over 800 lines, no function over 120 (the same rule as Zirr Retail).
    // Tests are left out, as one describe block holds many short tests.
    files: ['packages/*/src/**/*.ts', 'apps/web/**/*.{ts,tsx}', 'agents/**/*.mjs'],
    ignores: ['**/*.test.ts', '**/*.generated.ts'],
    rules: {
      'max-lines': ['error', { max: 800 }],
      'max-lines-per-function': ['error', { max: 120 }],
    },
  },
);
