/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-python/register.js
type: application/javascript
module-type: startup

Register Python language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-python";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langPython = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-python/lang-python.js");

	if (!core || !core.registerLanguage || !langPython) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register Python
	core.registerLanguage(LanguageDescription.of({
		name: "Python",
		alias: ["python", "py"],
		extensions: ["py", "pyw", "pyi"],
		support: langPython.python()
	}));
};
