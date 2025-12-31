import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

// External dependencies that should not be bundled
const external = [
  '@lezer/common',
  '@lezer/highlight',
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/language',
  '@codemirror/commands',
  '@codemirror/autocomplete',
  '@codemirror/lang-html'
];

// Common plugins
const plugins = [
  resolve(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false
  })
];

export default [
  // Parser only (Lezer-style parser without CodeMirror integration)
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/parser.js',
        format: 'es',
        sourcemap: true
      },
      {
        file: 'dist/parser.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      }
    ],
    external,
    plugins
  },

  // Full CodeMirror integration
  {
    input: 'src/codemirror-index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'es',
        sourcemap: true
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      }
    ],
    external,
    plugins
  },

  // Type definitions for parser
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/parser.d.ts',
      format: 'es'
    },
    external,
    plugins: [dts()]
  },

  // Type definitions for full package
  {
    input: 'src/codemirror-index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es'
    },
    external,
    plugins: [dts()]
  }
];
