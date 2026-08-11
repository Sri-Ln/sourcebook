import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Build output and generated types are not ours to lint.
    ignores: ['.output/', '.wxt/', 'node_modules/', 'tests/fixtures/'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: {
        // WXT auto-imports these, so they are legitimately undeclared in source.
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
      },
    },
    rules: {
      // Unused args are often meaningful in DOM and message handlers. Allow the
      // conventional underscore prefix rather than forcing them to be deleted.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
