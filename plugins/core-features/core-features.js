/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/core-features.js
type: application/javascript
module-type: codemirror6-plugin

Core editor features plugin - adds history, selection, cursor, and document APIs.

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.plugin = {
	name: "core-features",
	description: "Core editor features: history, selection, cursor, document manipulation",
	priority: 1000, // Load first
	
	// Always load
	condition: function(context) {
		return true;
	},
	
	// Register compartments for configurable features
	registerCompartments: function() {
		var core = this._core;
		var Compartment = core.state.Compartment;

		return {
			lineWrapping: new Compartment(),
			placeholder: new Compartment()
		};
	},
	
	// Initialize with core reference
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	// Get extensions based on options
	getExtensions: function(context) {
		var core = this._core;
		var options = context.options;
		var extensions = [];
		var engine = context.engine;
		var compartments = engine._compartments;
		
		// History
		var history = (core.history || {}).history;
		if (typeof history === "function") {
			extensions.push(history());
		}
		
		// History keymap
		var historyKeymap = (core.history || {}).historyKeymap;
		var keymap = core.view.keymap;
		if (historyKeymap && keymap) {
			extensions.push(keymap.of(historyKeymap));
		}

		// Line wrapping
		var EditorView = core.view.EditorView;
		if (compartments.lineWrapping) {
			extensions.push(
				compartments.lineWrapping.of(
					options.lineWrapping ? EditorView.lineWrapping : []
				)
			);
		}

		// Placeholder
		var placeholder = (core.view || {}).placeholder;
		if (compartments.placeholder && placeholder && options.placeholder) {
			extensions.push(
				compartments.placeholder.of(placeholder(options.placeholder))
			);
		}
		
		// Basic view features
		var highlightSpecialChars = (core.view || {}).highlightSpecialChars;
		var drawSelection = (core.view || {}).drawSelection;
		var dropCursor = (core.view || {}).dropCursor;
		var rectangularSelection = (core.view || {}).rectangularSelection;
		
		if (highlightSpecialChars) extensions.push(highlightSpecialChars());
		if (drawSelection) extensions.push(drawSelection());
		if (dropCursor) extensions.push(dropCursor());
		if (rectangularSelection) extensions.push(rectangularSelection());
		
		return extensions;
	},
	
	// Extend engine API
	extendAPI: function(engine, context) {
		var core = this._core;
		var undo = (core.history || {}).undo;
		var redo = (core.history || {}).redo;
		var undoDepth = (core.history || {}).undoDepth;
		var redoDepth = (core.history || {}).redoDepth;
		var placeholder = (core.view || {}).placeholder;
		var EditorView = core.view.EditorView;
		
		function isNumber(n) {
			return typeof n === "number" && isFinite(n);
		}
		
		function clamp(n, min, max) {
			return Math.max(min, Math.min(max, n));
		}
		
		return {
			// ==== History API ====
			
			undo: function() {
				if (this._destroyed || !undo) return;
				undo(this.view);
			},
			
			redo: function() {
				if (this._destroyed || !redo) return;
				redo(this.view);
			},
			
			getUndoDepth: function() {
				if (this._destroyed || !undoDepth) return 0;
				return undoDepth(this.view.state);
			},
			
			getRedoDepth: function() {
				if (this._destroyed || !redoDepth) return 0;
				return redoDepth(this.view.state);
			},
			
			canUndo: function() {
				return this.getUndoDepth() > 0;
			},
			
			canRedo: function() {
				return this.getRedoDepth() > 0;
			},
			
			// ==== Selection API ====
			
			getSelection: function() {
				if (this._destroyed) return { from: 0, to: 0, text: "", isEmpty: true };
				
				var sel = this.view.state.selection.main;
				return {
					from: sel.from,
					to: sel.to,
					anchor: sel.anchor,
					head: sel.head,
					text: this.view.state.doc.sliceString(sel.from, sel.to),
					isEmpty: sel.empty
				};
			},
			
			setSelection: function(anchor, head) {
				if (this._destroyed) return;
				if (head === undefined) head = anchor;
				
				var len = this.view.state.doc.length;
				this.view.dispatch({
					selection: {
						anchor: clamp(anchor, 0, len),
						head: clamp(head, 0, len)
					}
				});
			},
			
			getCursor: function() {
				if (this._destroyed) return 0;
				return this.view.state.selection.main.head;
			},
			
			setCursor: function(pos) {
				this.setSelection(pos, pos);
			},
			
			selectAll: function() {
				if (this._destroyed) return;
				this.setSelection(0, this.view.state.doc.length);
			},
			
			replaceSelection: function(text, select) {
				if (this._destroyed) return;
				
				var sel = this.view.state.selection.main;
				var from = sel.from;
				
				var transaction = {
					changes: { from: sel.from, to: sel.to, insert: text }
				};
				
				if (select === "around") {
					transaction.selection = { anchor: from, head: from + text.length };
				} else if (select === "start") {
					transaction.selection = { anchor: from };
				} else {
					transaction.selection = { anchor: from + text.length };
				}
				
				this.view.dispatch(transaction);
			},
			
			// ==== Document API ====
			
			getLineCount: function() {
				if (this._destroyed) return 0;
				return this.view.state.doc.lines;
			},
			
			getLine: function(lineNumber) {
				if (this._destroyed) return "";
				try {
					return this.view.state.doc.line(lineNumber).text;
				} catch (e) {
					return "";
				}
			},
			
			getRange: function(from, to) {
				if (this._destroyed) return "";
				return this.view.state.doc.sliceString(from, to);
			},
			
			replaceRange: function(from, to, text) {
				if (this._destroyed) return;
				this.view.dispatch({
					changes: { from: from, to: to, insert: text }
				});
			},
			
			insert: function(text, pos) {
				if (this._destroyed) return;
				if (pos === undefined) {
					pos = this.view.state.selection.main.head;
				}
				this.view.dispatch({
					changes: { from: pos, insert: text },
					selection: { anchor: pos + text.length }
				});
			},
			
			// ==== Position API ====
			
			posToLineCol: function(pos) {
				if (this._destroyed) return { line: 1, column: 1 };
				
				var line = this.view.state.doc.lineAt(pos);
				return {
					line: line.number,
					column: pos - line.from + 1
				};
			},
			
			lineColToPos: function(line, column) {
				if (this._destroyed) return 0;
				
				try {
					var lineObj = this.view.state.doc.line(line);
					return lineObj.from + Math.min(column - 1, lineObj.length);
				} catch (e) {
					return 0;
				}
			},
			
			getWordAt: function(pos) {
				if (this._destroyed) return { from: pos, to: pos, text: "" };
				
				var doc = this.view.state.doc;
				var line = doc.lineAt(pos);
				var text = line.text;
				var lineStart = line.from;
				var localPos = pos - lineStart;
				
				var wordChars = /[\w$]/;
				var start = localPos;
				var end = localPos;
				
				while (start > 0 && wordChars.test(text[start - 1])) start--;
				while (end < text.length && wordChars.test(text[end])) end++;
				
				return {
					from: lineStart + start,
					to: lineStart + end,
					text: text.slice(start, end)
				};
			},
			
			// ==== Scroll API ====
			
			scrollTo: function(pos) {
				if (this._destroyed) return;
				this.view.dispatch({
					effects: EditorView.scrollIntoView(pos, { y: "center" })
				});
			},
			
			scrollCursorIntoView: function() {
				if (this._destroyed) return;
				this.scrollTo(this.getCursor());
			},
			
			scrollToLine: function(line) {
				if (this._destroyed) return;
				try {
					var lineObj = this.view.state.doc.line(line);
					this.scrollTo(lineObj.from);
				} catch (e) {}
			},
			
			// ==== Configuration API ====

			setLineWrapping: function(wrap) {
				if (this._destroyed) return;
				this.reconfigure("lineWrapping", wrap ? EditorView.lineWrapping : []);
			},
			
			setPlaceholder: function(text) {
				if (this._destroyed || !placeholder) return;
				this.reconfigure("placeholder", text ? placeholder(text) : []);
			}
		};
	}
};
