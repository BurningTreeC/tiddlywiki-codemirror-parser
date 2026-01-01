/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/register.js
type: application/javascript
module-type: startup

Register TiddlyWiki language with CodeMirror 6 core for code block highlighting.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-tiddlywiki";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langTw = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/lang-tiddlywiki.js");

	if (!core || !core.registerLanguage || !langTw || !langTw.tiddlywiki) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register TiddlyWiki wikitext
	core.registerLanguage(LanguageDescription.of({
		name: "TiddlyWiki",
		alias: ["tiddlywiki", "wikitext", "tw", "tw5"],
		extensions: ["tid"],
		support: langTw.tiddlywiki()
	}));
};
