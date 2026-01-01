/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/autocomplete.js
type: application/javascript
module-type: codemirror6-plugin

Autocomplete plugin - adds completion popup and APIs.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.plugin = {
	name: "autocomplete",
	description: "Autocompletion functionality",
	priority: 600,
	
	// Load if autocompletion option is enabled
	condition: function(context) {
		return !!context.options.autocompletion;
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	registerCompartments: function() {
		var core = this._core;
		var Compartment = core.state.Compartment;
		
		return {
			autocompletion: new Compartment()
		};
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		var engine = context.engine;
		var compartments = engine._compartments;
		var options = context.options;
		
		// Autocompletion
		var autocompletion = (core.autocomplete || {}).autocompletion;
		if (compartments.autocompletion && autocompletion) {
			var completionConfig = {};
			
			// Allow custom completion sources via options
			if (options.completionSources) {
				completionConfig.override = options.completionSources;
			}
			
			extensions.push(
				compartments.autocompletion.of(autocompletion(completionConfig))
			);
		}
		
		// Completion keymap
		var completionKeymap = (core.autocomplete || {}).completionKeymap;
		var keymap = core.view.keymap;
		if (completionKeymap && keymap) {
			extensions.push(keymap.of(completionKeymap));
		}
		
		// Close brackets (often bundled with autocomplete)
		var closeBrackets = (core.autocomplete || {}).closeBrackets;
		var closeBracketsKeymap = (core.autocomplete || {}).closeBracketsKeymap;
		if (closeBrackets && options.closeBrackets) {
			extensions.push(closeBrackets());
			if (closeBracketsKeymap && keymap) {
				extensions.push(keymap.of(closeBracketsKeymap));
			}
		}
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		var core = this._core;
		var startCompletion = (core.autocomplete || {}).startCompletion;
		var closeCompletion = (core.autocomplete || {}).closeCompletion;
		var acceptCompletion = (core.autocomplete || {}).acceptCompletion;
		var moveCompletionSelection = (core.autocomplete || {}).moveCompletionSelection;
		var completionStatus = (core.autocomplete || {}).completionStatus;
		var currentCompletions = (core.autocomplete || {}).currentCompletions;
		var selectedCompletion = (core.autocomplete || {}).selectedCompletion;
		var autocompletion = (core.autocomplete || {}).autocompletion;
		
		return {
			// ==== Completion Control API ====
			
			startCompletion: function() {
				if (this._destroyed || !startCompletion) return false;
				return startCompletion(this.view);
			},
			
			closeCompletion: function() {
				if (this._destroyed || !closeCompletion) return false;
				return closeCompletion(this.view);
			},
			
			acceptCompletion: function() {
				if (this._destroyed || !acceptCompletion) return false;
				return acceptCompletion(this.view);
			},
			
			// ==== Completion Navigation ====
			
			moveCompletionUp: function() {
				if (this._destroyed || !moveCompletionSelection) return false;
				return moveCompletionSelection(true)(this.view);
			},
			
			moveCompletionDown: function() {
				if (this._destroyed || !moveCompletionSelection) return false;
				return moveCompletionSelection(false)(this.view);
			},
			
			moveCompletionPageUp: function() {
				if (this._destroyed || !moveCompletionSelection) return false;
				return moveCompletionSelection(true, "page")(this.view);
			},
			
			moveCompletionPageDown: function() {
				if (this._destroyed || !moveCompletionSelection) return false;
				return moveCompletionSelection(false, "page")(this.view);
			},
			
			// ==== Completion Status ====
			
			getCompletionStatus: function() {
				if (this._destroyed || !completionStatus) return null;
				return completionStatus(this.view.state);
			},
			
			isCompletionActive: function() {
				var status = this.getCompletionStatus();
				return status === "active" || status === "pending";
			},
			
			getCurrentCompletions: function() {
				if (this._destroyed || !currentCompletions) return [];
				return currentCompletions(this.view.state) || [];
			},
			
			getSelectedCompletion: function() {
				if (this._destroyed || !selectedCompletion) return null;
				return selectedCompletion(this.view.state);
			},
			
			// ==== Configuration ====
			
			setAutocompletion: function(enabled, config) {
				if (this._destroyed || !autocompletion) return;
				this.reconfigure("autocompletion", enabled ? autocompletion(config || {}) : []);
			}
		};
	}
};

})();
