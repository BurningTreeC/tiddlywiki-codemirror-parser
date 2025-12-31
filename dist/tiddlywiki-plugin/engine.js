/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/engine.js
type: application/javascript
module-type: library

CodeMirror 6 engine for TiddlyWiki5 with plugin system.
- Modular plugin architecture via module-type: codemirror6-plugin
- Conditional plugin loading based on tiddler type
- Core only: state + view + commands + history
- Safe lifecycle (no dispatch-after-destroy), debounced change callback
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

/**
 * Core library module title
 */
var CORE_LIB_TITLE = "$:/plugins/BTC/tiddlywiki-codemirror-6/lib/library-core.js";

/**
 * Plugin module type for CM6 plugins
 */
var PLUGIN_MODULE_TYPE = "codemirror6-plugin";

/**
 * Cache for loaded plugins
 */
var _pluginCache = null;
var _coreCache = null;

// ============================================================================
// Utility Functions
// ============================================================================

function isNumber(n) {
	return typeof n === "number" && isFinite(n);
}

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function hasWindowTimers() {
	return typeof window !== "undefined" && 
		typeof window.setTimeout === "function" && 
		typeof window.clearTimeout === "function";
}

// ============================================================================
// Core Library Loading
// ============================================================================

function getCM6Core() {
	// Return cached core if available
	if (_coreCache) return _coreCache;

	// Try to load from module
	try {
		var core = require(CORE_LIB_TITLE);
		if (core && core.state && core.view) {
			_coreCache = core;
			return core;
		}
	} catch (e) {
		// Fall through to other methods
	}

	// Fallback: check for global
	if ($tw && $tw.browser && typeof window !== "undefined") {
		if (window.CM6CORE && window.CM6CORE.state && window.CM6CORE.view) {
			_coreCache = window.CM6CORE;
			return _coreCache;
		}
		if (window.CM && window.CM.state && window.CM.view) {
			_coreCache = window.CM;
			return _coreCache;
		}
	}

	throw new Error(
		"CM6 core library not found. Provide " + CORE_LIB_TITLE + 
		" exporting {state, view, commands, history}."
	);
}

// ============================================================================
// Plugin System
// ============================================================================

/**
 * Discover and load all CM6 plugins
 * @returns {Array} Array of plugin definitions sorted by priority
 */
function discoverPlugins() {
	// Return cached plugins if available
	if (_pluginCache) return _pluginCache;

	var plugins = [];

	// Get all modules with our plugin type
	if ($tw && $tw.modules && $tw.modules.types[PLUGIN_MODULE_TYPE]) {
		var pluginModules = $tw.modules.types[PLUGIN_MODULE_TYPE];
		
		$tw.utils.each(pluginModules, function(moduleInfo, moduleName) {
			try {
				var pluginModule = require(moduleName);
				
				// Support both default export and named 'plugin' export
				var pluginDef = pluginModule.default || pluginModule.plugin || pluginModule;
				
				if (pluginDef && typeof pluginDef.getExtensions === "function") {
					// Ensure required fields
					pluginDef.name = pluginDef.name || moduleName;
					pluginDef.priority = isNumber(pluginDef.priority) ? pluginDef.priority : 0;
					pluginDef._moduleName = moduleName;
					
					plugins.push(pluginDef);
				} else {
					console.warn("CM6 plugin '" + moduleName + "' missing getExtensions function");
				}
			} catch (e) {
				console.error("Failed to load CM6 plugin '" + moduleName + "':", e);
			}
		});
	}

	// Sort by priority (higher first)
	plugins.sort(function(a, b) {
		return (b.priority || 0) - (a.priority || 0);
	});

	_pluginCache = plugins;
	return plugins;
}

/**
 * Clear the plugin cache (useful for development/reload)
 */
function clearPluginCache() {
	_pluginCache = null;
}

/**
 * Build plugin context from engine options
 * @param {Object} options - Engine options
 * @returns {Object} Plugin context
 */
function buildPluginContext(options) {
	var context = {
		tiddlerTitle: null,
		tiddlerType: null,
		tiddlerFields: null,
		readOnly: !!options.readOnly,
		cm6Core: getCM6Core()
	};

	// Extract tiddler information from widget if available
	if (options.widget) {
		var widget = options.widget;
		
		// Try to get tiddler title
		if (widget.editTitle) {
			context.tiddlerTitle = widget.editTitle;
		} else if (widget.getAttribute) {
			context.tiddlerTitle = widget.getAttribute("tiddler");
		}
		
		// Try to get tiddler fields and type
		if (context.tiddlerTitle && $tw.wiki) {
			var tiddler = $tw.wiki.getTiddler(context.tiddlerTitle);
			if (tiddler) {
				context.tiddlerFields = tiddler.fields;
				context.tiddlerType = tiddler.fields.type || "";
			}
		}
		
		// Also check editField for type hints
		if (widget.editField === "text" && !context.tiddlerType) {
			// Default to wikitext for text field with no type
			context.tiddlerType = "";
		}
	}

	// Allow explicit type override from options
	if (options.tiddlerType !== undefined) {
		context.tiddlerType = options.tiddlerType;
	}
	if (options.tiddlerTitle !== undefined) {
		context.tiddlerTitle = options.tiddlerTitle;
	}

	return context;
}

/**
 * Get extensions from all matching plugins
 * @param {Object} context - Plugin context
 * @returns {Array} Array of CM6 extensions
 */
function getPluginExtensions(context) {
	var plugins = discoverPlugins();
	var extensions = [];

	for (var i = 0; i < plugins.length; i++) {
		var plugin = plugins[i];
		
		try {
			// Check condition if present
			var shouldLoad = true;
			if (typeof plugin.condition === "function") {
				shouldLoad = plugin.condition(context);
			}
			
			if (shouldLoad) {
				var pluginExtensions = plugin.getExtensions(context);
				if (Array.isArray(pluginExtensions)) {
					extensions = extensions.concat(pluginExtensions);
				}
			}
		} catch (e) {
			console.error("Error loading extensions from plugin '" + plugin.name + "':", e);
		}
	}

	return extensions;
}

// ============================================================================
// CodeMirror Engine
// ============================================================================

/**
 * @param {Object} options
 * @param {Object} options.widget - the editor widget (optional but recommended)
 * @param {HTMLElement} options.parentNode - DOM parent where the editor should be inserted
 * @param {Node|null} options.nextSibling - insert before this node (optional)
 * @param {string} options.value - initial text
 * @param {boolean} options.readOnly - read-only mode
 * @param {boolean} options.autofocus - focus after mount
 * @param {function(string):void} options.onChange - called (debounced) with full doc text
 * @param {number} options.changeDebounceMs - debounce ms for onChange (default 150)
 * @param {function():void} options.onBlurSave - called on blur if there are pending changes
 * @param {string} options.tiddlerType - explicit tiddler type (overrides widget detection)
 * @param {string} options.tiddlerTitle - explicit tiddler title (overrides widget detection)
 * @param {boolean} options.loadPlugins - whether to load plugins (default true)
 */
function CodeMirrorEngine(options) {
	options = options || {};
	this.widget = options.widget || null;
	this.parentNode = options.parentNode || null;
	this.nextSibling = options.nextSibling || null;

	if (!$tw || !$tw.browser) {
		throw new Error("CodeMirrorEngine can only run in the browser.");
	}
	if (!this.parentNode) {
		throw new Error("CodeMirrorEngine requires options.parentNode.");
	}
	if (!hasWindowTimers()) {
		throw new Error("No window timers available; cannot debounce changes.");
	}

	this._destroyed = false;
	this._pendingChange = false;
	this._debounceMs = isNumber(options.changeDebounceMs) ? clamp(options.changeDebounceMs, 0, 2000) : 150;
	this._debounceHandle = null;

	this._onChange = typeof options.onChange === "function" ? options.onChange : null;
	this._onBlurSave = typeof options.onBlurSave === "function" ? options.onBlurSave : null;

	this._lastEmittedText = typeof options.value === "string" ? options.value : "";

	var core = getCM6Core();
	this.cm = core; // expose for power users

	// Pull the pieces we need
	var EditorState = core.state.EditorState;
	var EditorView = core.view.EditorView;
	var cmKeymap = core.view.keymap;

	var defaultKeymap = (core.commands || {}).defaultKeymap;
	var indentWithTab = (core.commands || {}).indentWithTab;
	var history = (core.history || {}).history;
	var historyKeymap = (core.history || {}).historyKeymap;
	var undo = (core.history || {}).undo;
	var redo = (core.history || {}).redo;

	// Root DOM node for CM6
	this.domNode = document.createElement("div");
	this.domNode.className = "tc-editor-codemirror6";

	// Build extensions array
	var extensions = [];

	// Readonly compartment
	if (options.readOnly) {
		extensions.push(EditorState.readOnly.of(true));
	}

	// History
	if (typeof history === "function") {
		extensions.push(history());
	}

	// Base keymap
	var km = [];
	if (indentWithTab) km.push(indentWithTab);
	if (Array.isArray(defaultKeymap)) km = km.concat(defaultKeymap);
	if (Array.isArray(historyKeymap)) km = km.concat(historyKeymap);
	if (km.length && cmKeymap) {
		extensions.push(cmKeymap.of(km));
	}

	// Load plugin extensions (unless disabled)
	var loadPlugins = options.loadPlugins !== false;
	if (loadPlugins) {
		var context = buildPluginContext(options);
		var pluginExtensions = getPluginExtensions(context);
		extensions = extensions.concat(pluginExtensions);
	}

	// Update listener for change tracking
	var self = this;
	extensions.push(
		EditorView.updateListener.of(function(update) {
			if (self._destroyed) return;
			if (!update.docChanged) return;
			self._pendingChange = true;
			self._scheduleEmit();
		})
	);

	// Create state & view
	var initialText = typeof options.value === "string" ? options.value : "";
	this.view = new EditorView({
		state: EditorState.create({
			doc: initialText,
			extensions: extensions
		}),
		parent: this.domNode
	});

	// Insert into DOM
	if (this.nextSibling && this.nextSibling.parentNode === this.parentNode) {
		this.parentNode.insertBefore(this.domNode, this.nextSibling);
	} else {
		this.parentNode.appendChild(this.domNode);
	}

	// Blur handler
	this._blurHandler = function() {
		if (self._destroyed) return;
		self._emitNow();
		if (self._pendingChange && self._onBlurSave) {
			try {
				self._onBlurSave();
			} catch (e) {
				console.error("CodeMirrorEngine onBlurSave failed:", e);
			}
		}
	};
	this.domNode.addEventListener("focusout", this._blurHandler, true);

	// Autofocus
	if (options.autofocus) {
		this.focus();
	}

	// Expose undo/redo
	this.undo = typeof undo === "function" ? function() { if (!self._destroyed) undo(self.view); } : null;
	this.redo = typeof redo === "function" ? function() { if (!self._destroyed) redo(self.view); } : null;
}

CodeMirrorEngine.prototype._scheduleEmit = function() {
	var self = this;
	if (this._destroyed) return;

	if (this._debounceHandle !== null) {
		window.clearTimeout(this._debounceHandle);
	}
	this._debounceHandle = window.setTimeout(function() {
		self._debounceHandle = null;
		self._emitNow();
	}, this._debounceMs);
};

CodeMirrorEngine.prototype._emitNow = function() {
	if (this._destroyed) return;

	var text = this.view.state.doc.toString();

	if (text === this._lastEmittedText) {
		this._pendingChange = false;
		return;
	}

	this._lastEmittedText = text;
	this._pendingChange = false;

	if (this._onChange) {
		try {
			this._onChange(text);
		} catch (e) {
			console.error("CodeMirrorEngine onChange failed:", e);
		}
	}
};

CodeMirrorEngine.prototype.getText = function() {
	if (this._destroyed) return "";
	return this.view.state.doc.toString();
};

CodeMirrorEngine.prototype.setText = function(text) {
	if (this._destroyed) return;
	if (typeof text !== "string") text = String(text);

	var current = this.view.state.doc.toString();
	if (text === current) return;

	var sel = this.view.state.selection.main;
	var newLen = text.length;
	var anchor = clamp(sel.anchor, 0, newLen);
	var head = clamp(sel.head, 0, newLen);

	this.view.dispatch({
		changes: { from: 0, to: this.view.state.doc.length, insert: text },
		selection: { anchor: anchor, head: head }
	});
};

CodeMirrorEngine.prototype.updateDomNodeText = function(text) {
	this.setText(text);
};

CodeMirrorEngine.prototype.focus = function() {
	if (this._destroyed) return;
	this.view.focus();
};

CodeMirrorEngine.prototype.fixHeight = function() {
	// no-op
};

CodeMirrorEngine.prototype.createTextOperation = function(type) {
	if (this._destroyed) return null;

	var sel = this.view.state.selection.main;
	var doc = this.view.state.doc;

	return {
		type: type,
		text: doc.toString(),
		selStart: sel.from,
		selEnd: sel.to,
		selection: doc.sliceString(sel.from, sel.to),
		replacement: null,
		newSelStart: null,
		newSelEnd: null
	};
};

CodeMirrorEngine.prototype.executeTextOperation = function(operation) {
	if (this._destroyed || !operation) return;

	var type = operation.type;
	var from = isNumber(operation.selStart) ? operation.selStart : this.view.state.selection.main.from;
	var to = isNumber(operation.selEnd) ? operation.selEnd : this.view.state.selection.main.to;

	if (type === "focus-editor") {
		this.focus();
		return;
	}

	if (type === "insert-text" || type === "replace-selection") {
		var insert = typeof operation.replacement === "string" ? operation.replacement : "";
		this.view.dispatch({
			changes: { from: from, to: to, insert: insert },
			selection: { anchor: from + insert.length, head: from + insert.length }
		});
		return;
	}

	if (type === "undo" && this.undo) { this.undo(); return; }
	if (type === "redo" && this.redo) { this.redo(); return; }
};

CodeMirrorEngine.prototype.destroy = function() {
	if (this._destroyed) return;
	this._destroyed = true;

	if (this._debounceHandle !== null) {
		window.clearTimeout(this._debounceHandle);
		this._debounceHandle = null;
	}

	if (this.domNode && this._blurHandler) {
		this.domNode.removeEventListener("focusout", this._blurHandler, true);
	}

	try {
		if (this.view) this.view.destroy();
	} catch (e) {
		console.error("CodeMirrorEngine view.destroy failed:", e);
	}

	try {
		if (this.domNode && this.domNode.parentNode) {
			this.domNode.parentNode.removeChild(this.domNode);
		}
	} catch (e2) {
		// ignore
	}

	this.view = null;
	this.domNode = null;
};

// ============================================================================
// Exports
// ============================================================================

exports.CodeMirrorEngine = CodeMirrorEngine;
exports.discoverPlugins = discoverPlugins;
exports.clearPluginCache = clearPluginCache;
exports.getCM6Core = getCM6Core;
exports.buildPluginContext = buildPluginContext;
exports.getPluginExtensions = getPluginExtensions;
exports.PLUGIN_MODULE_TYPE = PLUGIN_MODULE_TYPE;
