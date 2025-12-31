/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/lib/core.js
type: application/javascript
module-type: library

CM6 core adapter for the BTC CM6 engine.

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

var state = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-state.js");
var view = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-view.js");
var commands = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-commands.js");
var language = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-language.js");
var autocomplete = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-autocomplete.js");

var langHtml = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/codemirror-lang-html.js");

// Lezer
var lezerCommon = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lezer-common.js");
var lezerHighlight = safeRequire("$:/plugins/BTC/tiddlywiki-codemirror-6/lib/lezer-highlight.js");

// Basic validation: engine expects state + view at minimum
if (!state || !view) {
	throw new Error(
		"library-core.js: Missing CM6 core modules. " +
		"Expected at least codemirror-state.js and codemirror-view.js under $:/plugins/BTC/tiddlywiki-codemirror-6/lib/."
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
