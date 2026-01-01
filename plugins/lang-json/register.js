/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-json/register.js
type: application/javascript
module-type: startup

Register JSON language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-json";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langJson = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-json/lang-json.js");

	if (!core || !core.registerLanguage || !langJson) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register JSON
	core.registerLanguage(LanguageDescription.of({
		name: "JSON",
		alias: ["json", "json5"],
		extensions: ["json", "map"],
		support: langJson.json()
	}));
};
