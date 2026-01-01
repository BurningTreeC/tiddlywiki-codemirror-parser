/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-css/plugin.js
type: application/javascript
module-type: codemirror6-plugin

CSS language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langCss = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-css/lang-css.js");

// Content types that activate this plugin
var CSS_TYPES = [
	"text/css"
];

exports.plugin = {
	name: "lang-css",
	description: "CSS syntax highlighting",
	priority: 50,

	condition: function(context) {
		var type = context.tiddlerType;
		return CSS_TYPES.indexOf(type) !== -1;
	},

	getExtensions: function(context) {
		return [langCss.css()];
	}
};
