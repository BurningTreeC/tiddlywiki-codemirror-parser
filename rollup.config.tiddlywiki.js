/**
 * Rollup config for TiddlyWiki5 Plugin Bundle
 * 
 * This creates a CommonJS bundle that can be required from TiddlyWiki's
 * module system via the codemirror6-plugin module-type.
 */
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

// Banner for TiddlyWiki module
const banner = `/*\\
title: $:/plugins/prtw/codemirror-tiddlywiki/lang-tiddlywiki.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki5 language support for CodeMirror 6
Built with Rollup - DO NOT EDIT DIRECTLY

@license MIT
\\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
`;

export default {
  input: 'src/tiddlywiki-plugin-entry.ts',
  output: {
    file: 'dist/tiddlywiki-plugin/lang-tiddlywiki.js',
    format: 'cjs',
    exports: 'named',
    sourcemap: false,
    banner,
    // Rewrite requires to use TiddlyWiki's module system
    paths: {
      '@codemirror/state': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-state.js',
      '@codemirror/view': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-view.js',
      '@codemirror/language': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-language.js',
      '@codemirror/commands': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-commands.js',
      '@codemirror/autocomplete': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-autocomplete.js',
      '@lezer/common': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lezer-common.js',
      '@lezer/highlight': '$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lezer-highlight.js'
    }
  },
  external: [
    '@codemirror/state',
    '@codemirror/view', 
    '@codemirror/language',
    '@codemirror/commands',
    '@codemirror/autocomplete',
    '@lezer/common',
    '@lezer/highlight'
  ],
  plugins: [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false
    })
  ]
};
