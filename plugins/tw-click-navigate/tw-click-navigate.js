/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/tw-click-navigate.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Click Navigation Plugin - Ctrl+Click (or Cmd+Click on Mac) opens tiddler.

Features:
- Ctrl+Click on [[link]] opens tiddler
- Ctrl+Click on {{transclusion}} opens tiddler
- Ctrl+Click on CamelCase opens tiddler (if exists)
- Ctrl+Click on macro opens definition tiddler
- Visual indication when Ctrl is held

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Link Detection
// ============================================================================

/**
 * Extract link target and type from position in document
 */
function getLinkAtPos(state, pos) {
	var doc = state.doc;
	var line = doc.lineAt(pos);
	var lineText = line.text;
	var col = pos - line.from;
	
	var result = null;
	
	// Check for wiki link: [[target]] or [[text|target]]
	var wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	var match;
	while ((match = wikiLinkRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			return {
				type: "link",
				target: match[2] || match[1],
				from: line.from + start,
				to: line.from + end
			};
		}
	}
	
	// Check for transclusion: {{target}} or {{target!!field}}
	var transclusionRegex = /\{\{([^}!|]+)(?:!![^}]*)?\}\}/g;
	while ((match = transclusionRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			return {
				type: "transclusion",
				target: match[1],
				from: line.from + start,
				to: line.from + end
			};
		}
	}
	
	// Check for image: [img[source]] or [img[tooltip|source]]
	var imgRegex = /\[img(?:\[[^\]]*\])?\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	while ((match = imgRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			return {
				type: "image",
				target: match[2] || match[1],
				from: line.from + start,
				to: line.from + end
			};
		}
	}
	
	// Check for macro: <<macroname
	var macroRegex = /<<([a-zA-Z0-9_-]+)/g;
	while ((match = macroRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			// Try to find the tiddler that defines this macro
			var macroName = match[1];
			var defTiddler = findMacroDefinition(macroName);
			if (defTiddler) {
				return {
					type: "macro",
					target: defTiddler,
					macroName: macroName,
					from: line.from + start,
					to: line.from + end
				};
			}
		}
	}
	
	// Check for widget: <$widgetname
	var widgetRegex = /<\$([a-zA-Z0-9_-]+)/g;
	while ((match = widgetRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			// Link to widget documentation
			return {
				type: "widget",
				target: "$:/core/ui/WidgetInfo/" + match[1],
				widgetName: match[1],
				from: line.from + start,
				to: line.from + end
			};
		}
	}
	
	// Check for CamelCase links
	var camelRegex = /[A-Z][a-z]+[A-Z][A-Za-z]*/g;
	while ((match = camelRegex.exec(lineText)) !== null) {
		var start = match.index;
		var end = start + match[0].length;
		if (col >= start && col <= end) {
			if ($tw.wiki.tiddlerExists(match[0])) {
				return {
					type: "camelcase",
					target: match[0],
					from: line.from + start,
					to: line.from + end
				};
			}
		}
	}
	
	return null;
}

/**
 * Find tiddler that defines a macro
 */
function findMacroDefinition(macroName) {
	if (!$tw || !$tw.wiki) return null;
	
	// Search in shadows first (core macros)
	var shadows = $tw.wiki.filterTiddlers("[all[shadows]has[text]]");
	for (var i = 0; i < shadows.length; i++) {
		var tiddler = $tw.wiki.getTiddler(shadows[i]);
		if (tiddler && tiddler.fields.text) {
			var regex = new RegExp("\\\\define\\s+" + macroName + "\\s*\\(");
			if (regex.test(tiddler.fields.text)) {
				return shadows[i];
			}
		}
	}
	
	// Search in regular tiddlers
	var tiddlers = $tw.wiki.filterTiddlers("[all[tiddlers]has[text]]");
	for (var i = 0; i < tiddlers.length; i++) {
		var tiddler = $tw.wiki.getTiddler(tiddlers[i]);
		if (tiddler && tiddler.fields.text) {
			var regex = new RegExp("\\\\define\\s+" + macroName + "\\s*\\(");
			if (regex.test(tiddler.fields.text)) {
				return tiddlers[i];
			}
		}
	}
	
	return null;
}

// ============================================================================
// Navigation
// ============================================================================

/**
 * Navigate to a tiddler
 */
function navigateToTiddler(title, options) {
	options = options || {};
	
	if (!$tw || !$tw.wiki) return;
	
	// Use TiddlyWiki's navigation mechanism
	var event = {
		type: "tm-navigate",
		navigateTo: title,
		navigateFromTitle: options.fromTitle
	};
	
	// If we have a widget, use its dispatch
	if (options.widget && options.widget.dispatchEvent) {
		options.widget.dispatchEvent(event);
	} else {
		// Fallback: dispatch to root widget
		var rootWidget = $tw.rootWidget;
		if (rootWidget && rootWidget.dispatchEvent) {
			rootWidget.dispatchEvent(event);
		}
	}
}

/**
 * Open tiddler in new window/tab
 */
function openInNewWindow(title) {
	if (!$tw) return;
	
	// Create permalink
	var permalink = "#" + encodeURIComponent(title);
	window.open(window.location.pathname + permalink, "_blank");
}

// ============================================================================
// Visual Feedback
// ============================================================================

var currentHighlight = null;

/**
 * Add underline decoration to clickable link
 */
function highlightLink(view, from, to) {
	// Remove existing highlight
	clearHighlight(view);
	
	// Add CSS class to the editor for styling
	view.dom.classList.add("cm6-ctrl-held");
	
	currentHighlight = { from: from, to: to };
}

/**
 * Remove highlight
 */
function clearHighlight(view) {
	if (view && view.dom) {
		view.dom.classList.remove("cm6-ctrl-held");
	}
	currentHighlight = null;
}

// ============================================================================
// Event Handlers
// ============================================================================

var ctrlHeld = false;
var lastMousePos = null;

function handleKeyDown(event, view) {
	if (event.key === "Control" || event.key === "Meta") {
		ctrlHeld = true;
		
		// If we have a mouse position, check for link
		if (lastMousePos) {
			var pos = view.posAtCoords(lastMousePos);
			if (pos !== null) {
				var link = getLinkAtPos(view.state, pos);
				if (link) {
					highlightLink(view, link.from, link.to);
				}
			}
		}
	}
}

function handleKeyUp(event, view) {
	if (event.key === "Control" || event.key === "Meta") {
		ctrlHeld = false;
		clearHighlight(view);
	}
}

function handleMouseMove(event, view) {
	lastMousePos = { x: event.clientX, y: event.clientY };
	
	if (!ctrlHeld) return;
	
	var pos = view.posAtCoords(lastMousePos);
	if (pos === null) {
		clearHighlight(view);
		return;
	}
	
	var link = getLinkAtPos(view.state, pos);
	if (link) {
		highlightLink(view, link.from, link.to);
		view.dom.style.cursor = "pointer";
	} else {
		clearHighlight(view);
		view.dom.style.cursor = "";
	}
}

function handleMouseLeave(event, view) {
	lastMousePos = null;
	clearHighlight(view);
	view.dom.style.cursor = "";
}

function handleClick(event, view) {
	// Check for Ctrl+Click (Cmd+Click on Mac)
	var ctrlKey = event.ctrlKey || event.metaKey;
	if (!ctrlKey) return false;
	
	var pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (pos === null) return false;
	
	var link = getLinkAtPos(view.state, pos);
	if (!link) return false;
	
	// Prevent default click behavior
	event.preventDefault();
	
	// Get widget from engine
	var engine = view._cm6Engine;
	var widget = engine ? engine.widget : null;
	
	// Navigate based on link type
	if (event.shiftKey) {
		// Shift+Ctrl+Click opens in new window
		openInNewWindow(link.target);
	} else {
		navigateToTiddler(link.target, {
			widget: widget,
			fromTitle: engine && engine._pluginContext ? engine._pluginContext.tiddlerTitle : null
		});
	}
	
	// Clear highlight
	clearHighlight(view);
	
	return true;
}

function handleBlur(event, view) {
	ctrlHeld = false;
	clearHighlight(view);
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-click-navigate",
	description: "Ctrl+Click (Cmd+Click on Mac) to navigate to tiddler",
	priority: 450,
	
	// Only load for TiddlyWiki content
	condition: function(context) {
		var type = context.tiddlerType;
		if (context.options.clickNavigate === false) return false;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var EditorView = core.view.EditorView;
		
		return [
			EditorView.domEventHandlers({
				keydown: handleKeyDown,
				keyup: handleKeyUp,
				mousemove: handleMouseMove,
				mouseleave: handleMouseLeave,
				click: handleClick,
				blur: handleBlur
			}),
			// Store engine reference on view for click handler
			EditorView.updateListener.of(function(update) {
				if (!update.view._cm6Engine && context.engine) {
					update.view._cm6Engine = context.engine;
				}
			})
		];
	},
	
	extendAPI: function(engine, context) {
		return {
			/**
			 * Navigate to tiddler at current cursor position
			 */
			navigateToLinkAtCursor: function() {
				if (this._destroyed) return false;
				
				var pos = this.view.state.selection.main.head;
				var link = getLinkAtPos(this.view.state, pos);
				if (!link) return false;
				
				navigateToTiddler(link.target, {
					widget: this.widget,
					fromTitle: this._pluginContext ? this._pluginContext.tiddlerTitle : null
				});
				return true;
			},
			
			/**
			 * Get link information at cursor
			 */
			getLinkInfoAtCursor: function() {
				if (this._destroyed) return null;
				
				var pos = this.view.state.selection.main.head;
				return getLinkAtPos(this.view.state, pos);
			},
			
			/**
			 * Navigate to specific tiddler
			 */
			navigateToTiddler: function(title) {
				navigateToTiddler(title, {
					widget: this.widget,
					fromTitle: this._pluginContext ? this._pluginContext.tiddlerTitle : null
				});
			},
			
			/**
			 * Open tiddler in new window
			 */
			openTiddlerInNewWindow: function(title) {
				openInNewWindow(title);
			}
		};
	},
	
	destroy: function(engine) {
		ctrlHeld = false;
		lastMousePos = null;
		currentHighlight = null;
	}
};
