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
);
