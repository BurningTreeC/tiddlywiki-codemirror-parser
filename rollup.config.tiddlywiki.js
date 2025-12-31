/**
 * Rollup config for TiddlyWiki5 Plugin Bundle (no IIFE wrapper)
 *
 * Produces a CommonJS module for TiddlyWiki's module system
 * (module-type: codemirror6-plugin).
 */
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

// Banner for TiddlyWiki module
const banner = `/*\\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/lang-tiddlywiki.js
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

const twPaths = {
  "@codemirror/state":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-state.js",
  "@codemirror/view":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-view.js",
  "@codemirror/language":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-language.js",
  "@codemirror/commands":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-commands.js",
  "@codemirror/autocomplete":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-autocomplete.js",
  "@codemirror/lang-html":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-lang-html.js",
  "@lezer/common": "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-common.js",
  "@lezer/highlight":
    "$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-highlight.js"
};

const external = Object.keys(twPaths);

export default {
  input: "src/tiddlywiki-plugin-entry.ts",
  external,
  output: {
    file: "dist/tiddlywiki-plugin/lang-tiddlywiki.js",
    format: "cjs", // <- CommonJS (no (function(){ ... })(); IIFE)
    exports: "named",
    sourcemap: false,
    banner,
    paths: twPaths,
    // keep the output closer to TW's expectations
    esModule: false
  },
  plugins: [
    resolve({
      extensions: [".mjs", ".js", ".json", ".ts"]
    }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
      declarationMap: false
    })
  ]
};
