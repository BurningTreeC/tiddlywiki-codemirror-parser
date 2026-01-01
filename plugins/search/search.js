/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/search.js
type: application/javascript
module-type: codemirror6-plugin

Search and replace plugin - adds search panel and find/replace APIs.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.plugin = {
	name: "search",
	description: "Search and replace functionality",
	priority: 800,
	
	// Load if search option is not explicitly disabled
	condition: function(context) {
		return context.options.search !== false;
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		
		// Search keymap
		var searchKeymap = (core.search || {}).searchKeymap;
		var keymap = core.view.keymap;
		if (searchKeymap && keymap) {
			extensions.push(keymap.of(searchKeymap));
		}
		
		// Highlight selection matches
		var highlightSelectionMatches = (core.search || {}).highlightSelectionMatches;
		if (highlightSelectionMatches && context.options.highlightSelectionMatches !== false) {
			extensions.push(highlightSelectionMatches());
		}
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		var core = this._core;
		var openSearchPanel = (core.search || {}).openSearchPanel;
		var closeSearchPanel = (core.search || {}).closeSearchPanel;
		var findNext = (core.search || {}).findNext;
		var findPrevious = (core.search || {}).findPrevious;
		var selectMatches = (core.search || {}).selectMatches;
		var replaceNext = (core.search || {}).replaceNext;
		var replaceAll = (core.search || {}).replaceAll;
		var gotoLine = (core.search || {}).gotoLine;
		var selectNextOccurrence = (core.search || {}).selectNextOccurrence;
		
		return {
			// ==== Search Panel API ====
			
			openSearchPanel: function() {
				if (this._destroyed || !openSearchPanel) return;
				openSearchPanel(this.view);
			},
			
			closeSearchPanel: function() {
				if (this._destroyed || !closeSearchPanel) return;
				closeSearchPanel(this.view);
			},
			
			// ==== Find API ====
			
			findNext: function() {
				if (this._destroyed || !findNext) return false;
				return findNext(this.view);
			},
			
			findPrevious: function() {
				if (this._destroyed || !findPrevious) return false;
				return findPrevious(this.view);
			},
			
			selectAllMatches: function() {
				if (this._destroyed || !selectMatches) return false;
				return selectMatches(this.view);
			},
			
			selectNextOccurrence: function() {
				if (this._destroyed || !selectNextOccurrence) return false;
				return selectNextOccurrence(this.view);
			},
			
			// ==== Replace API ====
			
			replaceNext: function() {
				if (this._destroyed || !replaceNext) return false;
				return replaceNext(this.view);
			},
			
			replaceAll: function() {
				if (this._destroyed || !replaceAll) return false;
				return replaceAll(this.view);
			},
			
			// ==== Goto Line ====
			
			gotoLine: function() {
				if (this._destroyed || !gotoLine) return false;
				return gotoLine(this.view);
			}
		};
	}
};

})();
