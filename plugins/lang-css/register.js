/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-css/register.js
type: application/javascript
module-type: startup

Register CSS language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-css";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langCss = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-css/lang-css.js");

	if (!core || !core.registerLanguage || !langCss) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register CSS
	core.registerLanguage(LanguageDescription.of({
		name: "CSS",
		alias: ["css"],
		extensions: ["css"],
		support: langCss.css()
	}));
};
