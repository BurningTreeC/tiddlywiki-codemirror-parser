/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js
type: application/javascript
module-type: library

CM6 core adapter for the BurningTreeC CM6 engine.

Exports a stable object with namespaces:
- state
- view
- commands
- language
- autocomplete
- (optional) langHtml
- lezerCommon
- lezerHighlight

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

function safeRequire(title) {
	try {
		return require(title);
	} catch (e) {
		return null;
	}
}

var state = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-state.js");
var view = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-view.js");
var commands = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-commands.js");
var language = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-language.js");
var autocomplete = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-autocomplete.js");

var langHtml = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-lang-html.js");

// Lezer
var lezerCommon = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-common.js");
var lezerHighlight = safeRequire("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/lezer-highlight.js");

// Basic validation: engine expects state + view at minimum
if (!state || !view) {
	throw new Error(
		"library-core.js: Missing CM6 core modules. " +
		"Expected at least codemirror-state.js and codemirror-view.js under $:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/."
	);
}

exports.state = state;
exports.view = view;
exports.commands = commands || {};
exports.language = language || {};
exports.autocomplete = autocomplete || {};
exports.langHtml = langHtml || {};

exports.lezerCommon = lezerCommon || {};
exports.lezerHighlight = lezerHighlight || {};

// Convenience re-exports (optional, but handy)
exports.EditorState = state.EditorState;
exports.Compartment = state.Compartment;
exports.EditorView = view.EditorView;
exports.keymap = view.keymap;
