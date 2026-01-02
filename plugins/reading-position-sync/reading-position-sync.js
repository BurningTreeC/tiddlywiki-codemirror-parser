/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/reading-position-sync.js
type: application/javascript
module-type: codemirror6-plugin

Reading Position Sync - Remembers and restores scroll position and cursor/selections per tiddler

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var STATE_PREFIX = "$:/state/codemirror-6/editor-position/";
var SCROLL_DEBOUNCE_MS = 250;
var MAX_AGE_DAYS = 30; // Clean up positions older than this

// Track scroll timeouts per engine instance
var scrollTimeouts = new WeakMap();

/**
 * Get the state tiddler title for a given tiddler
 */
function getStateTiddler(tiddlerTitle) {
	if (!tiddlerTitle) return null;
	return STATE_PREFIX + tiddlerTitle;
}

/**
 * Save editor position (scroll + selections)
 */
function savePosition(engine, tiddlerTitle) {
	if (!engine || !engine.view || engine.isDestroyed()) return;
	if (!tiddlerTitle) return;
	
	var stateTiddler = getStateTiddler(tiddlerTitle);
	if (!stateTiddler) return;
	
	try {
		var view = engine.view;
		var state = view.state;
		
		// Get scroll position
		var scroller = view.scrollDOM;
		var scrollTop = scroller ? scroller.scrollTop : 0;
		var scrollLeft = scroller ? scroller.scrollLeft : 0;
		
		// Get all selections
		var selections = [];
		for (var i = 0; i < state.selection.ranges.length; i++) {
			var range = state.selection.ranges[i];
			selections.push({
				anchor: range.anchor,
				head: range.head
			});
		}
		
		var positionData = {
			scrollTop: scrollTop,
			scrollLeft: scrollLeft,
			selections: selections,
			timestamp: Date.now()
		};
		
		$tw.wiki.setText(stateTiddler, "text", null, JSON.stringify(positionData));
	} catch (e) {
		console.error("CM6 Reading Position Sync: Error saving position:", e);
	}
}

/**
 * Restore editor position (scroll + selections)
 */
function restorePosition(engine, tiddlerTitle) {
	if (!engine || !engine.view || engine.isDestroyed()) return;
	if (!tiddlerTitle) return;
	
	var stateTiddler = getStateTiddler(tiddlerTitle);
	if (!stateTiddler) return;
	
	try {
		var text = $tw.wiki.getTiddlerText(stateTiddler);
		if (!text) return;
		
		var positionData = JSON.parse(text);
		
		// Check age - skip if too old
		if (positionData.timestamp) {
			var ageMs = Date.now() - positionData.timestamp;
			var ageDays = ageMs / (1000 * 60 * 60 * 24);
			if (ageDays > MAX_AGE_DAYS) {
				// Clean up old state
				$tw.wiki.deleteTiddler(stateTiddler);
				return;
			}
		}
		
		var view = engine.view;
		var docLength = view.state.doc.length;
		
		// Restore selections (clamp to document bounds)
		if (positionData.selections && positionData.selections.length > 0) {
			var EditorSelection = engine.cm.state.EditorSelection;
			var ranges = [];
			
			for (var i = 0; i < positionData.selections.length; i++) {
				var sel = positionData.selections[i];
				var anchor = Math.min(Math.max(0, sel.anchor), docLength);
				var head = Math.min(Math.max(0, sel.head), docLength);
				ranges.push(EditorSelection.range(anchor, head));
			}
			
			if (ranges.length > 0) {
				view.dispatch({
					selection: EditorSelection.create(ranges)
				});
			}
		}
		
		// Restore scroll position (after a frame to let layout settle)
		if (positionData.scrollTop || positionData.scrollLeft) {
			requestAnimationFrame(function() {
				if (engine.isDestroyed()) return;
				var scroller = view.scrollDOM;
				if (scroller) {
					if (positionData.scrollTop) {
						scroller.scrollTop = positionData.scrollTop;
					}
					if (positionData.scrollLeft) {
						scroller.scrollLeft = positionData.scrollLeft;
					}
				}
			});
		}
	} catch (e) {
		// Invalid JSON or other error - ignore
		console.warn("CM6 Reading Position Sync: Could not restore position:", e);
	}
}

/**
 * Setup scroll tracking with debounce
 */
function setupScrollTracking(engine, tiddlerTitle) {
	if (!engine || !engine.view) return null;
	
	var scroller = engine.view.scrollDOM;
	if (!scroller) return null;
	
	var handler = function() {
		// Clear existing timeout
		var existingTimeout = scrollTimeouts.get(engine);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}
		
		// Set new debounced save
		var timeout = setTimeout(function() {
			savePosition(engine, tiddlerTitle);
		}, SCROLL_DEBOUNCE_MS);
		
		scrollTimeouts.set(engine, timeout);
	};
	
	scroller.addEventListener("scroll", handler, { passive: true });
	
	return function cleanup() {
		scroller.removeEventListener("scroll", handler);
		var timeout = scrollTimeouts.get(engine);
		if (timeout) {
			clearTimeout(timeout);
			scrollTimeouts.delete(engine);
		}
	};
}

// Store cleanup functions per engine
var cleanupFunctions = new WeakMap();

/**
 * Plugin Definition
 */
var plugin = {
	name: "reading-position-sync",
	description: "Remembers and restores scroll position and cursor selections per tiddler",
	priority: -10, // Run after most other plugins
	
	/**
	 * Register event handlers
	 */
	registerEvents: function(engine, context) {
		var tiddlerTitle = context.tiddlerTitle;
		
		if (!tiddlerTitle) return {};
		
		// Restore position on first focus
		var hasRestored = false;
		
		// Setup scroll tracking
		var scrollCleanup = setupScrollTracking(engine, tiddlerTitle);
		
		// Store cleanup for destroy
		cleanupFunctions.set(engine, scrollCleanup);
		
		// Restore position after a short delay (let editor fully initialize)
		setTimeout(function() {
			if (!engine.isDestroyed()) {
				restorePosition(engine, tiddlerTitle);
				hasRestored = true;
			}
		}, 50);
		
		return {
			/**
			 * Save on blur
			 */
			blur: function() {
				savePosition(engine, tiddlerTitle);
			},
			
			/**
			 * Save on selection change (debounced via scroll handler timing)
			 */
			selectionChanged: function() {
				// Selection saves are bundled with scroll saves
				// This ensures we don't spam writes
				var existingTimeout = scrollTimeouts.get(engine);
				if (!existingTimeout) {
					var timeout = setTimeout(function() {
						savePosition(engine, tiddlerTitle);
						scrollTimeouts.delete(engine);
					}, SCROLL_DEBOUNCE_MS);
					scrollTimeouts.set(engine, timeout);
				}
			}
		};
	},
	
	/**
	 * Cleanup on destroy
	 */
	destroy: function(engine) {
		// Save final position
		if (engine._pluginContext && engine._pluginContext.tiddlerTitle) {
			savePosition(engine, engine._pluginContext.tiddlerTitle);
		}
		
		// Run scroll cleanup
		var cleanup = cleanupFunctions.get(engine);
		if (cleanup) {
			cleanup();
			cleanupFunctions.delete(engine);
		}
	}
};

// Export for TiddlyWiki module system
exports.plugin = plugin;
