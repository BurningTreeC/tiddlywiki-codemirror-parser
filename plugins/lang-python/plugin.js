/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-python/plugin.js
type: application/javascript
module-type: codemirror6-plugin

Python language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langPython = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-python/lang-python.js");

// Content types that activate this plugin
var PYTHON_TYPES = [
	"text/x-python",
	"application/x-python"
];

exports.plugin = {
	name: "lang-python",
	description: "Python syntax highlighting",
	priority: 50,

	condition: function(context) {
		var type = context.tiddlerType;
		return PYTHON_TYPES.indexOf(type) !== -1;
	},

	getExtensions: function(context) {
		return [langPython.python()];
	}
};
