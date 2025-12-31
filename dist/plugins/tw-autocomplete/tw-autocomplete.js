/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/plugins/tw-autocomplete.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Autocomplete Plugin - provides completions for:
- Tiddler names (in links, transclusions)
- Field names
- Macro names
- Widget names
- Tag names
- Filter operators

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Cache for expensive lookups
var _cache = {
	tiddlers: null,
	tiddlersTime: 0,
	macros: null,
	widgets: null,
	operators: null,
	fields: null,
	tags: null
};

var CACHE_TTL = 5000; // 5 seconds

// ============================================================================
// Completion Sources
// ============================================================================

/**
 * Get all tiddler titles (cached)
 */
function getTiddlerTitles() {
	var now = Date.now();
	if (_cache.tiddlers && (now - _cache.tiddlersTime) < CACHE_TTL) {
		return _cache.tiddlers;
	}
	
	var titles = [];
	if ($tw && $tw.wiki) {
		$tw.wiki.each(function(tiddler, title) {
			// Skip system tiddlers by default, but include some common ones
			if (!title.startsWith("$:/temp/") && !title.startsWith("$:/state/")) {
				titles.push({
					label: title,
					type: "variable",
					detail: tiddler.fields.type || "tiddler",
					boost: title.startsWith("$:/") ? -1 : 1
				});
			}
		});
	}
	
	_cache.tiddlers = titles;
	_cache.tiddlersTime = now;
	return titles;
}

/**
 * Get all field names used in wiki
 */
function getFieldNames() {
	if (_cache.fields) return _cache.fields;
	
	var fields = new Set(["title", "text", "tags", "type", "created", "modified", "creator", "modifier"]);
	
	if ($tw && $tw.wiki) {
		$tw.wiki.each(function(tiddler) {
			Object.keys(tiddler.fields).forEach(function(field) {
				fields.add(field);
			});
		});
	}
	
	_cache.fields = Array.from(fields).map(function(f) {
		return { label: f, type: "property", detail: "field" };
	});
	return _cache.fields;
}

/**
 * Get all tag names
 */
function getTagNames() {
	if (_cache.tags) return _cache.tags;
	
	var tags = new Set();
	
	if ($tw && $tw.wiki) {
		$tw.wiki.each(function(tiddler) {
			var tiddlerTags = tiddler.fields.tags;
			if (tiddlerTags) {
				$tw.utils.parseStringArray(tiddlerTags).forEach(function(tag) {
					tags.add(tag);
				});
			}
		});
	}
	
	_cache.tags = Array.from(tags).map(function(t) {
		return { label: t, type: "constant", detail: "tag" };
	});
	return _cache.tags;
}

/**
 * Get macro names
 */
function getMacroNames() {
	if (_cache.macros) return _cache.macros;
	
	var macros = [];
	
	// Built-in macros
	var builtinMacros = [
		{ name: "now", params: "[format]", info: "Current date/time" },
		{ name: "tabs", params: "tabsList state class", info: "Tab interface" },
		{ name: "tag", params: "tag", info: "Tag pill" },
		{ name: "list-links", params: "filter", info: "List as links" },
		{ name: "list-links-draggable", params: "tiddler tag", info: "Draggable list" },
		{ name: "toc", params: "tag", info: "Table of contents" },
		{ name: "toc-expandable", params: "tag", info: "Expandable TOC" },
		{ name: "toc-selective-expandable", params: "tag", info: "Selective TOC" },
		{ name: "timeline", params: "limit format", info: "Timeline view" },
		{ name: "dumpvariables", params: "", info: "Debug: dump variables" },
		{ name: "contrastcolour", params: "color fallback", info: "Contrast color" },
		{ name: "box-shadow", params: "shadow", info: "CSS box shadow" },
		{ name: "filter", params: "filter", info: "Filter expression" },
		{ name: "jsontiddler", params: "title", info: "JSON export" },
		{ name: "jsontiddlers", params: "filter", info: "JSON export multiple" },
		{ name: "makedatauri", params: "text type", info: "Data URI" },
		{ name: "datauri", params: "title", info: "Tiddler as data URI" },
		{ name: "qualify", params: "title", info: "Qualify title" },
		{ name: "resolvepath", params: "path", info: "Resolve path" },
		{ name: "colour", params: "name", info: "Palette colour" },
		{ name: "colour-picker", params: "actions", info: "Colour picker" },
		{ name: "copy-to-clipboard", params: "src", info: "Copy button" },
		{ name: "csvtiddlers", params: "filter", info: "CSV export" },
		{ name: "image-picker", params: "actions", info: "Image picker" },
		{ name: "keyboard-driven-input", params: "...", info: "Keyboard input" },
		{ name: "lingo", params: "title", info: "Localised string" },
		{ name: "list-thumbnails", params: "filter", info: "Thumbnail list" },
		{ name: "translink", params: "title", info: "Transclude + link" }
	];
	
	builtinMacros.forEach(function(m) {
		macros.push({
			label: m.name,
			type: "function",
			detail: "macro",
			info: m.info,
			apply: function(view, completion, from, to) {
				var insert = "<<" + m.name + (m.params ? " " : "") + ">>";
				view.dispatch({
					changes: { from: from, to: to, insert: insert },
					selection: { anchor: from + insert.length - 2 }
				});
			}
		});
	});
	
	// User-defined macros from wiki
	if ($tw && $tw.wiki) {
		var defTiddlers = $tw.wiki.filterTiddlers("[all[tiddlers+shadows]has[text]regexp:text[\\\\define\\s+]]");
		defTiddlers.forEach(function(title) {
			var tiddler = $tw.wiki.getTiddler(title);
			if (tiddler) {
				var text = tiddler.fields.text || "";
				var regex = /\\define\s+([^\s(]+)\s*\(/g;
				var match;
				while ((match = regex.exec(text)) !== null) {
					macros.push({
						label: match[1],
						type: "function",
						detail: "macro (user)",
						info: "Defined in: " + title
					});
				}
			}
		});
	}
	
	_cache.macros = macros;
	return macros;
}

/**
 * Get widget names
 */
function getWidgetNames() {
	if (_cache.widgets) return _cache.widgets;
	
	var widgets = [
		{ name: "action-confirm", info: "Confirm action" },
		{ name: "action-createtiddler", info: "Create tiddler" },
		{ name: "action-deletefield", info: "Delete field" },
		{ name: "action-deletetiddler", info: "Delete tiddler" },
		{ name: "action-listops", info: "List operations" },
		{ name: "action-log", info: "Log to console" },
		{ name: "action-navigate", info: "Navigate to tiddler" },
		{ name: "action-popup", info: "Show popup" },
		{ name: "action-sendmessage", info: "Send message" },
		{ name: "action-setfield", info: "Set field value" },
		{ name: "action-setmultiplefields", info: "Set multiple fields" },
		{ name: "browse", info: "File browser" },
		{ name: "button", info: "Clickable button" },
		{ name: "checkbox", info: "Checkbox input" },
		{ name: "codeblock", info: "Code block" },
		{ name: "count", info: "Count filter results" },
		{ name: "draggable", info: "Draggable element" },
		{ name: "droppable", info: "Drop zone" },
		{ name: "dropzone", info: "File drop zone" },
		{ name: "edit", info: "Edit field" },
		{ name: "edit-bitmap", info: "Edit bitmap" },
		{ name: "edit-text", info: "Edit text field" },
		{ name: "element", info: "HTML element" },
		{ name: "encrypt", info: "Encryption" },
		{ name: "entity", info: "HTML entity" },
		{ name: "eventcatcher", info: "Event handler" },
		{ name: "fieldmangler", info: "Field manager" },
		{ name: "fields", info: "Display fields" },
		{ name: "fill", info: "Fill slot" },
		{ name: "genesis", info: "Dynamic widget" },
		{ name: "image", info: "Display image" },
		{ name: "importvariables", info: "Import variables" },
		{ name: "jsontiddler", info: "JSON tiddler" },
		{ name: "keyboard", info: "Keyboard shortcut" },
		{ name: "let", info: "Define variables" },
		{ name: "link", info: "Wiki link" },
		{ name: "linkcatcher", info: "Catch link clicks" },
		{ name: "list", info: "List filter results" },
		{ name: "list-empty", info: "Empty list template" },
		{ name: "list-item", info: "List item template" },
		{ name: "list-item-body", info: "List item body" },
		{ name: "log", info: "Debug log" },
		{ name: "macrocall", info: "Call macro" },
		{ name: "messagecatcher", info: "Catch messages" },
		{ name: "navigator", info: "Story navigator" },
		{ name: "parameters", info: "Widget parameters" },
		{ name: "password", info: "Password input" },
		{ name: "qualify", info: "Qualified title" },
		{ name: "radio", info: "Radio button" },
		{ name: "range", info: "Range slider" },
		{ name: "raw", info: "Raw HTML" },
		{ name: "reveal", info: "Show/hide content" },
		{ name: "scrollable", info: "Scrollable area" },
		{ name: "select", info: "Select dropdown" },
		{ name: "set", info: "Set variable" },
		{ name: "setmultiplevariables", info: "Set multiple vars" },
		{ name: "slot", info: "Define slot" },
		{ name: "slots", info: "Fill slot" },
		{ name: "text", info: "Text output" },
		{ name: "tiddler", info: "Tiddler context" },
		{ name: "transclude", info: "Transclude content" },
		{ name: "vars", info: "Define variables" },
		{ name: "view", info: "View field" },
		{ name: "wikify", info: "Wikify text" }
	];
	
	_cache.widgets = widgets.map(function(w) {
		return {
			label: "$" + w.name,
			displayLabel: "<$" + w.name + ">",
			type: "keyword",
			detail: "widget",
			info: w.info,
			apply: function(view, completion, from, to) {
				var insert = "<$" + w.name + "></$" + w.name + ">";
				view.dispatch({
					changes: { from: from, to: to, insert: insert },
					selection: { anchor: from + w.name.length + 3 }
				});
			}
		};
	});
	return _cache.widgets;
}

/**
 * Get filter operators
 */
function getFilterOperators() {
	if (_cache.operators) return _cache.operators;
	
	var operators = [
		"title", "field", "fields", "has", "!has", "tag", "tags", "tagging",
		"links", "backlinks", "all", "is", "!is", "prefix", "suffix",
		"contains", "regexp", "search", "filter", "subfilter",
		"sort", "sortcs", "nsort", "nsortcs", "reverse", "first", "last",
		"butfirst", "butlast", "rest", "nth", "range", "limit", "count",
		"each", "eachday", "unique", "duplicates", "split", "join", "trim",
		"get", "getindex", "indexes", "getvariable", "lookup", "match", "!match",
		"addprefix", "addsuffix", "removeprefix", "removesuffix",
		"uppercase", "lowercase", "titlecase", "sentencecase", "capitalize",
		"pad", "format", "stringify", "jsonstringify",
		"length", "splitregexp", "substitute", "escapecss", "escapehtml",
		"encodehtml", "decodehtml", "encodeuri", "decodeuri", "encodeuricomponent",
		"list", "listed", "next", "previous", "before", "after", "append", "prepend",
		"move", "putafter", "putbefore", "putfirst", "putlast", "remove", "replace",
		"toggle", "compare", "contains", "enlist", "shadow", "!shadow",
		"days", "minutes", "weeks", "months", "years", "hours", "seconds",
		"sameday", "then", "else", "editions", "plugintiddlers", "commands", "modules",
		"moduletypes", "variables", "function", "getvar", "charcode", "jsonextract",
		"jsonget", "jsonindexes", "jsontype", "log", "reduce", "average",
		"max", "maxall", "median", "min", "minall", "negate", "product", "sum",
		"abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "log", "pow",
		"random", "round", "sign", "sin", "sqrt", "tan", "trunc", "fixed", "precision"
	];
	
	_cache.operators = operators.map(function(op) {
		return {
			label: op,
			type: "method",
			detail: "filter operator"
		};
	});
	return _cache.operators;
}

// ============================================================================
// Context Detection
// ============================================================================

/**
 * Detect completion context from cursor position
 */
function detectContext(state, pos) {
	var doc = state.doc;
	var line = doc.lineAt(pos);
	var lineText = line.text;
	var col = pos - line.from;
	var before = lineText.slice(0, col);
	
	// Check for link context: [[
	var linkMatch = before.match(/\[\[([^\]|]*)$/);
	if (linkMatch) {
		return { type: "link", prefix: linkMatch[1], from: pos - linkMatch[1].length };
	}
	
	// Check for link with text: [[text|
	var linkTextMatch = before.match(/\[\[[^\]|]*\|([^\]]*)$/);
	if (linkTextMatch) {
		return { type: "link", prefix: linkTextMatch[1], from: pos - linkTextMatch[1].length };
	}
	
	// Check for transclusion: {{
	var transcludeMatch = before.match(/\{\{([^}]*)$/);
	if (transcludeMatch) {
		return { type: "transclusion", prefix: transcludeMatch[1], from: pos - transcludeMatch[1].length };
	}
	
	// Check for macro: <<
	var macroMatch = before.match(/<<([a-zA-Z0-9_-]*)$/);
	if (macroMatch) {
		return { type: "macro", prefix: macroMatch[1], from: pos - macroMatch[1].length };
	}
	
	// Check for widget: <$
	var widgetMatch = before.match(/<\$([a-zA-Z0-9_-]*)$/);
	if (widgetMatch) {
		return { type: "widget", prefix: widgetMatch[1], from: pos - widgetMatch[1].length };
	}
	
	// Check for tag in filter: [tag[
	var tagFilterMatch = before.match(/\[tag\[([^\]]*)$/);
	if (tagFilterMatch) {
		return { type: "tag", prefix: tagFilterMatch[1], from: pos - tagFilterMatch[1].length };
	}
	
	// Check for field name in filter: [field:
	var fieldMatch = before.match(/\[([a-zA-Z0-9_-]*):$/);
	if (fieldMatch) {
		return { type: "field-operator", prefix: "", from: pos };
	}
	
	// Check for filter operator: [
	var operatorMatch = before.match(/\[([a-zA-Z]*)$/);
	if (operatorMatch && !before.match(/\[\[/)) {
		return { type: "operator", prefix: operatorMatch[1], from: pos - operatorMatch[1].length };
	}
	
	// Check for field in transclusion: {{tiddler!!
	var fieldTransMatch = before.match(/\{\{[^}]*!!([a-zA-Z0-9_-]*)$/);
	if (fieldTransMatch) {
		return { type: "field", prefix: fieldTransMatch[1], from: pos - fieldTransMatch[1].length };
	}
	
	return null;
}

/**
 * TiddlyWiki completion source
 */
function tiddlywikiCompletions(context) {
	var ctx = detectContext(context.state, context.pos);
	if (!ctx) return null;
	
	var options = [];
	
	switch (ctx.type) {
		case "link":
		case "transclusion":
			options = getTiddlerTitles();
			break;
		case "macro":
			options = getMacroNames();
			break;
		case "widget":
			options = getWidgetNames();
			break;
		case "tag":
			options = getTagNames();
			break;
		case "field":
		case "field-operator":
			options = getFieldNames();
			break;
		case "operator":
			options = getFilterOperators();
			break;
	}
	
	if (ctx.prefix) {
		var prefix = ctx.prefix.toLowerCase();
		options = options.filter(function(opt) {
			return opt.label.toLowerCase().startsWith(prefix);
		});
	}
	
	if (options.length === 0) return null;
	
	return {
		from: ctx.from,
		options: options,
		validFor: /^[\w\-$:\/. ]*$/
	};
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-autocomplete",
	description: "TiddlyWiki-specific autocompletion (tiddlers, macros, widgets, etc.)",
	priority: 550, // Just below autocomplete plugin
	
	// Only load for TiddlyWiki content
	condition: function(context) {
		var type = context.tiddlerType;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		
		// Add our completion source
		var autocompletion = (core.autocomplete || {}).autocompletion;
		if (autocompletion) {
			extensions.push(autocompletion({
				override: [tiddlywikiCompletions],
				activateOnTyping: true,
				maxRenderedOptions: 50
			}));
		}
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		return {
			/**
			 * Clear autocomplete cache (call after wiki changes)
			 */
			clearAutocompleteCache: function() {
				_cache.tiddlers = null;
				_cache.tiddlersTime = 0;
				_cache.macros = null;
				_cache.widgets = null;
				_cache.operators = null;
				_cache.fields = null;
				_cache.tags = null;
			},
			
			/**
			 * Manually trigger TiddlyWiki completions
			 */
			triggerTWCompletion: function() {
				if (this._destroyed) return;
				var startCompletion = (this.cm.autocomplete || {}).startCompletion;
				if (startCompletion) {
					startCompletion(this.view);
				}
			}
		};
	}
};
