import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = [
  '@lezer/common',
  '@lezer/highlight'
];

const plugins = [
  resolve(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false
  })
];

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/parser.js',
      format: 'es',
      sourcemap: true
    },
    external,
    plugins
  },

  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/parser.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins
  },

  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/parser.d.ts',
      format: 'es'
    },
    external,
    plugins: [dts()]
  }
];
