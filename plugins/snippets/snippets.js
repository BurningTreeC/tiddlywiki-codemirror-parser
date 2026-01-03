/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/snippets/snippets.js
type: application/javascript
module-type: codemirror6-plugin

User-configurable snippets plugin.
Allows users to define custom snippets via tiddlers tagged with $:/tags/CodeMirror/Snippet.
Merges with built-in snippets from tw-snippets (user snippets can override built-in).

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Constants
// ============================================================================

var SNIPPET_TAG = "$:/tags/CodeMirror/Snippet";
var _snippetCache = null;
var _cacheTime = 0;
var CACHE_TTL = 5000; // 5 seconds


// ============================================================================
// Snippet Template Parser
// ============================================================================

/**
 * Parse a snippet template and extract tab stops
 * Supports: ${1}, ${1:default}, $0, ${1|choice1,choice2|}
 */
function parseTemplate(template) {
	var result = {
		text: "",
		tabStops: [],
		finalStop: null
	};

	var regex = /\$\{(\d+)(?::([^}]*))?\}|\$(\d+)/g;
	var lastIndex = 0;
	var match;

	while ((match = regex.exec(template)) !== null) {
		// Add text before this tab stop
		result.text += template.slice(lastIndex, match.index);

		var stopNum = parseInt(match[1] || match[3], 10);
		var defaultText = match[2] || "";

		// Handle choice syntax: ${1|opt1,opt2,opt3|}
		if (defaultText.startsWith("|") && defaultText.endsWith("|")) {
			var choices = defaultText.slice(1, -1).split(",");
			defaultText = choices[0] || "";
		}

		var tabStop = {
			index: stopNum,
			from: result.text.length,
			to: result.text.length + defaultText.length,
			default: defaultText
		};

		if (stopNum === 0) {
			result.finalStop = tabStop;
		} else {
			result.tabStops.push(tabStop);
		}

		result.text += defaultText;
		lastIndex = regex.lastIndex;
	}

	// Add remaining text
	result.text += template.slice(lastIndex);

	// Sort tab stops by index
	result.tabStops.sort(function(a, b) { return a.index - b.index; });

	return result;
}

/**
 * Insert snippet at current position
 */
function insertSnippet(view, snippet) {
	var state = view.state;
	var sel = state.selection.main;
	var from = sel.from;
	var to = sel.to;

	var parsed = parseTemplate(snippet.template);

	// Insert the text
	view.dispatch({
		changes: { from: from, to: to, insert: parsed.text },
		selection: parsed.tabStops.length > 0 ? {
			anchor: from + parsed.tabStops[0].from,
			head: from + parsed.tabStops[0].to
		} : parsed.finalStop ? {
			anchor: from + parsed.finalStop.from
		} : {
			anchor: from + parsed.text.length
		}
	});

	return true;
}

// ============================================================================
// User Snippet Loading
// ============================================================================

/**
 * Load user-defined snippets from tagged tiddlers
 */
function loadUserSnippets() {
	var now = Date.now();
	if (_snippetCache && (now - _cacheTime) < CACHE_TTL) {
		return _snippetCache;
	}

	var snippets = [];
	var tiddlers = $tw.wiki.getTiddlersWithTag(SNIPPET_TAG);

	tiddlers.forEach(function(title) {
		var tiddler = $tw.wiki.getTiddler(title);
		if (!tiddler) return;

		var fields = tiddler.fields;
		var trigger = fields.trigger;
		var template = fields.text;

		if (!trigger || !template) return;

		snippets.push({
			trigger: trigger,
			label: fields.caption || trigger,
			detail: fields.description || "",
			template: template,
			scope: fields.scope || null,
			priority: parseInt(fields.priority, 10) || 0
		});
	});

	_snippetCache = snippets;
	_cacheTime = now;
	return snippets;
}

/**
 * Clear the snippet cache (call when snippets change)
 */
function clearCache() {
	_snippetCache = null;
	_cacheTime = 0;
}

/**
 * Get user snippets filtered by content type
 * @param {string} contentType - Optional content type for scope filtering
 */
function getSnippets(contentType) {
	var userSnippets = loadUserSnippets();

	// Filter by scope if content type is specified
	var filtered = userSnippets.filter(function(s) {
		if (!s.scope || !contentType) {
			return true; // No scope restriction
		}
		// Support comma-separated scopes
		var scopes = s.scope.split(",").map(function(sc) { return sc.trim(); });
		return scopes.indexOf(contentType) !== -1;
	});

	// Sort by priority (higher first), then alphabetically
	filtered.sort(function(a, b) {
		var priorityDiff = (b.priority || 0) - (a.priority || 0);
		if (priorityDiff !== 0) return priorityDiff;
		return a.trigger.localeCompare(b.trigger);
	});

	return filtered;
}

// ============================================================================
// Completion Source
// ============================================================================

/**
 * Snippet completion source for autocompletion
 */
function snippetCompletions(context) {
	// Match word-like characters plus special chars used in triggers
	var word = context.matchBefore(/[\w\-\\$\[<`|]+/);
	if (!word || word.from === word.to) return null;

	var prefix = word.text.toLowerCase();

	// Get content type from context if available
	var contentType = null;
	// Try to get from engine context
	if (context.state && context.state.field) {
		// Could access content type through state fields if needed
	}

	var snippets = getSnippets(contentType);

	var options = snippets
		.filter(function(s) {
			return s.trigger.toLowerCase().startsWith(prefix);
		})
		.map(function(s) {
			return {
				label: s.trigger,
				displayLabel: s.label,
				type: "snippet",
				detail: s.detail,
				boost: (s.priority || 0) + 2,
				apply: function(view, completion, from, to) {
					view.dispatch({
						changes: { from: from, to: to, insert: "" }
					});
					insertSnippet(view, s);
				}
			};
		});

	if (options.length === 0) return null;

	return {
		from: word.from,
		options: options,
		validFor: /^[\w\-\\$\[<`|]*$/
	};
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "user-snippets",
	description: "User-configurable code snippets",
	priority: 560, // After emoji-picker (550), after tw-snippets (540)

	init: function(cm6Core) {
		this._core = cm6Core;
	},

	getExtensions: function(context) {
		var engine = context.engine;

		// Register completion source with the engine
		// Use lower priority than tw-snippets so user snippets appear first
		if (engine && engine.registerCompletionSource) {
			engine.registerCompletionSource(snippetCompletions, 18);
		}

		return [];
	},

	extendAPI: function(engine, context) {
		return {
			/**
			 * Get list of user-defined snippets
			 */
			getUserSnippets: function() {
				return loadUserSnippets().map(function(s) {
					return {
						trigger: s.trigger,
						label: s.label,
						detail: s.detail,
						scope: s.scope,
						priority: s.priority
					};
				});
			},

			/**
			 * Get all user snippets (optionally filtered by content type)
			 */
			getSnippets: function(contentType) {
				return getSnippets(contentType).map(function(s) {
					return {
						trigger: s.trigger,
						label: s.label,
						detail: s.detail,
						scope: s.scope,
						priority: s.priority
					};
				});
			},

			/**
			 * Clear snippet cache (call after modifying snippet tiddlers)
			 */
			clearSnippetCache: function() {
				clearCache();
			},

			/**
			 * Insert a snippet by trigger
			 */
			insertUserSnippet: function(trigger, contentType) {
				if (this._destroyed) return false;

				var snippets = getSnippets(contentType);
				for (var i = 0; i < snippets.length; i++) {
					if (snippets[i].trigger === trigger) {
						return insertSnippet(this.view, snippets[i]);
					}
				}
				return false;
			}
		};
	}
};

// ============================================================================
// Exports for other plugins
// ============================================================================

exports.loadUserSnippets = loadUserSnippets;
exports.getSnippets = getSnippets;
exports.clearCache = clearCache;
exports.parseTemplate = parseTemplate;
exports.insertSnippet = insertSnippet;
