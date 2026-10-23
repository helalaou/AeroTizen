// The launcher runs on Samsung's Tizen web runtime (Chromium-based, but older models lag),
// so legacy scripts retain ES5 syntax and compiled Settings targets Chromium 69.
const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');

module.exports = [
  { ignores: ['launcher/js/logos.js'] },
  js.configs.recommended,
  {
    rules: {
      // ES5 has no optional catch binding, so `catch (e) {}` is the idiom.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['launcher/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        ...globals.browser, AeroTizen: 'writable', tizen: 'readonly', webapis: 'readonly',
        Uint8Array: 'readonly', Uint8ClampedArray: 'readonly'
      }
    },
    rules: {
      eqeqeq: 'error',
      curly: 'error',
      'no-var': 'off'
    }
  },
  {
    files: ['launcher/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    plugins: { react },
    // Use React 16 component detection for Preact; React is not a dependency.
    settings: { react: { pragma: 'h', fragment: 'Fragment', version: '16.0' } },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-multi-comp': 'error',
      'react/function-component-definition': ['error', { namedComponents: 'arrow-function' }],
      'no-restricted-syntax': ['error', {
        selector: 'ExportNamedDeclaration > FunctionDeclaration',
        message: 'Export functions as const arrow functions.'
      }, {
        selector: 'ExportNamedDeclaration > VariableDeclaration[kind!="const"]',
        message: 'Use const for named exports.'
      }],
      eqeqeq: 'error',
      curly: 'error'
    }
  },
  {
    files: ['tools/build-launcher.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['launcher/service/**/*.js'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'commonjs',
      globals: { ...globals.node, tizen: 'readonly' }
    }
  }
];
