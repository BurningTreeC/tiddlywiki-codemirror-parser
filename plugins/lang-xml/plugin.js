/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-xml/plugin.js
type: application/javascript
module-type: codemirror6-plugin

XML language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langXml = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-xml/lang-xml.js");

// Content types that activate this plugin
var XML_TYPES = [
	"text/xml",
	"application/xml",
	"image/svg+xml"
];

exports.plugin = {
	name: "lang-xml",
	description: "XML syntax highlighting",
	priority: 50,

	condition: function(context) {
		var type = context.tiddlerType;
		return XML_TYPES.indexOf(type) !== -1;
	},

	getExtensions: function(context) {
		return [langXml.xml()];
	}
};
