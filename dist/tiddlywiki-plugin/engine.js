/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/engine.js
type: application/javascript
module-type: library

Modular CodeMirror 6 engine for TiddlyWiki5.

The engine provides a minimal core and allows plugins to:
- Add API methods to the engine instance
- Register compartments for dynamic reconfiguration
- Provide CodeMirror 6 extensions
- Register event handlers

Plugin module-type: codemirror6-plugin

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Constants
// ============================================================================

var CORE_LIB_TITLE = "$:/plugins/BTC/tiddlywiki-codemirror-6/lib/library-core.js";
var PLUGIN_MODULE_TYPE = "codemirror6-plugin";

// ============================================================================
// Caches
// ============================================================================

var _pluginCache = null;
var _coreCache = null;

// ============================================================================
// Utility Functions
// ============================================================================

function isNumber(n) {
	return typeof n === "number" && isFinite(n);
}

function isString(s) {
	return typeof s === "string";
}

function isFunction(f) {
	return typeof f === "function";
}

function isArray(a) {
	return Array.isArray(a);
}

function isObject(o) {
	return o !== null && typeof o === "object" && !isArray(o);
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
	if (_coreCache) return _coreCache;

	try {
		var core = require(CORE_LIB_TITLE);
		if (core && core.state && core.view) {
			_coreCache = core;
			return core;
		}
	} catch (e) {
		// Fall through
	}

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
		" exporting {state, view, commands, history, ...}."
	);
}

// ============================================================================
// Plugin System
// ============================================================================

/**
 * Plugin Definition Interface:
 * 
 * {
 *   name: string,                    // Unique plugin name
 *   description?: string,            // Plugin description
 *   priority?: number,               // Load order (higher = first, default 0)
 *   
 *   condition?: (context) => boolean,  // Should plugin load?
 *   
 *   // Called once when plugin is discovered
 *   init?: (cm6Core) => void,
 *   
 *   // Register compartments (called before extensions)
 *   registerCompartments?: () => { [name: string]: Compartment },
 *   
 *   // Get CM6 extensions
 *   getExtensions?: (context) => Extension[],
 *   
 *   // Extend engine API (called after view creation)
 *   extendAPI?: (engine, context) => { [methodName: string]: Function },
 *   
 *   // Register event handlers
 *   registerEvents?: (engine, context) => { [eventName: string]: Function },
 *   
 *   // Cleanup when engine is destroyed
 *   destroy?: (engine) => void
 * }
 */

function discoverPlugins() {
	if (_pluginCache) return _pluginCache;

	var plugins = [];
	var core = getCM6Core();

	if ($tw && $tw.modules && $tw.modules.types[PLUGIN_MODULE_TYPE]) {
		var pluginModules = $tw.modules.types[PLUGIN_MODULE_TYPE];
		
		$tw.utils.each(pluginModules, function(moduleInfo, moduleName) {
			try {
				var pluginModule = require(moduleName);
				var pluginDef = pluginModule.default || pluginModule.plugin || pluginModule;
				
				if (pluginDef && (isFunction(pluginDef.getExtensions) || 
				                  isFunction(pluginDef.extendAPI) ||
				                  isFunction(pluginDef.registerCompartments))) {
					pluginDef.name = pluginDef.name || moduleName;
					pluginDef.priority = isNumber(pluginDef.priority) ? pluginDef.priority : 0;
					pluginDef._moduleName = moduleName;
					
					// Call init if present
					if (isFunction(pluginDef.init)) {
						try {
							pluginDef.init(core);
						} catch (e) {
							console.error("Plugin init failed for '" + pluginDef.name + "':", e);
						}
					}
					
					plugins.push(pluginDef);
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

function clearPluginCache() {
	_pluginCache = null;
}

function buildPluginContext(options, engine) {
	var context = {
		tiddlerTitle: null,
		tiddlerType: null,
		tiddlerFields: null,
		readOnly: !!options.readOnly,
		cm6Core: getCM6Core(),
		engine: engine,
		options: options
	};

	if (options.widget) {
		var widget = options.widget;
		
		if (widget.editTitle) {
			context.tiddlerTitle = widget.editTitle;
		} else if (widget.getAttribute) {
			context.tiddlerTitle = widget.getAttribute("tiddler");
		}
		
		if (context.tiddlerTitle && $tw.wiki) {
			var tiddler = $tw.wiki.getTiddler(context.tiddlerTitle);
			if (tiddler) {
				context.tiddlerFields = tiddler.fields;
				context.tiddlerType = tiddler.fields.type || "";
			}
		}
		
		if (widget.editField === "text" && !context.tiddlerType) {
			context.tiddlerType = "";
		}
	}

	if (options.tiddlerType !== undefined) {
		context.tiddlerType = options.tiddlerType;
	}
	if (options.tiddlerTitle !== undefined) {
		context.tiddlerTitle = options.tiddlerTitle;
	}

	return context;
}

// ============================================================================
// CodeMirror Engine - Minimal Core
// ============================================================================

/**
 * CodeMirror 6 Engine for TiddlyWiki5
 * 
 * Core options:
 * @param {Object} options.widget - TiddlyWiki widget reference
 * @param {HTMLElement} options.parentNode - DOM parent for editor
 * @param {Node} options.nextSibling - Insert before this sibling
 * @param {string} options.value - Initial text content
 * @param {boolean} options.readOnly - Read-only mode
 * @param {boolean} options.autofocus - Focus on mount
 * @param {Function} options.onChange - Change callback
 * @param {Function} options.onBlurSave - Blur save callback
 * @param {number} options.changeDebounceMs - Change debounce (default 150)
 * @param {string} options.tiddlerType - Explicit content type
 * @param {string} options.tiddlerTitle - Explicit tiddler title
 * @param {boolean} options.loadPlugins - Load plugins (default true)
 * @param {Array} options.extensions - Additional CM6 extensions
 * 
 * Additional options are passed to plugins via context.options
 */
function CodeMirrorEngine(options) {
	options = options || {};
	var self = this;

	// ========================================================================
	// Validation
	// ========================================================================
	
	if (!$tw || !$tw.browser) {
		throw new Error("CodeMirrorEngine can only run in the browser.");
	}
	if (!options.parentNode) {
		throw new Error("CodeMirrorEngine requires options.parentNode.");
	}
	if (!hasWindowTimers()) {
		throw new Error("No window timers available.");
	}

	// ========================================================================
	// Instance State
	// ========================================================================
	
	this.widget = options.widget || null;
	this.parentNode = options.parentNode;
	this.nextSibling = options.nextSibling || null;
	this.options = options;
	
	this._destroyed = false;
	this._pendingChange = false;
	// Default debounce: 50ms for snappy feel while still coalescing rapid changes
	// TW's standard engine saves immediately, but some debounce helps performance
	this._debounceMs = isNumber(options.changeDebounceMs) ? clamp(options.changeDebounceMs, 0, 2000) : 50;
	this._debounceHandle = null;
	this._lastEmittedText = isString(options.value) ? options.value : "";

	// Callbacks
	this._onChange = isFunction(options.onChange) ? options.onChange : null;
	this._onBlurSave = isFunction(options.onBlurSave) ? options.onBlurSave : null;
	
	// Event handlers from plugins
	this._eventHandlers = {};
	
	// Active plugins for this instance
	this._activePlugins = [];

	// ========================================================================
	// Load CM6 Core
	// ========================================================================
	
	var core = getCM6Core();
	this.cm = core;

	var EditorState = core.state.EditorState;
	var EditorView = core.view.EditorView;
	var Compartment = core.state.Compartment;
	var cmKeymap = core.view.keymap;

	// Store for later use
	this._EditorState = EditorState;
	this._EditorView = EditorView;
	this._Compartment = Compartment;

	// ========================================================================
	// Compartments (core + plugin-registered)
	// ========================================================================
	
	this._compartments = {
		// Core compartment for read-only state
		readOnly: new Compartment()
	};

	// ========================================================================
	// Build Plugin Context
	// ========================================================================
	
	var context = buildPluginContext(options, this);
	this._pluginContext = context;

	// ========================================================================
	// Collect Plugin Compartments
	// ========================================================================
	
	var plugins = options.loadPlugins !== false ? discoverPlugins() : [];
	
	for (var i = 0; i < plugins.length; i++) {
		var plugin = plugins[i];
		
		try {
			// Check condition
			var shouldLoad = true;
			if (isFunction(plugin.condition)) {
				shouldLoad = plugin.condition(context);
			}
			
			if (!shouldLoad) continue;
			
			// Register compartments
			if (isFunction(plugin.registerCompartments)) {
				var pluginCompartments = plugin.registerCompartments();
				if (isObject(pluginCompartments)) {
					for (var compName in pluginCompartments) {
						if (pluginCompartments.hasOwnProperty(compName) && !this._compartments[compName]) {
							this._compartments[compName] = pluginCompartments[compName];
						}
					}
				}
			}
			
			this._activePlugins.push(plugin);
		} catch (e) {
			console.error("Error processing plugin '" + plugin.name + "':", e);
		}
	}

	// ========================================================================
	// Build Extensions
	// ========================================================================
	
	var extensions = [];

	// Core: Read-only compartment
	extensions.push(
		this._compartments.readOnly.of(
			EditorState.readOnly.of(!!options.readOnly)
		)
	);

	// Core: Basic keymap if available
	var defaultKeymap = (core.commands || {}).defaultKeymap || [];
	var indentWithTab = (core.commands || {}).indentWithTab;
	
	var km = [];
	if (defaultKeymap.length) km = km.concat(defaultKeymap);
	if (indentWithTab) km.push(indentWithTab);
	
	if (km.length && cmKeymap) {
		extensions.push(cmKeymap.of(km));
	}

	// Collect extensions from plugins
	for (var j = 0; j < this._activePlugins.length; j++) {
		var activePlugin = this._activePlugins[j];
		
		try {
			if (isFunction(activePlugin.getExtensions)) {
				var pluginExtensions = activePlugin.getExtensions(context);
				if (isArray(pluginExtensions)) {
					extensions = extensions.concat(pluginExtensions);
				}
			}
		} catch (e) {
			console.error("Error getting extensions from plugin '" + activePlugin.name + "':", e);
		}
	}

	// User-provided extensions
	if (isArray(options.extensions)) {
		extensions = extensions.concat(options.extensions);
	}

	// ========================================================================
	// Core Update Listener
	// ========================================================================
	
	extensions.push(
		EditorView.updateListener.of(function(update) {
			if (self._destroyed) return;
			
			if (update.docChanged) {
				self._pendingChange = true;
				self._scheduleEmit();
				self._triggerEvent("docChanged", update);
			}
			
			if (update.selectionSet) {
				self._triggerEvent("selectionChanged", update);
			}
			
			if (update.focusChanged) {
				if (update.view.hasFocus) {
					self._triggerEvent("focus", update);
				} else {
					self._handleBlur();
					self._triggerEvent("blur", update);
				}
			}
		})
	);

	// ========================================================================
	// TiddlyWiki Keyboard Shortcut Integration
	// ========================================================================
	
	extensions.push(
		EditorView.domEventHandlers({
			keydown: function(event, view) {
				if (self._destroyed) return false;
				
				// Let TiddlyWiki widget handle keyboard shortcuts (toolbar, etc.)
				if (self.widget && typeof self.widget.handleKeydownEvent === "function") {
					var handled = self.widget.handleKeydownEvent(event);
					if (handled) {
						return true; // Prevent CM6 from handling
					}
				}
				
				return false; // Let CM6 handle normally
			},
			
			// File drop handling (for TW dropzone integration)
			drop: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleDropEvent === "function") {
					return self.widget.handleDropEvent(event);
				}
				return false;
			},
			
			dragenter: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleDragEnterEvent === "function") {
					return self.widget.handleDragEnterEvent(event);
				}
				return false;
			},
			
			dragover: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleDragOverEvent === "function") {
					return self.widget.handleDragOverEvent(event);
				}
				return false;
			},
			
			dragleave: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleDragLeaveEvent === "function") {
					return self.widget.handleDragLeaveEvent(event);
				}
				return false;
			},
			
			dragend: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleDragEndEvent === "function") {
					return self.widget.handleDragEndEvent(event);
				}
				return false;
			},
			
			// Paste handling (for file paste)
			paste: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handlePasteEvent === "function") {
					return self.widget.handlePasteEvent(event);
				}
				return false;
			},
			
			// Click handling (for some TW features)
			click: function(event, view) {
				if (self._destroyed) return false;
				if (self.widget && typeof self.widget.handleClickEvent === "function") {
					return self.widget.handleClickEvent(event);
				}
				return false;
			}
		})
	);

	// ========================================================================
	// Create Editor
	// ========================================================================
	
	this.domNode = document.createElement("div");
	this.domNode.className = "tc-editor-codemirror6";

	var initialText = isString(options.value) ? options.value : "";
	
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

	// Register domNode with widget for proper cleanup on refresh
	if (this.widget && this.widget.domNodes) {
		this.widget.domNodes.push(this.domNode);
	}

	// ========================================================================
	// Extend API from Plugins
	// ========================================================================
	
	for (var k = 0; k < this._activePlugins.length; k++) {
		var apiPlugin = this._activePlugins[k];
		
		try {
			// Extend API
			if (isFunction(apiPlugin.extendAPI)) {
				var apiMethods = apiPlugin.extendAPI(this, context);
				if (isObject(apiMethods)) {
					for (var methodName in apiMethods) {
						if (apiMethods.hasOwnProperty(methodName) && isFunction(apiMethods[methodName])) {
							// Don't override existing methods
							if (!this[methodName]) {
								this[methodName] = apiMethods[methodName].bind(this);
							}
						}
					}
				}
			}
			
			// Register events
			if (isFunction(apiPlugin.registerEvents)) {
				var eventHandlers = apiPlugin.registerEvents(this, context);
				if (isObject(eventHandlers)) {
					for (var eventName in eventHandlers) {
						if (eventHandlers.hasOwnProperty(eventName) && isFunction(eventHandlers[eventName])) {
							this.on(eventName, eventHandlers[eventName]);
						}
					}
				}
			}
		} catch (e) {
			console.error("Error extending API from plugin '" + apiPlugin.name + "':", e);
		}
	}

	// ========================================================================
	// Autofocus
	// ========================================================================
	
	if (options.autofocus) {
		this.focus();
	}
}

// ============================================================================
// Internal Methods
// ============================================================================

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

	// Call onChange callback if provided (standalone usage)
	if (this._onChange) {
		try {
			this._onChange(text);
		} catch (e) {
			console.error("onChange failed:", e);
		}
	}

	// TiddlyWiki integration: save changes through widget
	// The factory.js doesn't pass onChange - it expects the engine to call widget.saveChanges()
	if (this.widget && typeof this.widget.saveChanges === "function") {
		try {
			this.widget.saveChanges(text);
		} catch (e) {
			console.error("widget.saveChanges failed:", e);
		}
	}
};

CodeMirrorEngine.prototype._handleBlur = function() {
	if (this._destroyed) return;
	
	this._emitNow();
	
	if (this._pendingChange && this._onBlurSave) {
		try {
			this._onBlurSave();
		} catch (e) {
			console.error("onBlurSave failed:", e);
		}
	}
};

CodeMirrorEngine.prototype._triggerEvent = function(eventName, data) {
	var handlers = this._eventHandlers[eventName];
	if (!handlers) return;
	
	for (var i = 0; i < handlers.length; i++) {
		try {
			handlers[i].call(this, data);
		} catch (e) {
			console.error("Event handler failed for '" + eventName + "':", e);
		}
	}
};

// ============================================================================
// Event System
// ============================================================================

/**
 * Register event handler
 * @param {string} eventName
 * @param {Function} handler
 */
CodeMirrorEngine.prototype.on = function(eventName, handler) {
	if (!isFunction(handler)) return;
	if (!this._eventHandlers[eventName]) {
		this._eventHandlers[eventName] = [];
	}
	this._eventHandlers[eventName].push(handler);
};

/**
 * Remove event handler
 * @param {string} eventName
 * @param {Function} handler
 */
CodeMirrorEngine.prototype.off = function(eventName, handler) {
	var handlers = this._eventHandlers[eventName];
	if (!handlers) return;
	
	var idx = handlers.indexOf(handler);
	if (idx >= 0) {
		handlers.splice(idx, 1);
	}
};

// ============================================================================
// Core Document API (minimal)
// ============================================================================

/**
 * Get document text
 * @returns {string}
 */
CodeMirrorEngine.prototype.getText = function() {
	if (this._destroyed) return "";
	return this.view.state.doc.toString();
};

/**
 * Set document text
 * @param {string} text
 * @param {string=} type - optional content type (passed by TW factory)
 */
CodeMirrorEngine.prototype.setText = function(text, type) {
	if (this._destroyed) return;
	if (!isString(text)) text = String(text);

	// Store type if provided (TW factory passes it)
	if (type !== undefined) {
		this._currentType = type;
		if (this._pluginContext) this._pluginContext.tiddlerType = type;
	}

	var current = this.view.state.doc.toString();
	
	// Don't change anything if text is the same
	if (text === current) return;

	// CRITICAL: Prevent race condition when user is typing
	// 
	// The problem:
	// 1. User types "a" -> scheduleEmit (150ms debounce)
	// 2. User types "b" -> text is "ab", new timer
	// 3. Debounce fires -> saveChanges("ab")
	// 4. User types "c" -> text is "abc"
	// 5. TW refresh -> setText("ab") - would overwrite "abc"!
	//
	// Solution: If we have pending changes AND the incoming text matches
	// what we last saved, it's just TW echoing back our save. Ignore it.
	if (this._pendingChange && text === this._lastEmittedText) {
		return; // Ignore TW echo, keep user's current typing
	}

	// This is a genuine external change - accept it
	var sel = this.view.state.selection.main;
	var newLen = text.length;

	this.view.dispatch({
		changes: { from: 0, to: this.view.state.doc.length, insert: text },
		selection: {
			anchor: clamp(sel.anchor, 0, newLen),
			head: clamp(sel.head, 0, newLen)
		}
	});

	// Update tracking to prevent echo loops
	this._lastEmittedText = text;
	this._pendingChange = false;
};

/**
 * Focus editor
 */
CodeMirrorEngine.prototype.focus = function() {
	if (this._destroyed) return;
	this.view.focus();
};

/**
 * Check if editor has focus
 * @returns {boolean}
 */
CodeMirrorEngine.prototype.hasFocus = function() {
	if (this._destroyed) return false;
	return this.view.hasFocus;
};

// ============================================================================
// Core Compartment API
// ============================================================================

/**
 * Reconfigure a compartment
 * @param {string} compartmentName
 * @param {Extension|Extension[]} extension
 */
CodeMirrorEngine.prototype.reconfigure = function(compartmentName, extension) {
	if (this._destroyed) return;
	
	var compartment = this._compartments[compartmentName];
	if (!compartment) {
		console.warn("Unknown compartment:", compartmentName);
		return;
	}
	
	this.view.dispatch({
		effects: compartment.reconfigure(extension)
	});
};

/**
 * Set read-only state
 * @param {boolean} readOnly
 */
CodeMirrorEngine.prototype.setReadOnly = function(readOnly) {
	this.reconfigure("readOnly", this._EditorState.readOnly.of(!!readOnly));
};

/**
 * Get available compartment names
 * @returns {string[]}
 */
CodeMirrorEngine.prototype.getCompartments = function() {
	return Object.keys(this._compartments);
};

// ============================================================================
// TiddlyWiki Compatibility API
// ============================================================================

/**
 * Update DOM node text (TW compatibility)
 * @param {string} text
 */
CodeMirrorEngine.prototype.updateDomNodeText = function(text) {
	this.setText(text);
};

/**
 * Create text operation (TW compatibility)
 * @param {string} type
 * @returns {Object}
 */
CodeMirrorEngine.prototype.createTextOperation = function(type) {
	if (this._destroyed) return null;

	var sel = this.view.state.selection.main;

	return {
		type: type,
		text: this.getText(),
		selStart: sel.from,
		selEnd: sel.to,
		selection: this.view.state.doc.sliceString(sel.from, sel.to),
		replacement: null,
		newSelStart: null,
		newSelEnd: null
	};
};

/**
 * Execute text operation (TW compatibility)
 * TW editor operations modify the operation object:
 * - operation.replacement: text to insert at selection
 * - operation.text: full new document text (for replace-all)
 * - operation.newSelStart/newSelEnd: new selection position
 * @param {Object} operation
 * @returns {string} the new document text
 */
CodeMirrorEngine.prototype.executeTextOperation = function(operation) {
	if (this._destroyed || !operation) return this.getText();

	var type = operation.type;
	var from = isNumber(operation.selStart) ? operation.selStart : this.view.state.selection.main.from;
	var to = isNumber(operation.selEnd) ? operation.selEnd : from;

	switch (type) {
		case "focus-editor":
			this.focus();
			break;

		case "insert-text":
		case "replace-selection":
			// Standard operation: replace selection with operation.replacement
			if (operation.replacement !== null && operation.replacement !== undefined) {
				var insert = String(operation.replacement);
				this.view.dispatch({
					changes: { from: from, to: to, insert: insert },
					selection: { anchor: from + insert.length }
				});
			}
			break;

		case "replace-all":
			// Replace entire document
			if (operation.text !== null && operation.text !== undefined) {
				this.view.dispatch({
					changes: { from: 0, to: this.view.state.doc.length, insert: String(operation.text) }
				});
			}
			break;

		case "set-selection":
			if (isNumber(operation.newSelStart)) {
				this.view.dispatch({
					selection: {
						anchor: operation.newSelStart,
						head: isNumber(operation.newSelEnd) ? operation.newSelEnd : operation.newSelStart
					}
				});
			}
			break;

		case "save":
			// Force emit pending changes
			this._emitNow();
			break;

		case "undo":
			if (this.undo) this.undo();
			break;

		case "redo":
			if (this.redo) this.redo();
			break;

		default:
			// Standard TW behavior: if replacement is set, insert it
			if (operation.replacement !== null && operation.replacement !== undefined) {
				var insertText = String(operation.replacement);
				this.view.dispatch({
					changes: { from: from, to: to, insert: insertText },
					selection: { anchor: from + insertText.length }
				});
			}
			// Let plugins handle additional operations
			this._triggerEvent("textOperation", operation);
	}

	// Set new selection if specified
	if (isNumber(operation.newSelStart)) {
		var newAnchor = operation.newSelStart;
		var newHead = isNumber(operation.newSelEnd) ? operation.newSelEnd : newAnchor;
		// Clamp to document length
		var docLen = this.view.state.doc.length;
		newAnchor = clamp(newAnchor, 0, docLen);
		newHead = clamp(newHead, 0, docLen);
		this.view.dispatch({
			selection: { anchor: newAnchor, head: newHead }
		});
	}

	// Return current text (required by factory.js)
	return this.getText();
};

/**
 * Fix height (TW compatibility - no-op)
 */
CodeMirrorEngine.prototype.fixHeight = function() {};

/**
 * Refresh editor
 */
CodeMirrorEngine.prototype.refresh = function() {
	if (this._destroyed) return;
	this.view.requestMeasure();
};

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Destroy editor and clean up
 */
CodeMirrorEngine.prototype.destroy = function() {
	if (this._destroyed) return;
	this._destroyed = true;

	// Notify plugins
	for (var i = 0; i < this._activePlugins.length; i++) {
		var plugin = this._activePlugins[i];
		if (isFunction(plugin.destroy)) {
			try {
				plugin.destroy(this);
			} catch (e) {
				console.error("Plugin destroy failed for '" + plugin.name + "':", e);
			}
		}
	}

	if (this._debounceHandle !== null) {
		window.clearTimeout(this._debounceHandle);
		this._debounceHandle = null;
	}

	try {
		if (this.view) this.view.destroy();
	} catch (e) {
		console.error("view.destroy failed:", e);
	}

	try {
		if (this.domNode && this.domNode.parentNode) {
			this.domNode.parentNode.removeChild(this.domNode);
		}
	} catch (e) {}

	this.view = null;
	this.domNode = null;
	this.widget = null;
	this._compartments = null;
	this._eventHandlers = null;
	this._activePlugins = null;
};

/**
 * Check if destroyed
 * @returns {boolean}
 */
CodeMirrorEngine.prototype.isDestroyed = function() {
	return this._destroyed;
};

// ============================================================================
// Exports
// ============================================================================

exports.CodeMirrorEngine = CodeMirrorEngine;
exports.discoverPlugins = discoverPlugins;
exports.clearPluginCache = clearPluginCache;
exports.getCM6Core = getCM6Core;
exports.buildPluginContext = buildPluginContext;
exports.PLUGIN_MODULE_TYPE = PLUGIN_MODULE_TYPE;
