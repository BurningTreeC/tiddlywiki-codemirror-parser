/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/fold.js
type: application/javascript
module-type: codemirror6-plugin

Code folding plugin - adds fold gutter and folding APIs.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.plugin = {
	name: "fold",
	description: "Code folding functionality",
	priority: 700,
	
	// Load if foldGutter option is enabled
	condition: function(context) {
		return !!context.options.foldGutter;
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	registerCompartments: function() {
		var core = this._core;
		var Compartment = core.state.Compartment;
		
		return {
			foldGutter: new Compartment()
		};
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		var engine = context.engine;
		var compartments = engine._compartments;
		
		// Fold gutter
		var foldGutter = (core.language || {}).foldGutter;
		if (compartments.foldGutter && foldGutter) {
			extensions.push(
				compartments.foldGutter.of(foldGutter())
			);
		}
		
		// Fold keymap
		var foldKeymap = (core.language || {}).foldKeymap;
		var keymap = core.view.keymap;
		if (foldKeymap && keymap) {
			extensions.push(keymap.of(foldKeymap));
		}
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		var core = this._core;
		var foldCode = (core.language || {}).foldCode;
		var unfoldCode = (core.language || {}).unfoldCode;
		var foldAll = (core.language || {}).foldAll;
		var unfoldAll = (core.language || {}).unfoldAll;
		var foldGutter = (core.language || {}).foldGutter;
		var foldEffect = (core.language || {}).foldEffect;
		var unfoldEffect = (core.language || {}).unfoldEffect;
		var foldedRanges = (core.language || {}).foldedRanges;
		var foldable = (core.language || {}).foldable;
		
		return {
			// ==== Fold API ====
			
			foldAt: function(pos) {
				if (this._destroyed || !foldCode) return false;
				// foldCode folds at cursor position
				if (pos !== undefined) {
					this.setCursor(pos);
				}
				return foldCode(this.view);
			},
			
			unfoldAt: function(pos) {
				if (this._destroyed || !unfoldCode) return false;
				if (pos !== undefined) {
					this.setCursor(pos);
				}
				return unfoldCode(this.view);
			},
			
			foldAll: function() {
				if (this._destroyed || !foldAll) return false;
				return foldAll(this.view);
			},
			
			unfoldAll: function() {
				if (this._destroyed || !unfoldAll) return false;
				return unfoldAll(this.view);
			},
			
			toggleFold: function(pos) {
				if (this._destroyed) return false;
				
				// Try to unfold first, if that fails, fold
				if (unfoldCode && unfoldCode(this.view)) {
					return true;
				}
				if (foldCode) {
					return foldCode(this.view);
				}
				return false;
			},
			
			// ==== Configuration ====
			
			setFoldGutter: function(show) {
				if (this._destroyed || !foldGutter) return;
				this.reconfigure("foldGutter", show ? foldGutter() : []);
			},
			
			// ==== Query API ====
			
			isFoldable: function(pos) {
				if (this._destroyed || !foldable) return false;
				var line = this.view.state.doc.lineAt(pos);
				return foldable(this.view.state, line.from, line.to) !== null;
			},
			
			getFoldedRanges: function() {
				if (this._destroyed || !foldedRanges) return [];
				var ranges = [];
				var iter = foldedRanges(this.view.state).iter();
				while (iter.value) {
					ranges.push({ from: iter.from, to: iter.to });
					iter.next();
				}
				return ranges;
			}
		};
	}
};

})();
