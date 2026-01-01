/*\
title: $:/plugins/BTC/tiddlywiki-codemirror/modules/subclasses/editor/edit-text.js
type: application/javascript
module-type: widget-subclass

Widget subclass for CodeMirror 6 editor (production-ready)

- Overrides toolbar text operations to route through CM6 engine + plugins
- Centralizes config → emits a single settingsChanged snapshot
- Keeps TW core factory.js unmodified

\*/

/*jslint node: true, browser: true */
/*global $tw: false */

"use strict";

exports.baseClass = "edit-codemirror-6";

exports.constructor = function (parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

exports.prototype = {};

// ============================================================================
// Local utilities (kept local to avoid prototype pollution)
// ============================================================================

function boolConfig(wiki, title) {
	return wiki.getTiddlerText(title) === "yes";
}

function intConfig(wiki, title, fallback) {
	var v = parseInt(wiki.getTiddlerText(title), 10);
	return isFinite(v) ? v : fallback;
}

function isMainTextEditorBody(widget) {
	return !!(widget.editClass && widget.editClass.indexOf("tc-edit-texteditor-body") !== -1);
}

function hopAny(changedTiddlers, list) {
	return $tw.utils.hopArray(changedTiddlers, list);
}

// ============================================================================
// Settings snapshot → engine/plugins
// ============================================================================

/**
 * Build a single settings snapshot from wiki config + widget state.
 * This avoids scattered engine toggles and allows plugins to own behavior.
 */
exports.prototype._buildSettingsSnapshot = function () {
	var wiki = this.wiki;
	var body = isMainTextEditorBody(this);

	return {
		// identity/context
		tiddlerTitle: this.editTitle,
		tiddlerType: this.editType || "",
		hasStylesheetTag: !!this.hasStylesheetTag,
		readOnly: !!this.isDisabled || this.getAttribute("readonly", "no") === "yes",

		// UI / editor chrome
		editorBody: body,
		lineNumbers: boolConfig(wiki, "$:/config/codemirror-6/lineNumbers") && body,
		highlightActiveLine: boolConfig(wiki, "$:/config/codemirror-6/highlightActiveLine") && body,

		// text services
		spellcheck: boolConfig(wiki, "$:/config/codemirror-6/spellcheck"),
		autocorrect: boolConfig(wiki, "$:/config/codemirror-6/autocorrect"),
		translate: boolConfig(wiki, "$:/state/codemirror-6/translate/" + this.editTitle),

		// bracket/structure helpers
		bracketMatching: boolConfig(wiki, "$:/config/codemirror-6/bracketMatching"),
		closeBrackets: boolConfig(wiki, "$:/config/codemirror-6/closeBrackets"),

		// indentation
		indent: {
			indentUnit: wiki.getTiddlerText("$:/config/codemirror-6/indentUnit"),
			indentUnitMultiplier: wiki.getTiddlerText("$:/config/codemirror-6/indentUnitMultiplier"),
			indentWithTab: boolConfig(wiki, "$:/config/codemirror-6/indentWithTab")
		},

		// autocompletion
		autocompletion: {
			selectOnOpen: boolConfig(wiki, "$:/config/codemirror-6/selectOnOpen"),
			icons: boolConfig(wiki, "$:/config/codemirror-6/autocompleteIcons"),
			maxRenderedOptions: intConfig(wiki, "$:/config/codemirror-6/maxRenderedOptions", 100),
			activateOnTyping: boolConfig(wiki, "$:/config/codemirror-6/activateOnTyping"),
			completeAnyWord: boolConfig(wiki, "$:/config/codemirror-6/completeAnyWord")
		}
	};
};

/**
 * Apply all config/state-driven engine settings in one place.
 * In the new architecture this *emits* settingsChanged for plugins to interpret.
 */
exports.prototype.applyEngineSettings = function () {
	var engine = this.engine;
	if (!engine || (engine.isDestroyed && engine.isDestroyed())) return;

	var settings = this._buildSettingsSnapshot();

	// Preferred public API
	if (typeof engine.dispatchPluginEvent === "function") {
		engine.dispatchPluginEvent("settingsChanged", settings);
		return;
	}

	// Fallback (should not be needed if engine is updated)
	if (typeof engine.on === "function" && typeof engine._triggerEvent === "function") {
		engine._triggerEvent("settingsChanged", settings);
	}
};

/**
 * Cache whether the edited tiddler is tagged as stylesheet.
 */
exports.prototype.updateStylesheetTagCache = function () {
	var editTiddler = this.wiki.getTiddler(this.editTitle);
	this.hasStylesheetTag = !!(editTiddler && editTiddler.hasTag("$:/tags/Stylesheet"));
};

// ============================================================================
// Lifecycle
// ============================================================================

exports.prototype.render = function (parent, nextSibling) {
	// Call base class render
	Object.getPrototypeOf(Object.getPrototypeOf(this)).render.call(this, parent, nextSibling);

	// Init shortcut caches
	this.shortcutKeysList = [];
	this.shortcutActionList = [];
	this.shortcutParsedList = [];
	this.shortcutPriorityList = [];
	this.shortcutTiddlers = [];

	// Cache stylesheet tag status for type switching
	this.updateStylesheetTagCache();

	// Load shortcuts once initially
	this.updateShortcutLists(this.getShortcutTiddlerList());

	// Emit initial settings snapshot
	this.applyEngineSettings();
};

exports.prototype.execute = function () {
	Object.getPrototypeOf(Object.getPrototypeOf(this)).execute.call(this);
	this.editType = this.getAttribute("type", "");
};

exports.prototype.getShortcutTiddlerList = function () {
	return this.wiki.getTiddlersWithTag("$:/tags/KeyboardShortcut/CodeMirror");
};

/**
 * Detect changes to platform keyboard config tiddlers ($:/config/<platform>/...)
 */
exports.prototype.detectNewShortcuts = function (changedTiddlers) {
	var shortcutConfigTiddlers = [];
	var handled = false;

	$tw.utils.each($tw.keyboardManager.lookupNames, function (platformDescriptor) {
		var descriptorPrefix = "$:/config/" + platformDescriptor + "/";
		Object.keys(changedTiddlers).forEach(function (t) {
			var prefix = t.substr(0, t.lastIndexOf("/") + 1);
			if (prefix === descriptorPrefix) {
				shortcutConfigTiddlers.push(t);
				handled = true;
			}
		});
	});

	return handled ? $tw.utils.hopArray(changedTiddlers, shortcutConfigTiddlers) : false;
};

exports.prototype.updateShortcutLists = function (tiddlerList) {
	this.shortcutTiddlers = tiddlerList || [];

	this.shortcutKeysList.length = this.shortcutTiddlers.length;
	this.shortcutActionList.length = this.shortcutTiddlers.length;
	this.shortcutParsedList.length = this.shortcutTiddlers.length;
	this.shortcutPriorityList.length = this.shortcutTiddlers.length;

	for (var i = 0; i < this.shortcutTiddlers.length; i++) {
		var title = this.shortcutTiddlers[i];
		var t = this.wiki.getTiddler(title);
		var fields = (t && t.fields) ? t.fields : {};

		this.shortcutKeysList[i] = fields.key !== undefined ? fields.key : undefined;
		this.shortcutActionList[i] = fields.text;

		this.shortcutParsedList[i] = this.shortcutKeysList[i] !== undefined
			? $tw.keyboardManager.parseKeyDescriptors(this.shortcutKeysList[i])
			: undefined;

		this.shortcutPriorityList[i] = fields.priority === "yes";
	}
};

// ============================================================================
// IMPORTANT: override toolbar operation routing (new architecture)
// ============================================================================

/**
 * Handle an edit text operation message from the toolbar.
 *
 * Calls the core texteditoroperation handlers to modify the operation object,
 * then executes via the CM6 engine.
 */
exports.prototype.handleEditTextOperationMessage = function (event) {
	if (!this.engine || (this.engine.isDestroyed && this.engine.isDestroyed())) return;

	// Prepare information about the operation
	var operation = this.engine.createTextOperation();

	// Invoke the handler for the selected operation (e.g., wrap-selection, prefix-lines)
	var handler = this.editorOperations[event.param];
	if (handler) {
		handler.call(this, event, operation);
	}

	// Execute the operation via the engine
	var newText = this.engine.executeTextOperation(operation);

	// Fix height and save changes
	this.engine.fixHeight();
	this.saveChanges(newText);
};

// ============================================================================
// Events / DOM integration
// ============================================================================

exports.prototype.handlePasteEvent = function (event) {
	if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length) {
		event.preventDefault();
		event.stopPropagation();
		this.dispatchDOMEvent(this.cloneEvent(event, ["clipboardData"]));
		return true;
	}
	return false;
};

// ============================================================================
// Refresh (hardened)
// ============================================================================

exports.prototype.refresh = function (changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	var wiki = this.wiki;

	// Wrapper class changes
	if (changedAttributes["class"]) {
		if (this.engine && typeof this.engine.assignDomNodeClasses === "function") {
			this.engine.assignDomNodeClasses();
		}
	}

	// Stylesheet tag change may affect type resolution
	var editTiddler = wiki.getTiddler(this.editTitle);
	if (editTiddler) {
		var newHasStylesheetTag = editTiddler.hasTag("$:/tags/Stylesheet");
		if (newHasStylesheetTag !== this.hasStylesheetTag) {
			this.hasStylesheetTag = newHasStylesheetTag;
			this.applyEngineSettings();
		}
	} else if (this.hasStylesheetTag) {
		this.hasStylesheetTag = false;
		this.applyEngineSettings();
	}

	// If type attribute changed, re-emit settings (includes tiddlerType)
	if (changedAttributes.type) {
		this.editType = this.getAttribute("type", "");
		this.applyEngineSettings();
	}

	// Any config/state under these prefixes triggers settingsChanged
	var settingsChanged = false;
	Object.keys(changedTiddlers).forEach(function (t) {
		if (t.indexOf("$:/config/codemirror-6/") === 0) settingsChanged = true;
		if (t.indexOf("$:/state/codemirror-6/translate/") === 0) settingsChanged = true;
	});
	if (settingsChanged) {
		this.applyEngineSettings();
	}

	// Shortcut changes: recompute and notify (engine/plugins should rebuild keymaps)
	var newList = this.getShortcutTiddlerList();
	var hasShortcutChanged =
		hopAny(changedTiddlers, this.shortcutTiddlers) ||
		hopAny(changedTiddlers, newList) ||
		!!this.detectNewShortcuts(changedTiddlers);

	if (hasShortcutChanged) {
		this.updateShortcutLists(newList);

		// Emit a dedicated event so a keymap plugin can rebuild
		if (this.engine && typeof this.engine.dispatchPluginEvent === "function") {
			this.engine.dispatchPluginEvent("shortcutsChanged", {
				keys: this.shortcutKeysList,
				actions: this.shortcutActionList,
				parsed: this.shortcutParsedList,
				priority: this.shortcutPriorityList,
				tiddlers: this.shortcutTiddlers
			});
		}
	}

	// Call base refresh
	return Object.getPrototypeOf(Object.getPrototypeOf(this)).refresh.call(this, changedTiddlers);
};
