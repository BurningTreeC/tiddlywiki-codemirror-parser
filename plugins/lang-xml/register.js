/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-xml/register.js
type: application/javascript
module-type: startup

Register XML language with CodeMirror 6 core.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-xml";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langXml = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-xml/lang-xml.js");

	if (!core || !core.registerLanguage || !langXml) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register XML
	core.registerLanguage(LanguageDescription.of({
		name: "XML",
		alias: ["xml"],
		extensions: ["xml", "xsl", "xsd", "svg"],
		support: langXml.xml()
	}));
};
