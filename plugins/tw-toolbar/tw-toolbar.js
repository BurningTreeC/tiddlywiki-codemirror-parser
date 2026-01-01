/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/tw-toolbar.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Toolbar Integration Plugin - connects editor with TW toolbar buttons.

Handles:
- Toolbar button actions
- Text operations from toolbar
- Preview synchronization
- Editor toolbar state

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Operation Handlers
// ============================================================================

/**
 * Map of TiddlyWiki toolbar operations to editor methods
 */
var OPERATION_MAP = {
	// Formatting
	"excise": handleExcise,
	"heading-1": function(e) { return e.setHeading && e.setHeading(1); },
	"heading-2": function(e) { return e.setHeading && e.setHeading(2); },
	"heading-3": function(e) { return e.setHeading && e.setHeading(3); },
	"heading-4": function(e) { return e.setHeading && e.setHeading(4); },
	"heading-5": function(e) { return e.setHeading && e.setHeading(5); },
	"heading-6": function(e) { return e.setHeading && e.setHeading(6); },
	"bold": function(e) { return e.toggleBold && e.toggleBold(); },
	"italic": function(e) { return e.toggleItalic && e.toggleItalic(); },
	"underline": function(e) { return e.toggleUnderline && e.toggleUnderline(); },
	"strikethrough": function(e) { return e.toggleStrikethrough && e.toggleStrikethrough(); },
	"superscript": function(e) { return e.toggleSuperscript && e.toggleSuperscript(); },
	"subscript": function(e) { return e.toggleSubscript && e.toggleSubscript(); },
	"mono": function(e) { return e.toggleInlineCode && e.toggleInlineCode(); },
	"code": function(e) { return e.insertCodeBlock && e.insertCodeBlock(); },
	
	// Links
	"link": function(e) { return e.insertWikiLink && e.insertWikiLink(); },
	"excise": handleExcise,
	"picture": handlePicture,
	
	// Lists
	"list-bullet": function(e) { return e.toggleBulletList && e.toggleBulletList(); },
	"list-number": function(e) { return e.toggleNumberedList && e.toggleNumberedList(); },
	"quote": handleQuote,
	
	// Other
	"stamp": handleStamp,
	"preview": handlePreview,
	"size": handleSize
};

/**
 * Handle excise (extract selection to new tiddler)
 */
function handleExcise(engine) {
	if (!engine || engine._destroyed) return false;
	
	var selection = engine.getSelection ? engine.getSelection() : null;
	if (!selection || selection.isEmpty) return false;
	
	// This would typically trigger a modal dialog in TiddlyWiki
	// For now, we just signal that we want to excise
	if ($tw && $tw.rootWidget) {
		$tw.rootWidget.dispatchEvent({
			type: "tm-modal",
			param: "$:/plugins/tiddlywiki/codemirror/modals/excise",
			paramObject: {
				text: selection.text,
				startPos: selection.from,
				endPos: selection.to
			}
		});
	}
	
	return true;
}

/**
 * Handle picture insertion
 */
function handlePicture(engine) {
	if (!engine || engine._destroyed) return false;
	
	// Open image picker or insert image syntax
	if ($tw && $tw.rootWidget) {
		$tw.rootWidget.dispatchEvent({
			type: "tm-modal",
			param: "$:/plugins/tiddlywiki/codemirror/modals/picture"
		});
	} else {
		// Fallback: insert image syntax
		var sel = engine.getSelection ? engine.getSelection() : { text: "" };
		var text = sel.text || "image.png";
		engine.replaceSelection && engine.replaceSelection("[img[" + text + "]]");
	}
	
	return true;
}

/**
 * Handle quote insertion
 */
function handleQuote(engine) {
	if (!engine || engine._destroyed) return false;
	
	var sel = engine.getSelection ? engine.getSelection() : { text: "", from: 0 };
	
	if (sel.text) {
		// Wrap selection in quote
		engine.replaceSelection && engine.replaceSelection("<<<\n" + sel.text + "\n<<<");
	} else {
		// Insert quote block
		engine.insert && engine.insert("<<<\n\n<<<");
		engine.setCursor && engine.setCursor(sel.from + 4);
	}
	
	return true;
}

/**
 * Handle stamp (insert snippet from tiddler)
 */
function handleStamp(engine, param) {
	if (!engine || engine._destroyed) return false;
	
	if (param && $tw && $tw.wiki) {
		var tiddler = $tw.wiki.getTiddler(param);
		if (tiddler && tiddler.fields.text) {
			engine.insert && engine.insert(tiddler.fields.text);
			return true;
		}
	}
	
	return false;
}

/**
 * Handle preview toggle
 */
function handlePreview(engine) {
	// Preview is typically handled by TiddlyWiki's edit widget
	// We just need to make sure the editor state is synchronized
	if (engine && engine._onChange) {
		// Force emit current text
		engine._emitNow && engine._emitNow();
	}
	return false; // Let TiddlyWiki handle the actual preview
}

/**
 * Handle size button (typically opens height adjuster)
 */
function handleSize(engine) {
	// Handled by TiddlyWiki
	return false;
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle tm-edit-text-operation message
 */
function handleEditTextOperation(engine, event) {
	if (!engine || engine._destroyed) return false;
	
	var operation = event.param || event.paramObject;
	if (!operation) return false;
	
	var opType = operation.type || operation;
	
	// Check for mapped operation
	var handler = OPERATION_MAP[opType];
	if (handler) {
		return handler(engine, operation.param);
	}
	
	// Handle generic operations
	switch (opType) {
		case "focus-editor":
			engine.focus && engine.focus();
			return true;
			
		case "insert-text":
		case "replace-selection":
			if (operation.text !== undefined) {
				engine.replaceSelection && engine.replaceSelection(operation.text);
			} else if (operation.replacement !== undefined) {
				engine.replaceSelection && engine.replaceSelection(operation.replacement);
			}
			return true;
			
		case "wrap-selection":
			if (operation.prefix !== undefined || operation.suffix !== undefined) {
				var sel = engine.getSelection ? engine.getSelection() : { text: "" };
				var newText = (operation.prefix || "") + sel.text + (operation.suffix || "");
				engine.replaceSelection && engine.replaceSelection(newText, "around");
			}
			return true;
			
		case "replace-all":
			if (operation.text !== undefined) {
				engine.setText && engine.setText(operation.text);
			}
			return true;
			
		case "set-selection":
			if (operation.start !== undefined) {
				engine.setSelection && engine.setSelection(
					operation.start,
					operation.end !== undefined ? operation.end : operation.start
				);
			}
			return true;
			
		case "undo":
			engine.undo && engine.undo();
			return true;
			
		case "redo":
			engine.redo && engine.redo();
			return true;
			
		case "save":
			// Force emit changes
			engine._emitNow && engine._emitNow();
			return true;
	}
	
	return false;
}

// ============================================================================
// Toolbar State
// ============================================================================

/**
 * Get current editor state for toolbar
 */
function getToolbarState(engine) {
	if (!engine || engine._destroyed) {
		return {
			hasSelection: false,
			canUndo: false,
			canRedo: false
		};
	}
	
	var sel = engine.getSelection ? engine.getSelection() : { isEmpty: true };
	
	return {
		hasSelection: !sel.isEmpty,
		selectionText: sel.text || "",
		canUndo: engine.canUndo ? engine.canUndo() : false,
		canRedo: engine.canRedo ? engine.canRedo() : false,
		cursorPosition: engine.getCursor ? engine.getCursor() : 0,
		lineCount: engine.getLineCount ? engine.getLineCount() : 1
	};
}

/**
 * Update TiddlyWiki state tiddlers for toolbar
 */
function updateToolbarState(engine, tiddlerTitle) {
	if (!$tw || !$tw.wiki || !tiddlerTitle) return;
	
	var state = getToolbarState(engine);
	var stateBase = "$:/state/edit/" + tiddlerTitle;
	
	// Update state tiddlers (used by toolbar buttons)
	$tw.wiki.setText(stateBase + "/hasSelection", "text", null, 
		state.hasSelection ? "yes" : "no", { suppressTimestamp: true });
	$tw.wiki.setText(stateBase + "/canUndo", "text", null,
		state.canUndo ? "yes" : "no", { suppressTimestamp: true });
	$tw.wiki.setText(stateBase + "/canRedo", "text", null,
		state.canRedo ? "yes" : "no", { suppressTimestamp: true });
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-toolbar",
	description: "TiddlyWiki editor toolbar integration",
	priority: 200,
	
	// Only load for TiddlyWiki content
	condition: function(context) {
		var type = context.tiddlerType;
		if (context.options.toolbar === false) return false;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var EditorView = core.view.EditorView;
		var tiddlerTitle = context.tiddlerTitle;
		var engine = context.engine;
		
		return [
			// Update toolbar state on selection change
			EditorView.updateListener.of(function(update) {
				if (update.selectionSet || update.docChanged) {
					// Debounce state updates
					if (engine._toolbarUpdateTimeout) {
						clearTimeout(engine._toolbarUpdateTimeout);
					}
					engine._toolbarUpdateTimeout = setTimeout(function() {
						updateToolbarState(engine, tiddlerTitle);
					}, 100);
				}
			})
		];
	},
	
	registerEvents: function(engine, context) {
		return {
			// Handle text operations from toolbar
			textOperation: function(operation) {
				handleEditTextOperation(engine, { param: operation, paramObject: operation });
			}
		};
	},
	
	extendAPI: function(engine, context) {
		var tiddlerTitle = context.tiddlerTitle;
		
		return {
			/**
			 * Handle toolbar operation
			 */
			handleToolbarOperation: function(operation, param) {
				var handler = OPERATION_MAP[operation];
				if (handler) {
					return handler(this, param);
				}
				return handleEditTextOperation(this, { 
					param: operation, 
					paramObject: { type: operation, param: param }
				});
			},
			
			/**
			 * Get current toolbar state
			 */
			getToolbarState: function() {
				return getToolbarState(this);
			},
			
			/**
			 * Update toolbar state tiddlers
			 */
			updateToolbarState: function() {
				updateToolbarState(this, tiddlerTitle);
			},
			
			/**
			 * Insert stamp/snippet from tiddler
			 */
			insertStamp: function(stampTiddler) {
				return handleStamp(this, stampTiddler);
			},
			
			/**
			 * Excise selection to new tiddler
			 */
			exciseSelection: function() {
				return handleExcise(this);
			},
			
			/**
			 * Wrap selection with prefix/suffix
			 */
			wrapSelection: function(prefix, suffix) {
				if (this._destroyed) return false;
				
				var sel = this.getSelection ? this.getSelection() : { text: "" };
				var newText = (prefix || "") + sel.text + (suffix || "");
				this.replaceSelection && this.replaceSelection(newText, "around");
				return true;
			},
			
			/**
			 * Insert horizontal rule
			 */
			insertHorizontalRule: function() {
				if (this._destroyed) return false;
				this.insert && this.insert("\n---\n");
				return true;
			},
			
			/**
			 * Insert date stamp
			 */
			insertDateStamp: function(format) {
				if (this._destroyed || !$tw) return false;
				
				format = format || "YYYY-0MM-0DD";
				var dateStr = $tw.utils.formatDateString(new Date(), format);
				this.insert && this.insert(dateStr);
				return true;
			}
		};
	},
	
	destroy: function(engine) {
		if (engine._toolbarUpdateTimeout) {
			clearTimeout(engine._toolbarUpdateTimeout);
			engine._toolbarUpdateTimeout = null;
		}
	}
};
