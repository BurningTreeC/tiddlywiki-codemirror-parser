/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-sql/plugin.js
type: application/javascript
module-type: codemirror6-plugin

SQL language support for CodeMirror 6

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var langSql = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-sql/lang-sql.js");

// Content types that activate this plugin
var SQL_TYPES = [
	"application/sql",
	"text/x-sql"
];

exports.plugin = {
	name: "lang-sql",
	description: "SQL syntax highlighting",
	priority: 50,

	init: function(cm6Core) {
		this._core = cm6Core;
	},

	registerCompartments: function() {
		var Compartment = this._core.state.Compartment;
		return {
			sqlLanguage: new Compartment()
		};
	},

	condition: function(context) {
		var type = context.tiddlerType;
		return SQL_TYPES.indexOf(type) !== -1;
	},

	getCompartmentContent: function(context) {
		return [langSql.sql()];
	},

	getExtensions: function(context) {
		var compartments = context.engine._compartments;
		if (compartments.sqlLanguage) {
			return [compartments.sqlLanguage.of(this.getCompartmentContent(context))];
		}
		return this.getCompartmentContent(context);
	}
};
