/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-latex/plugin.js
type: application/javascript
module-type: codemirror6-plugin

LaTeX language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langLatex = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-latex/lang-latex.js");

// Content types that activate this plugin
var LATEX_TYPES = [
	"text/x-latex",
	"text/x-tex",
	"application/x-latex",
	"application/x-tex"
];

var TAGS_CONFIG_TIDDLER = "$:/config/codemirror-6/lang-latex/tags";
var hasConfiguredTag = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/utils.js").hasConfiguredTag;

exports.plugin = {
	name: "lang-latex",
	description: "LaTeX syntax highlighting",
	priority: 50,

	init: function(cm6Core) {
		this._core = cm6Core;
	},

	registerCompartments: function() {
		var Compartment = this._core.state.Compartment;
		return {
			latexLanguage: new Compartment()
		};
	},

	condition: function(context) {
		if (hasConfiguredTag(context, TAGS_CONFIG_TIDDLER)) {
			return true;
		}
		var type = context.tiddlerType;
		return LATEX_TYPES.indexOf(type) !== -1;
	},

	getCompartmentContent: function(context) {
		return [langLatex.latex()];
	},

	getExtensions: function(context) {
		var compartments = context.engine._compartments;
		if (compartments.latexLanguage) {
			return [compartments.latexLanguage.of(this.getCompartmentContent(context))];
		}
		return this.getCompartmentContent(context);
	}
};
