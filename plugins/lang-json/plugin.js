/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-json/plugin.js
type: application/javascript
module-type: codemirror6-plugin

JSON language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langJson = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-json/lang-json.js");

// Content types that activate this plugin
var JSON_TYPES = [
	"application/json",
	"text/json"
];

exports.plugin = {
	name: "lang-json",
	description: "JSON syntax highlighting",
	priority: 50,

	init: function(cm6Core) {
		this._core = cm6Core;
	},

	registerCompartments: function() {
		var Compartment = this._core.state.Compartment;
		return {
			jsonLanguage: new Compartment()
		};
	},

	condition: function(context) {
		var type = context.tiddlerType;
		return JSON_TYPES.indexOf(type) !== -1;
	},

	getCompartmentContent: function(context) {
		return [langJson.json()];
	},

	getExtensions: function(context) {
		var compartments = context.engine._compartments;
		if (compartments.jsonLanguage) {
			return [compartments.jsonLanguage.of(this.getCompartmentContent(context))];
		}
		return this.getCompartmentContent(context);
	}
};
