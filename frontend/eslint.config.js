import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat config for the studio frontend. The point of this file is the
// react-hooks rules — a dependency list that drifts from what an effect reads
// is exactly the class of bug that is invisible in review and painful live.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // Injected by vite.config.js `define`.
        __APP_VERSION__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A stale dependency list is a real bug here, not a style point.
      'react-hooks/exhaustive-deps': 'error',
      // This one flags the ordinary fetch-on-mount / fetch-on-visible pattern
      // (an effect calling an async loader that sets `loading`), which the
      // panels use deliberately. The other compiler rules stay on.
      'react-hooks/set-state-in-effect': 'off',
      // `import React` stays in every component for readability even though the
      // automatic JSX runtime does not need it.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^React$',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Empty catch blocks are used deliberately (with a comment) for "best
      // effort" cleanup such as disconnecting an already-disconnected node.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // The AudioWorklet runs in its own global scope, not the page's.
    files: ['public/audioWorklet.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
