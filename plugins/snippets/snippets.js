/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/snippets/snippets.js
type: application/javascript
module-type: codemirror6-plugin

User-configurable snippets plugin.
Allows users to define custom snippets via tiddlers tagged with $:/tags/CodeMirror/Snippet.
Uses CodeMirror's built-in snippet system for proper Tab navigation between placeholders.

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

// CodeMirror snippet function (loaded in init)
var _snippetFn = null;
var _core = null;


// ============================================================================
// Template Conversion
// ============================================================================

/**
 * Convert user template format to CodeMirror snippet format
 * - $0 becomes ${} (final cursor position)
 * - ${1}, ${2}, ${1:default} stay the same
 * - Escape ${ that shouldn't be placeholders
 */
function convertTemplate(template) {
	// Replace $0 with ${} (CodeMirror's final position syntax)
	// But be careful not to replace ${0} or ${0:...}
	return template.replace(/\$0(?!\d|{)/g, "${}");
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
			var cmTemplate = convertTemplate(s.template);
			var applyFn;

			// Use CodeMirror's snippet function if available for Tab navigation
			if (_snippetFn) {
				applyFn = _snippetFn(cmTemplate);
			} else {
				// Fallback: simple text insertion without Tab navigation
				applyFn = function(view, completion, from, to) {
					// Strip placeholder syntax for plain insertion
					var plainText = s.template
						.replace(/\$\{(\d+)(?::([^}]*))?\}/g, function(m, num, def) {
							return def || "";
						})
						.replace(/\$0/g, "");
					view.dispatch({
						changes: { from: from, to: to, insert: plainText }
					});
				};
			}

			return {
				label: s.trigger,
				displayLabel: s.label,
				type: "snippet",
				detail: s.detail,
				boost: (s.priority || 0) + 2,
				apply: applyFn
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
		_core = cm6Core;
		// Load the snippet function from CodeMirror's autocomplete module
		if (cm6Core.autocomplete && cm6Core.autocomplete.snippet) {
			_snippetFn = cm6Core.autocomplete.snippet;
		}
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
						var s = snippets[i];
						var view = this.view;
						var from = view.state.selection.main.from;
						var to = view.state.selection.main.to;

						if (_snippetFn) {
							// Use CodeMirror's snippet system
							var cmTemplate = convertTemplate(s.template);
							_snippetFn(cmTemplate)(view, null, from, to);
						} else {
							// Fallback: plain text insertion
							var plainText = s.template
								.replace(/\$\{(\d+)(?::([^}]*))?\}/g, function(m, num, def) {
									return def || "";
								})
								.replace(/\$0/g, "");
							view.dispatch({
								changes: { from: from, to: to, insert: plainText }
							});
						}
						return true;
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
exports.convertTemplate = convertTemplate;
