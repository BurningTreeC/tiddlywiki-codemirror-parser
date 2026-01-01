/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-yaml/plugin.js
type: application/javascript
module-type: codemirror6-plugin

YAML language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langYaml = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-yaml/lang-yaml.js");

// Content types that activate this plugin
var YAML_TYPES = [
	"text/x-yaml",
	"text/yaml",
	"application/x-yaml",
	"application/yaml"
];

exports.plugin = {
	name: "lang-yaml",
	description: "YAML syntax highlighting",
	priority: 50,

	condition: function(context) {
		var type = context.tiddlerType;
		return YAML_TYPES.indexOf(type) !== -1;
	},

	getExtensions: function(context) {
		return [langYaml.yaml()];
	}
};
