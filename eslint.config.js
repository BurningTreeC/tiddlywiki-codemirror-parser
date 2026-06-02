import eslint from '@eslint/js';

export default [
  eslint.configs.recommended,
  {
    ignores: [
      'dist/',
      'node_modules/',
      // Ignore bundled library files
      '**/files/lang-*.js',
      '**/files/lang-*.cjs',
      '**/files/codemirror-*.js',
      '**/files/lezer-*.js',
      '**/files/lib/*.js',
      // Ignore bundled single-file plugins
      '**/files/auto-close-tags.js',
      '**/files/color-picker.js',
      '**/files/word-count.js',
      '**/files/search.js',
      '**/files/fold.js',
      '**/files/emoji-picker.js',
      '**/files/image-preview.js',
      '**/files/line-numbers.js',
      // Ignore TiddlyWiki module files (use return outside function)
      '**/files/widgets/**/*.js',
      '**/keymap-*/files/plugin.js',
      // Also ignore from parser directory
      '../BTC-TiddlyWiki5/plugins/codemirror-6/**/files/lang-*.js',
      '../BTC-TiddlyWiki5/plugins/codemirror-6/**/files/lang-*.cjs',
      '../BTC-TiddlyWiki5/plugins/codemirror-6/**/files/codemirror-*.js',
      '../BTC-TiddlyWiki5/plugins/codemirror-6/**/files/lezer-*.js',
      '../BTC-TiddlyWiki5/plugins/codemirror-6/**/files/lib/*.js'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        // TiddlyWiki globals
        $tw: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Event: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        Text: 'readonly',
        Range: 'readonly',
        Selection: 'readonly',
        DOMParser: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        globalThis: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Symbol: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        RegExp: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        isFinite: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-undef': 'error',
      'no-redeclare': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off'
    }
  }
];
