/**
 * Rollup config for TiddlyWiki5 Plugin Bundle
 * 
 * This creates a standalone bundle that includes all CodeMirror dependencies
 * for use in TiddlyWiki5 as a plugin module.
 */
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

// Banner for TiddlyWiki module
const banner = `/*\\
title: $:/plugins/prtw/codemirror-tiddlywiki/lib/lang-tiddlywiki.js
type: application/javascript
module-type: library

TiddlyWiki5 language support for CodeMirror 6
Built with Rollup - DO NOT EDIT DIRECTLY

@license MIT
\\*/
(function(){
"use strict";
`;

const footer = `
})();
`;

export default {
  input: 'src/codemirror-index.ts',
  output: {
    file: 'dist/tiddlywiki-plugin/lang-tiddlywiki.js',
    format: 'iife',
    name: 'LangTiddlyWiki',
    sourcemap: false,
    banner,
    footer,
    globals: {
      // These will be provided by TiddlyWiki's CM6 core bundle
      '@codemirror/state': 'CM6.state',
      '@codemirror/view': 'CM6.view',
      '@codemirror/language': 'CM6.language',
      '@codemirror/commands': 'CM6.commands',
      '@codemirror/autocomplete': 'CM6.autocomplete',
      '@codemirror/lang-html': 'CM6.langHtml',
      '@lezer/common': 'CM6.lezer.common',
      '@lezer/highlight': 'CM6.lezer.highlight'
    }
  },
  external: [
    '@codemirror/state',
    '@codemirror/view', 
    '@codemirror/language',
    '@codemirror/commands',
    '@codemirror/autocomplete',
    '@codemirror/lang-html',
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
