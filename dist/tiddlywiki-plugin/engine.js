/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/engine.js
type: application/javascript
module-type: library

CodeMirror 6 engine for TiddlyWiki5 with comprehensive API.

Features:
- Modular plugin architecture via module-type: codemirror6-plugin
- Conditional plugin loading based on tiddler type
- Dynamic reconfiguration via compartments
- Full selection/cursor API
- Decoration and gutter support
- Search and replace
- Autocomplete integration
- Code folding
- Event handling
- TiddlyWiki toolbar integration

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

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function hasWindowTimers() {
	return typeof window !== "undefined" && 
		typeof window.setTimeout === "function" && 
		typeof window.clearTimeout === "function";
}

function noop() {}

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
		" exporting {state, view, commands, history, language, autocomplete, search, fold, lint}."
	);
}

// ============================================================================
// Plugin System
// ============================================================================

function discoverPlugins() {
	if (_pluginCache) return _pluginCache;

	var plugins = [];

	if ($tw && $tw.modules && $tw.modules.types[PLUGIN_MODULE_TYPE]) {
		var pluginModules = $tw.modules.types[PLUGIN_MODULE_TYPE];
		
		$tw.utils.each(pluginModules, function(moduleInfo, moduleName) {
			try {
				var pluginModule = require(moduleName);
				var pluginDef = pluginModule.default || pluginModule.plugin || pluginModule;
				
				if (pluginDef && isFunction(pluginDef.getExtensions)) {
					pluginDef.name = pluginDef.name || moduleName;
					pluginDef.priority = isNumber(pluginDef.priority) ? pluginDef.priority : 0;
					pluginDef._moduleName = moduleName;
					plugins.push(pluginDef);
				}
			} catch (e) {
				console.error("Failed to load CM6 plugin '" + moduleName + "':", e);
			}
		});
	}

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
		engine: engine
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

function getPluginExtensions(context) {
	var plugins = discoverPlugins();
	var extensions = [];

	for (var i = 0; i < plugins.length; i++) {
		var plugin = plugins[i];
		
		try {
			var shouldLoad = true;
			if (isFunction(plugin.condition)) {
				shouldLoad = plugin.condition(context);
			}
			
			if (shouldLoad) {
				var pluginExtensions = plugin.getExtensions(context);
				if (isArray(pluginExtensions)) {
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
 * CodeMirror 6 Engine for TiddlyWiki5
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.widget - TiddlyWiki widget reference
 * @param {HTMLElement} options.parentNode - DOM parent for editor
 * @param {Node} options.nextSibling - Insert before this sibling
 * @param {string} options.value - Initial text content
 * @param {boolean} options.readOnly - Read-only mode
 * @param {boolean} options.autofocus - Focus on mount
 * @param {boolean} options.lineNumbers - Show line numbers
 * @param {boolean} options.lineWrapping - Wrap long lines
 * @param {boolean} options.foldGutter - Show fold gutter
 * @param {boolean} options.highlightActiveLine - Highlight current line
 * @param {boolean} options.highlightSelectionMatches - Highlight selection matches
 * @param {boolean} options.bracketMatching - Match brackets
 * @param {boolean} options.closeBrackets - Auto-close brackets
 * @param {boolean} options.autocompletion - Enable autocomplete
 * @param {boolean} options.search - Enable search panel
 * @param {string} options.placeholder - Placeholder text
 * @param {string} options.theme - Theme name ('light' or 'dark')
 * @param {number} options.tabSize - Tab size (default 4)
 * @param {boolean} options.indentWithTabs - Use tabs for indentation
 * @param {Function} options.onChange - Change callback
 * @param {Function} options.onFocus - Focus callback
 * @param {Function} options.onBlur - Blur callback
 * @param {Function} options.onBlurSave - Blur save callback
 * @param {Function} options.onSelectionChange - Selection change callback
 * @param {Function} options.onCursorActivity - Cursor activity callback
 * @param {number} options.changeDebounceMs - Change debounce (default 150)
 * @param {string} options.tiddlerType - Explicit content type
 * @param {string} options.tiddlerTitle - Explicit tiddler title
 * @param {boolean} options.loadPlugins - Load plugins (default true)
 * @param {Array} options.extensions - Additional CM6 extensions
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
	this._debounceMs = isNumber(options.changeDebounceMs) ? clamp(options.changeDebounceMs, 0, 2000) : 150;
	this._debounceHandle = null;
	this._lastEmittedText = isString(options.value) ? options.value : "";

	// Callbacks
	this._onChange = isFunction(options.onChange) ? options.onChange : null;
	this._onFocus = isFunction(options.onFocus) ? options.onFocus : null;
	this._onBlur = isFunction(options.onBlur) ? options.onBlur : null;
	this._onBlurSave = isFunction(options.onBlurSave) ? options.onBlurSave : null;
	this._onSelectionChange = isFunction(options.onSelectionChange) ? options.onSelectionChange : null;
	this._onCursorActivity = isFunction(options.onCursorActivity) ? options.onCursorActivity : null;

	// ========================================================================
	// Load CM6 Core
	// ========================================================================
	
	var core = getCM6Core();
	this.cm = core;

	var EditorState = core.state.EditorState;
	var EditorView = core.view.EditorView;
	var Compartment = core.state.Compartment;
	var cmKeymap = core.view.keymap;
	var StateEffect = core.state.StateEffect;
	var StateField = core.state.StateField;

	// Commands
	var defaultKeymap = (core.commands || {}).defaultKeymap || [];
	var indentWithTab = (core.commands || {}).indentWithTab;
	var historyKeymap = (core.history || {}).historyKeymap || [];
	var history = (core.history || {}).history;
	var undo = (core.history || {}).undo;
	var redo = (core.history || {}).redo;
	var undoDepth = (core.history || {}).undoDepth;
	var redoDepth = (core.history || {}).redoDepth;

	// Language
	var indentUnit = (core.language || {}).indentUnit;
	var syntaxHighlighting = (core.language || {}).syntaxHighlighting;
	var defaultHighlightStyle = (core.language || {}).defaultHighlightStyle;
	var bracketMatching = (core.language || {}).bracketMatching;
	var foldGutter = (core.language || {}).foldGutter;
	var foldKeymap = (core.language || {}).foldKeymap || [];
	var codeFolding = (core.language || {}).codeFolding;

	// View features
	var lineNumbers = (core.view || {}).lineNumbers;
	var highlightActiveLine = (core.view || {}).highlightActiveLine;
	var highlightActiveLineGutter = (core.view || {}).highlightActiveLineGutter;
	var highlightSpecialChars = (core.view || {}).highlightSpecialChars;
	var drawSelection = (core.view || {}).drawSelection;
	var dropCursor = (core.view || {}).dropCursor;
	var rectangularSelection = (core.view || {}).rectangularSelection;
	var crosshairCursor = (core.view || {}).crosshairCursor;
	var placeholder = (core.view || {}).placeholder;

	// Autocomplete
	var autocompletion = (core.autocomplete || {}).autocompletion;
	var completionKeymap = (core.autocomplete || {}).completionKeymap || [];
	var closeBrackets = (core.autocomplete || {}).closeBrackets;
	var closeBracketsKeymap = (core.autocomplete || {}).closeBracketsKeymap || [];

	// Search
	var searchKeymap = (core.search || {}).searchKeymap || [];
	var highlightSelectionMatches = (core.search || {}).highlightSelectionMatches;

	// Lint
	var lintKeymap = (core.lint || {}).lintKeymap || [];

	// ========================================================================
	// Compartments for Dynamic Reconfiguration
	// ========================================================================
	
	this._compartments = {
		language: new Compartment(),
		theme: new Compartment(),
		readOnly: new Compartment(),
		lineNumbers: new Compartment(),
		lineWrapping: new Compartment(),
		tabSize: new Compartment(),
		placeholder: new Compartment(),
		autocompletion: new Compartment(),
		foldGutter: new Compartment(),
		highlightActiveLine: new Compartment(),
		bracketMatching: new Compartment(),
		closeBrackets: new Compartment()
	};

	// ========================================================================
	// Build Extensions
	// ========================================================================
	
	var extensions = [];

	// Basic editing features
	if (highlightSpecialChars) extensions.push(highlightSpecialChars());
	if (drawSelection) extensions.push(drawSelection());
	if (dropCursor) extensions.push(dropCursor());
	if (rectangularSelection) extensions.push(rectangularSelection());

	// History
	if (isFunction(history)) extensions.push(history());

	// Read-only compartment
	extensions.push(
		this._compartments.readOnly.of(
			EditorState.readOnly.of(!!options.readOnly)
		)
	);

	// Line numbers compartment
	extensions.push(
		this._compartments.lineNumbers.of(
			options.lineNumbers !== false && lineNumbers ? lineNumbers() : []
		)
	);

	// Line wrapping compartment
	extensions.push(
		this._compartments.lineWrapping.of(
			options.lineWrapping ? EditorView.lineWrapping : []
		)
	);

	// Tab size compartment
	var tabSize = isNumber(options.tabSize) ? options.tabSize : 4;
	if (indentUnit) {
		extensions.push(
			this._compartments.tabSize.of(
				indentUnit.of(options.indentWithTabs ? "\t" : " ".repeat(tabSize))
			)
		);
	}

	// Placeholder compartment
	if (placeholder && options.placeholder) {
		extensions.push(
			this._compartments.placeholder.of(placeholder(options.placeholder))
		);
	}

	// Highlight active line compartment
	extensions.push(
		this._compartments.highlightActiveLine.of(
			options.highlightActiveLine !== false && highlightActiveLine ? 
				[highlightActiveLine(), highlightActiveLineGutter ? highlightActiveLineGutter() : []] : []
		)
	);

	// Bracket matching compartment
	extensions.push(
		this._compartments.bracketMatching.of(
			options.bracketMatching !== false && bracketMatching ? bracketMatching() : []
		)
	);

	// Close brackets compartment
	extensions.push(
		this._compartments.closeBrackets.of(
			options.closeBrackets && closeBrackets ? closeBrackets() : []
		)
	);

	// Fold gutter compartment
	extensions.push(
		this._compartments.foldGutter.of(
			options.foldGutter && foldGutter ? foldGutter() : []
		)
	);

	// Selection matches
	if (options.highlightSelectionMatches !== false && highlightSelectionMatches) {
		extensions.push(highlightSelectionMatches());
	}

	// Autocompletion compartment
	extensions.push(
		this._compartments.autocompletion.of(
			options.autocompletion && autocompletion ? autocompletion() : []
		)
	);

	// Syntax highlighting
	if (syntaxHighlighting && defaultHighlightStyle) {
		extensions.push(syntaxHighlighting(defaultHighlightStyle, {fallback: true}));
	}

	// Theme compartment (placeholder for theme switching)
	extensions.push(this._compartments.theme.of([]));

	// Language compartment (placeholder for language switching)
	extensions.push(this._compartments.language.of([]));

	// Build keymap
	var km = [];
	if (closeBracketsKeymap.length) km = km.concat(closeBracketsKeymap);
	if (defaultKeymap.length) km = km.concat(defaultKeymap);
	if (searchKeymap.length && options.search !== false) km = km.concat(searchKeymap);
	if (historyKeymap.length) km = km.concat(historyKeymap);
	if (foldKeymap.length && options.foldGutter) km = km.concat(foldKeymap);
	if (completionKeymap.length && options.autocompletion) km = km.concat(completionKeymap);
	if (lintKeymap.length) km = km.concat(lintKeymap);
	if (indentWithTab) km.push(indentWithTab);
	
	if (km.length && cmKeymap) {
		extensions.push(cmKeymap.of(km));
	}

	// Load plugin extensions
	if (options.loadPlugins !== false) {
		var context = buildPluginContext(options, this);
		this._pluginContext = context;
		var pluginExtensions = getPluginExtensions(context);
		extensions = extensions.concat(pluginExtensions);
	}

	// User-provided extensions
	if (isArray(options.extensions)) {
		extensions = extensions.concat(options.extensions);
	}

	// ========================================================================
	// Update Listeners
	// ========================================================================
	
	// Document change listener
	extensions.push(
		EditorView.updateListener.of(function(update) {
			if (self._destroyed) return;
			
			if (update.docChanged) {
				self._pendingChange = true;
				self._scheduleEmit();
			}
			
			if (update.selectionSet && self._onSelectionChange) {
				try {
					self._onSelectionChange(self.getSelection());
				} catch (e) {
					console.error("onSelectionChange failed:", e);
				}
			}
		})
	);

	// Focus/blur tracking
	extensions.push(
		EditorView.domEventHandlers({
			focus: function(event, view) {
				if (self._destroyed) return;
				if (self._onFocus) {
					try { self._onFocus(event); } catch (e) { console.error("onFocus failed:", e); }
				}
			},
			blur: function(event, view) {
				if (self._destroyed) return;
				self._handleBlur();
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

	// Autofocus
	if (options.autofocus) {
		this.focus();
	}

	// ========================================================================
	// Store References
	// ========================================================================
	
	this._undo = undo;
	this._redo = redo;
	this._undoDepth = undoDepth;
	this._redoDepth = redoDepth;
	this._EditorState = EditorState;
	this._EditorView = EditorView;
	this._StateEffect = StateEffect;
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

	if (this._onChange) {
		try {
			this._onChange(text);
		} catch (e) {
			console.error("onChange failed:", e);
		}
	}
};

CodeMirrorEngine.prototype._handleBlur = function() {
	if (this._destroyed) return;
	
	this._emitNow();
	
	if (this._onBlur) {
		try { this._onBlur(); } catch (e) { console.error("onBlur failed:", e); }
	}
	
	if (this._pendingChange && this._onBlurSave) {
		try { this._onBlurSave(); } catch (e) { console.error("onBlurSave failed:", e); }
	}
};

// ============================================================================
// Document API
// ============================================================================

CodeMirrorEngine.prototype.getText = function() {
	if (this._destroyed) return "";
	return this.view.state.doc.toString();
};

CodeMirrorEngine.prototype.setText = function(text, preserveSelection) {
	if (this._destroyed) return;
	if (!isString(text)) text = String(text);

	var current = this.view.state.doc.toString();
	if (text === current) return;

	var transaction = {
		changes: { from: 0, to: this.view.state.doc.length, insert: text }
	};

	if (preserveSelection !== false) {
		var sel = this.view.state.selection.main;
		var newLen = text.length;
		transaction.selection = {
			anchor: clamp(sel.anchor, 0, newLen),
			head: clamp(sel.head, 0, newLen)
		};
	}

	this.view.dispatch(transaction);
};

CodeMirrorEngine.prototype.getLineCount = function() {
	if (this._destroyed) return 0;
	return this.view.state.doc.lines;
};

CodeMirrorEngine.prototype.getLine = function(lineNumber) {
	if (this._destroyed) return "";
	try {
		return this.view.state.doc.line(lineNumber).text;
	} catch (e) {
		return "";
	}
};

CodeMirrorEngine.prototype.getRange = function(from, to) {
	if (this._destroyed) return "";
	return this.view.state.doc.sliceString(from, to);
};

CodeMirrorEngine.prototype.replaceRange = function(from, to, text) {
	if (this._destroyed) return;
	this.view.dispatch({
		changes: { from: from, to: to, insert: text }
	});
};

CodeMirrorEngine.prototype.insert = function(text, pos) {
	if (this._destroyed) return;
	if (pos === undefined) {
		pos = this.view.state.selection.main.head;
	}
	this.view.dispatch({
		changes: { from: pos, insert: text },
		selection: { anchor: pos + text.length }
	});
};

// ============================================================================
// Selection API
// ============================================================================

CodeMirrorEngine.prototype.getSelection = function() {
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
};

CodeMirrorEngine.prototype.setSelection = function(anchor, head) {
	if (this._destroyed) return;
	if (head === undefined) head = anchor;
	
	var len = this.view.state.doc.length;
	this.view.dispatch({
		selection: {
			anchor: clamp(anchor, 0, len),
			head: clamp(head, 0, len)
		}
	});
};

CodeMirrorEngine.prototype.getCursor = function() {
	if (this._destroyed) return 0;
	return this.view.state.selection.main.head;
};

CodeMirrorEngine.prototype.setCursor = function(pos) {
	this.setSelection(pos, pos);
};

CodeMirrorEngine.prototype.selectAll = function() {
	if (this._destroyed) return;
	this.setSelection(0, this.view.state.doc.length);
};

CodeMirrorEngine.prototype.replaceSelection = function(text, select) {
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
};

CodeMirrorEngine.prototype.getWordAt = function(pos) {
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
};

// ============================================================================
// Cursor/Position Utilities
// ============================================================================

CodeMirrorEngine.prototype.posToLineCol = function(pos) {
	if (this._destroyed) return { line: 1, column: 1 };
	
	var line = this.view.state.doc.lineAt(pos);
	return {
		line: line.number,
		column: pos - line.from + 1
	};
};

CodeMirrorEngine.prototype.lineColToPos = function(line, column) {
	if (this._destroyed) return 0;
	
	try {
		var lineObj = this.view.state.doc.line(line);
		return lineObj.from + Math.min(column - 1, lineObj.length);
	} catch (e) {
		return 0;
	}
};

// ============================================================================
// History API
// ============================================================================

CodeMirrorEngine.prototype.undo = function() {
	if (this._destroyed || !this._undo) return;
	this._undo(this.view);
};

CodeMirrorEngine.prototype.redo = function() {
	if (this._destroyed || !this._redo) return;
	this._redo(this.view);
};

CodeMirrorEngine.prototype.getUndoDepth = function() {
	if (this._destroyed || !this._undoDepth) return 0;
	return this._undoDepth(this.view.state);
};

CodeMirrorEngine.prototype.getRedoDepth = function() {
	if (this._destroyed || !this._redoDepth) return 0;
	return this._redoDepth(this.view.state);
};

CodeMirrorEngine.prototype.canUndo = function() {
	return this.getUndoDepth() > 0;
};

CodeMirrorEngine.prototype.canRedo = function() {
	return this.getRedoDepth() > 0;
};

// ============================================================================
// Focus & Scroll API
// ============================================================================

CodeMirrorEngine.prototype.focus = function() {
	if (this._destroyed) return;
	this.view.focus();
};

CodeMirrorEngine.prototype.hasFocus = function() {
	if (this._destroyed) return false;
	return this.view.hasFocus;
};

CodeMirrorEngine.prototype.scrollTo = function(pos) {
	if (this._destroyed) return;
	this.view.dispatch({
		effects: this._EditorView.scrollIntoView(pos, { y: "center" })
	});
};

CodeMirrorEngine.prototype.scrollCursorIntoView = function() {
	if (this._destroyed) return;
	this.scrollTo(this.getCursor());
};

CodeMirrorEngine.prototype.scrollToLine = function(line) {
	if (this._destroyed) return;
	try {
		var lineObj = this.view.state.doc.line(line);
		this.scrollTo(lineObj.from);
	} catch (e) {}
};

// ============================================================================
// Configuration API
// ============================================================================

CodeMirrorEngine.prototype.setReadOnly = function(readOnly) {
	if (this._destroyed) return;
	this.view.dispatch({
		effects: this._compartments.readOnly.reconfigure(
			this._EditorState.readOnly.of(!!readOnly)
		)
	});
};

CodeMirrorEngine.prototype.setLineNumbers = function(show) {
	if (this._destroyed) return;
	var lineNumbers = (this.cm.view || {}).lineNumbers;
	this.view.dispatch({
		effects: this._compartments.lineNumbers.reconfigure(
			show && lineNumbers ? lineNumbers() : []
		)
	});
};

CodeMirrorEngine.prototype.setLineWrapping = function(wrap) {
	if (this._destroyed) return;
	this.view.dispatch({
		effects: this._compartments.lineWrapping.reconfigure(
			wrap ? this._EditorView.lineWrapping : []
		)
	});
};

CodeMirrorEngine.prototype.setPlaceholder = function(text) {
	if (this._destroyed) return;
	var placeholder = (this.cm.view || {}).placeholder;
	if (!placeholder) return;
	
	this.view.dispatch({
		effects: this._compartments.placeholder.reconfigure(
			text ? placeholder(text) : []
		)
	});
};

CodeMirrorEngine.prototype.reconfigure = function(compartmentName, extensions) {
	if (this._destroyed) return;
	if (!this._compartments[compartmentName]) {
		console.warn("Unknown compartment:", compartmentName);
		return;
	}
	
	this.view.dispatch({
		effects: this._compartments[compartmentName].reconfigure(extensions)
	});
};

// ============================================================================
// TiddlyWiki Integration API
// ============================================================================

CodeMirrorEngine.prototype.updateDomNodeText = function(text) {
	this.setText(text);
};

CodeMirrorEngine.prototype.createTextOperation = function(type) {
	if (this._destroyed) return null;

	var sel = this.getSelection();

	return {
		type: type,
		text: this.getText(),
		selStart: sel.from,
		selEnd: sel.to,
		selection: sel.text,
		replacement: null,
		newSelStart: null,
		newSelEnd: null
	};
};

CodeMirrorEngine.prototype.executeTextOperation = function(operation) {
	if (this._destroyed || !operation) return;

	var type = operation.type;
	var from = isNumber(operation.selStart) ? operation.selStart : this.getCursor();
	var to = isNumber(operation.selEnd) ? operation.selEnd : from;

	switch (type) {
		case "focus-editor":
			this.focus();
			break;
		case "insert-text":
		case "replace-selection":
			var insert = isString(operation.replacement) ? operation.replacement : "";
			this.replaceRange(from, to, insert);
			this.setCursor(from + insert.length);
			break;
		case "undo":
			this.undo();
			break;
		case "redo":
			this.redo();
			break;
		case "set-selection":
			if (isNumber(operation.newSelStart)) {
				this.setSelection(
					operation.newSelStart,
					isNumber(operation.newSelEnd) ? operation.newSelEnd : operation.newSelStart
				);
			}
			break;
	}
};

CodeMirrorEngine.prototype.fixHeight = function() {};

CodeMirrorEngine.prototype.refresh = function() {
	if (this._destroyed) return;
	this.view.requestMeasure();
};

// ============================================================================
// Search API
// ============================================================================

CodeMirrorEngine.prototype.openSearchPanel = function() {
	if (this._destroyed) return;
	var openSearchPanel = (this.cm.search || {}).openSearchPanel;
	if (openSearchPanel) openSearchPanel(this.view);
};

CodeMirrorEngine.prototype.closeSearchPanel = function() {
	if (this._destroyed) return;
	var closeSearchPanel = (this.cm.search || {}).closeSearchPanel;
	if (closeSearchPanel) closeSearchPanel(this.view);
};

CodeMirrorEngine.prototype.findNext = function() {
	if (this._destroyed) return;
	var findNext = (this.cm.search || {}).findNext;
	if (findNext) findNext(this.view);
};

CodeMirrorEngine.prototype.findPrevious = function() {
	if (this._destroyed) return;
	var findPrevious = (this.cm.search || {}).findPrevious;
	if (findPrevious) findPrevious(this.view);
};

// ============================================================================
// Folding API
// ============================================================================

CodeMirrorEngine.prototype.foldAll = function() {
	if (this._destroyed) return;
	var foldAll = (this.cm.language || {}).foldAll;
	if (foldAll) foldAll(this.view);
};

CodeMirrorEngine.prototype.unfoldAll = function() {
	if (this._destroyed) return;
	var unfoldAll = (this.cm.language || {}).unfoldAll;
	if (unfoldAll) unfoldAll(this.view);
};

// ============================================================================
// Lifecycle
// ============================================================================

CodeMirrorEngine.prototype.destroy = function() {
	if (this._destroyed) return;
	this._destroyed = true;

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
};

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
exports.getPluginExtensions = getPluginExtensions;
exports.PLUGIN_MODULE_TYPE = PLUGIN_MODULE_TYPE;
