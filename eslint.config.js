import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        NodeJS: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      sonarjs: sonarjs,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      ...sonarjs.configs.recommended.rules,

      // ========================================================================
      // STRICT RULES - These are ERRORS and MUST be fixed
      // See CLAUDE.md for enforcement policy
      // ========================================================================

      // Type safety - ERRORS (no any, proper types required)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',

      // Dead code - ERRORS (remove unused code)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Promise handling - ERRORS (avoid unhandled promises)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Console usage - ERROR (use logger for diagnostics, Ink for chat UI)
      // Exception: CLI commands (see separate config below)
      'no-console': [
        'error',
        {
          allow: ['warn', 'error'],
        },
      ],

      // ========================================================================
      // COMPLEXITY RULES - These are ERRORS with reasonable thresholds
      // Refactor functions that exceed these limits
      // ========================================================================

      complexity: ['error', { max: 20 }], // Cyclomatic complexity
      'sonarjs/cognitive-complexity': ['error', 20], // Cognitive complexity
      'max-depth': ['error', 5], // Nesting depth
      // Note: 400 is reasonable for React components. ChatInterface.tsx (562 lines) needs refactoring.
      'max-lines-per-function': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 4],
      'max-params': ['error', 6],

      // ========================================================================
      // CODE QUALITY RULES - WARNINGS (fix when possible)
      // ========================================================================

      'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
      'sonarjs/todo-tag': 'off', // Allow TODOs in WIP codebase
      'sonarjs/fixme-tag': 'off', // Allow FIXMEs in WIP codebase
      'no-control-regex': 'warn', // May be intentional for terminal handling

      // ========================================================================
      // DISABLED RULES
      // ========================================================================

      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/only-throw-error': 'warn',
      'no-undef': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'packages/**/tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Note: project not set for tests - some test files not in tsconfig
        // Type-aware rules disabled for tests anyway
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        NodeJS: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        JSX: 'readonly',
        // Vitest globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        test: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      jest: jest,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,

      // Tests have relaxed type-aware rules for mocking
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any in tests for mocking
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error', // Still enforce removing dead code
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/require-await': 'off',
      'no-undef': 'off',
      'no-console': 'off', // Allow console in tests for debugging

      // ========================================================================
      // TEST QUALITY RULES - Discourage shallow assertions
      // These are WARNINGS during prototyping phase - will be promoted to errors
      // when test quality improves.
      //
      // Uses no-restricted-syntax (works with vitest) + jest plugin as backup.
      // Shallow assertions like .toBeDefined(), .toBeTruthy() provide false
      // confidence - prefer specific value checks like .toBe(value).
      // ========================================================================

      // Primary: AST-based detection (works with any test framework)
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.property.name='toBeDefined']",
          message:
            'Avoid .toBeDefined() - use specific assertions like .toBe(value) or .toEqual(expected)',
        },
        {
          selector: "CallExpression[callee.property.name='toBeTruthy']",
          message: 'Avoid .toBeTruthy() - use .toBe(true) or check specific values',
        },
        {
          selector: "CallExpression[callee.property.name='toBeFalsy']",
          message: 'Avoid .toBeFalsy() - use .toBe(false) or check specific falsy values',
        },
      ],

      // Backup: Jest plugin (may not trigger with vitest, but included for compatibility)
      'jest/no-restricted-matchers': [
        'warn',
        {
          toBeDefined:
            'Avoid .toBeDefined() - use specific assertions like .toBe(value) or .toEqual(expected)',
          toBeTruthy: 'Avoid .toBeTruthy() - use .toBe(true) or check specific values',
          toBeFalsy: 'Avoid .toBeFalsy() - use .toBe(false) or check specific falsy values',
          'not.toBeUndefined': 'Avoid .not.toBeUndefined() - use specific value assertions',
          'not.toBeNull': 'Avoid .not.toBeNull() - use specific value assertions',
        },
      ],
    },
  },
  {
    // CLI commands output to terminal - console.log is appropriate here
    files: ['src/**/commands/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', '*.config.ts', '*.config.js'],
  },
  prettier,
];
