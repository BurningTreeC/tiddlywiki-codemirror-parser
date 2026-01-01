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

	init: function(cm6Core) {
		this._core = cm6Core;
	},

	registerCompartments: function() {
		var Compartment = this._core.state.Compartment;
		return {
			htmlLanguage: new Compartment()
		};
	},

	condition: function(context) {
		var type = context.tiddlerType;
		return HTML_TYPES.indexOf(type) !== -1;
	},

	getCompartmentContent: function(context) {
		return [langHtml.html()];
	},

	getExtensions: function(context) {
		var compartments = context.engine._compartments;
		if (compartments.htmlLanguage) {
			return [compartments.htmlLanguage.of(this.getCompartmentContent(context))];
		}
		return this.getCompartmentContent(context);
	}
};
