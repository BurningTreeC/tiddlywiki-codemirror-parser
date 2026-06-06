/**
 * Consolidated Rollup config for all TiddlyWiki5 CodeMirror 6 plugins
 *
 * Builds:
 * - lang-tiddlywiki (custom parser)
 * - Core CM6 libraries
 * - Language plugins
 * - Keymap plugins
 * - Search module
 * - Lint module
 */
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

const PLUGIN_ROOT = process.env.TW_PLUGIN_OUTPUT_DIR || (
	process.env.CI
		? "dist/tiddlywiki-plugin/plugins/tiddlywiki"
		: "../TiddlyWiki5/plugins/tiddlywiki"
);

// Output directory for main combined plugin
const OUTPUT_DIR = `${PLUGIN_ROOT}/codemirror-6`;

// Output directory for separate optional plugins
const SEPARATE_PLUGINS_DIR = PLUGIN_ROOT;

// TiddlyWiki module paths for external dependencies
const twPaths = {
  "@codemirror/state": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-state.js",
  "@codemirror/view": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-view.js",
  "@codemirror/commands": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-commands.js",
  "@codemirror/language": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-language.js",
  "@codemirror/autocomplete": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-autocomplete.js",
  "@codemirror/lang-html": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-lang-html.js",
  "@codemirror/search": "$:/plugins/tiddlywiki/codemirror-6/lib/codemirror-search.js",
  "@lezer/common": "$:/plugins/tiddlywiki/codemirror-6/lib/lezer-common.js",
  "@lezer/highlight": "$:/plugins/tiddlywiki/codemirror-6/lib/lezer-highlight.js"
};

// Terser config to preserve TiddlyWiki metadata comments
const terserConfig = {
  format: {
    comments: function(node, comment) {
      return comment.type === "comment2" && /^\\/.test(comment.value);
    }
  }
};

// Common plugins for library builds (no TypeScript)
const libraryPlugins = [
  resolve({ browser: true }),
  commonjs(),
  terser(terserConfig)
];

// =============================================================================
// lang-tiddlywiki (custom TypeScript parser with banner)
// =============================================================================
const langTiddlywikiBanner = `/*\\
title: $:/plugins/tiddlywiki/codemirror-6/lang-tiddlywiki/lang-tiddlywiki.js
type: application/javascript
module-type: library

TiddlyWiki5 language support for CodeMirror 6 - library module
Built with Rollup - DO NOT EDIT DIRECTLY

Note: The plugin wrapper is in plugin.js, this is the library it uses.

@license MIT
\\*/
/*jslint node: true, browser: true */
/*global $tw: false */

"use strict";

`;

const langTiddlywikiConfig = {
  input: "src/plugin.ts",
  external: Object.keys(twPaths),
  output: {
    file: `${OUTPUT_DIR}/files/lang-tiddlywiki/lang-tiddlywiki.js`,
    format: "cjs",
    exports: "named",
    sourcemap: false,
    banner: langTiddlywikiBanner,
    paths: twPaths,
    esModule: false
  },
  plugins: [
    resolve({ extensions: [".mjs", ".js", ".json", ".ts"] }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
      declarationMap: false
    }),
    terser(terserConfig)
  ]
};

// =============================================================================
// Core CM6 libraries (no banner)
// =============================================================================
const coreLibs = [
  { name: "codemirror-state", input: "@codemirror/state" },
  { name: "codemirror-view", input: "@codemirror/view" },
  { name: "codemirror-commands", input: "@codemirror/commands" },
  { name: "codemirror-language", input: "@codemirror/language" },
  { name: "codemirror-autocomplete", input: "@codemirror/autocomplete" },
  { name: "codemirror-lang-html", input: "@codemirror/lang-html" },
  { name: "lezer-common", input: "@lezer/common" },
  { name: "lezer-highlight", input: "@lezer/highlight" }
];

function externalsForLib(libName) {
  const all = Object.keys(twPaths);
  const selfPkg =
    libName.startsWith("codemirror-") ? "@codemirror/" + libName.replace("codemirror-", "")
    : libName.startsWith("lezer-") ? "@lezer/" + libName.replace("lezer-", "")
    : null;
  return all.filter((pkg) => pkg !== selfPkg);
}

const coreLibConfigs = coreLibs.map((lib) => ({
  input: lib.input,
  external: externalsForLib(lib.name),
  output: {
    file: `${OUTPUT_DIR}/files/editor/lib/${lib.name}.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
}));

// =============================================================================
// Language plugins (no banner)
// =============================================================================
// Combined languages - bundled inside the main codemirror-6 plugin
const combinedLanguages = [
  { name: "javascript", input: "@codemirror/lang-javascript" },
  // CSS uses a wrapper to expose getCSSProperties and getCSSValues for style.* completion
  { name: "css", input: "./src/lang-css-wrapper.js" },
  { name: "json", input: "@codemirror/lang-json" },
  { name: "markdown", input: "@codemirror/lang-markdown" },
  { name: "xml", input: "@codemirror/lang-xml" },
  { name: "yaml", input: "@codemirror/lang-yaml" },
  { name: "csv", input: "@cookshack/codemirror-lang-csv" }
];

// Note: HTML is not built separately - lang-html uses the core lib codemirror-lang-html.js

const combinedLanguageConfigs = combinedLanguages.map((lang) => ({
  input: lang.input,
  external: Object.keys(twPaths),
  output: {
    file: `${OUTPUT_DIR}/files/lang-${lang.name}/lang-${lang.name}.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
}));

// Separate languages - each in its own codemirror-6-lang-* plugin
const separateLanguages = [
  { name: "python", input: "@codemirror/lang-python" },
  { name: "sql", input: "@codemirror/lang-sql" },
  { name: "lezer", input: "@codemirror/lang-lezer" },
  { name: "wast", input: "@codemirror/lang-wast" },
  { name: "rust", input: "@codemirror/lang-rust" },
  { name: "sass", input: "@codemirror/lang-sass" },
  { name: "go", input: "@codemirror/lang-go" },
  { name: "php", input: "@codemirror/lang-php" },
  { name: "cpp", input: "@codemirror/lang-cpp" },
  { name: "java", input: "@codemirror/lang-java" },
  { name: "latex", input: "codemirror-lang-latex" }
];

const separateLanguageConfigs = separateLanguages.map((lang) => ({
  input: lang.input,
  external: Object.keys(twPaths),
  output: {
    file: `${SEPARATE_PLUGINS_DIR}/codemirror-6-lang-${lang.name}/files/lang-${lang.name}.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
}));

// =============================================================================
// Keymap plugins (no banner)
// =============================================================================
const keymaps = [
  { name: "vim", input: "@replit/codemirror-vim" },
  { name: "emacs", input: "@replit/codemirror-emacs" }
];

const keymapConfigs = keymaps.map((keymap) => ({
  input: keymap.input,
  external: Object.keys(twPaths),
  output: {
    file: `${SEPARATE_PLUGINS_DIR}/codemirror-6-keymap-${keymap.name}/files/codemirror-${keymap.name}.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
}));

// =============================================================================
// Search module (no banner)
// =============================================================================
const searchConfig = {
  input: "@codemirror/search",
  external: Object.keys(twPaths).filter(k => k !== "@codemirror/search"),
  output: {
    file: `${OUTPUT_DIR}/files/editor/lib/codemirror-search.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
};

// =============================================================================
// Lint module (no banner)
// =============================================================================
const lintConfig = {
  input: "@codemirror/lint",
  external: Object.keys(twPaths).filter(k => k !== "@codemirror/lint"),
  output: {
    file: `${SEPARATE_PLUGINS_DIR}/codemirror-6-lint/files/codemirror-lint.js`,
    format: "cjs",
    exports: "named",
    paths: twPaths,
    esModule: false
  },
  plugins: libraryPlugins
};

// =============================================================================
// Export all configs
// =============================================================================
export default [
  langTiddlywikiConfig,
  ...coreLibConfigs,
  ...combinedLanguageConfigs,
  ...separateLanguageConfigs,
  ...keymapConfigs,
  searchConfig,
  lintConfig
];
