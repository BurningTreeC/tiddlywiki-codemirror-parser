/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/plugins/syntax.js
type: application/javascript
module-type: codemirror6-plugin

Syntax plugin - adds bracket matching, syntax highlighting, and indentation APIs.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.plugin = {
	name: "syntax",
	description: "Syntax highlighting, bracket matching, and indentation",
	priority: 900,
	
	// Always load
	condition: function(context) {
		return true;
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	registerCompartments: function() {
		var core = this._core;
		var Compartment = core.state.Compartment;
		
		return {
			bracketMatching: new Compartment(),
			closeBrackets: new Compartment(),
			indentUnit: new Compartment()
		};
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		var engine = context.engine;
		var compartments = engine._compartments;
		var options = context.options;
		
		// Bracket matching
		var bracketMatching = (core.language || {}).bracketMatching;
		if (compartments.bracketMatching && bracketMatching) {
			extensions.push(
				compartments.bracketMatching.of(
					options.bracketMatching !== false ? bracketMatching() : []
				)
			);
		}
		
		// Close brackets
		var closeBrackets = (core.autocomplete || {}).closeBrackets;
		if (compartments.closeBrackets && closeBrackets) {
			extensions.push(
				compartments.closeBrackets.of(
					options.closeBrackets ? closeBrackets() : []
				)
			);
		}
		
		// Indent unit
		var indentUnit = (core.language || {}).indentUnit;
		if (compartments.indentUnit && indentUnit) {
			var tabSize = typeof options.tabSize === "number" ? options.tabSize : 4;
			var unit = options.indentWithTabs ? "\t" : " ".repeat(tabSize);
			extensions.push(compartments.indentUnit.of(indentUnit.of(unit)));
		}
		
		// Default syntax highlighting
		var syntaxHighlighting = (core.language || {}).syntaxHighlighting;
		var defaultHighlightStyle = (core.language || {}).defaultHighlightStyle;
		if (syntaxHighlighting && defaultHighlightStyle) {
			extensions.push(syntaxHighlighting(defaultHighlightStyle, { fallback: true }));
		}
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		var core = this._core;
		var bracketMatching = (core.language || {}).bracketMatching;
		var closeBrackets = (core.autocomplete || {}).closeBrackets;
		var indentUnit = (core.language || {}).indentUnit;
		var getIndentUnit = (core.language || {}).getIndentUnit;
		var indentMore = (core.commands || {}).indentMore;
		var indentLess = (core.commands || {}).indentLess;
		var indentSelection = (core.commands || {}).indentSelection;
		var syntaxTree = (core.language || {}).syntaxTree;
		var syntaxTreeAvailable = (core.language || {}).syntaxTreeAvailable;
		
		return {
			// ==== Bracket Matching ====
			
			setBracketMatching: function(enabled) {
				if (this._destroyed || !bracketMatching) return;
				this.reconfigure("bracketMatching", enabled ? bracketMatching() : []);
			},
			
			setCloseBrackets: function(enabled) {
				if (this._destroyed || !closeBrackets) return;
				this.reconfigure("closeBrackets", enabled ? closeBrackets() : []);
			},
			
			// ==== Indentation ====
			
			setIndentUnit: function(unit) {
				if (this._destroyed || !indentUnit) return;
				this.reconfigure("indentUnit", indentUnit.of(unit));
			},
			
			setTabSize: function(size) {
				if (this._destroyed || !indentUnit) return;
				this.reconfigure("indentUnit", indentUnit.of(" ".repeat(size)));
			},
			
			setIndentWithTabs: function(useTabs) {
				if (this._destroyed || !indentUnit) return;
				this.reconfigure("indentUnit", indentUnit.of(useTabs ? "\t" : "    "));
			},
			
			getIndentUnit: function() {
				if (this._destroyed || !getIndentUnit) return 4;
				return getIndentUnit(this.view.state);
			},
			
			indentMore: function() {
				if (this._destroyed || !indentMore) return false;
				return indentMore(this.view);
			},
			
			indentLess: function() {
				if (this._destroyed || !indentLess) return false;
				return indentLess(this.view);
			},
			
			indentSelection: function() {
				if (this._destroyed || !indentSelection) return false;
				return indentSelection(this.view);
			},
			
			// ==== Syntax Tree ====
			
			getSyntaxTree: function() {
				if (this._destroyed || !syntaxTree) return null;
				return syntaxTree(this.view.state);
			},
			
			isSyntaxTreeAvailable: function(upto) {
				if (this._destroyed || !syntaxTreeAvailable) return false;
				return syntaxTreeAvailable(this.view.state, upto);
			},
			
			getNodeAt: function(pos) {
				if (this._destroyed || !syntaxTree) return null;
				var tree = syntaxTree(this.view.state);
				return tree.resolveInner(pos, -1);
			},
			
			getNodeTypeAt: function(pos) {
				var node = this.getNodeAt(pos);
				return node ? node.type.name : null;
			}
		};
	}
};

})();
