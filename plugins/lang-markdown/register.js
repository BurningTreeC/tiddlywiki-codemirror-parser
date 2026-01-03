/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-markdown/register.js
type: application/javascript
module-type: startup

Register Markdown language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-markdown";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langMarkdown = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-markdown/lang-markdown.js");

	if (!core || !core.registerLanguage || !langMarkdown) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register Markdown
	core.registerLanguage(LanguageDescription.of({
		name: "Markdown",
		alias: ["markdown", "md"],
		extensions: ["md", "markdown", "mkd"],
		support: langMarkdown.markdown()
	}));
};
