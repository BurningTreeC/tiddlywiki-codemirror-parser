/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-html/plugin.js
type: application/javascript
module-type: codemirror6-plugin

HTML language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Use the HTML language from the core lib (already bundled)
var langHtml = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/codemirror-lang-html.js");

// Content types that activate this plugin
var HTML_TYPES = [
	"text/html",
	"text/xhtml"
];

exports.plugin = {
	name: "lang-html",
	description: "HTML syntax highlighting",
	priority: 50,

	condition: function(context) {
		var type = context.tiddlerType;
		return HTML_TYPES.indexOf(type) !== -1;
	},

	getExtensions: function(context) {
		return [langHtml.html()];
	}
};
