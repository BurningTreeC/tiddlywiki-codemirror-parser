/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-yaml/register.js
type: application/javascript
module-type: startup

Register YAML language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-yaml";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langYaml = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-yaml/lang-yaml.js");

	if (!core || !core.registerLanguage || !langYaml) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register YAML
	core.registerLanguage(LanguageDescription.of({
		name: "YAML",
		alias: ["yaml", "yml"],
		extensions: ["yaml", "yml"],
		support: langYaml.yaml()
	}));
};
