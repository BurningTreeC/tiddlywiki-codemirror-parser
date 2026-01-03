/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/register.js
type: application/javascript
module-type: startup

Register TiddlyWiki language with CodeMirror 6 core for code block highlighting.
Provides TiddlyWiki-specific completion callbacks for tiddlers, macros, widgets, etc.

\*/
/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "cm6-lang-tiddlywiki";
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

// ============================================================================
// Completion Data Cache
// ============================================================================

var _cache = {
	tiddlers: null,
	tiddlersTime: 0,
	macros: null,
	macroParams: null,
	widgets: null,
	operators: null,
	fields: null,
	fieldsTime: 0,
	tags: null,
	tagsTime: 0,
	functions: null,
	functionsTime: 0,
	variables: null,
	variablesTime: 0
};

var CACHE_TTL = 5000; // 5 seconds

/**
 * Clear the completion cache (exported for external use)
 */
function clearCache() {
	_cache.tiddlers = null;
	_cache.tiddlersTime = 0;
	_cache.macros = null;
	_cache.macroParams = null;
	_cache.widgets = null;
	_cache.operators = null;
	_cache.fields = null;
	_cache.fieldsTime = 0;
	_cache.tags = null;
	_cache.tagsTime = 0;
	_cache.functions = null;
	_cache.functionsTime = 0;
	_cache.variables = null;
	_cache.variablesTime = 0;
}

// ============================================================================
// TiddlyWiki Data Callbacks
// ============================================================================

/**
 * Get all tiddler titles (cached)
 * Returns simple string array for use with language-support.ts
 */
function getTiddlerTitles() {
	var now = Date.now();
	if (_cache.tiddlers && (now - _cache.tiddlersTime) < CACHE_TTL) {
		return _cache.tiddlers;
	}

	var titles = [];
	if ($tw && $tw.wiki) {
		$tw.wiki.each(function(tiddler, title) {
			// Skip temp and state tiddlers
			if (!title.startsWith("$:/temp/") && !title.startsWith("$:/state/")) {
				titles.push(title);
			}
		});
	}

	_cache.tiddlers = titles;
	_cache.tiddlersTime = now;
	return titles;
}

/**
 * Get macro/procedure/function names for << >> and $variable= completions
 * Returns simple string array
 */
function getMacroNames() {
	if (_cache.macros) return _cache.macros;

	var macros = [];
	var seen = {};

	// Also build parameter map for getMacroParams
	_cache.macroParams = {};

	if ($tw && $tw.wiki) {
		// Get tiddlers tagged with $:/tags/Macro or $:/tags/Global
		var defTiddlers = $tw.wiki.filterTiddlers(
			"[all[tiddlers+shadows]tag[$:/tags/Macro]] [all[tiddlers+shadows]tag[$:/tags/Global]]"
		);

		defTiddlers.forEach(function(title) {
			var tiddler = $tw.wiki.getTiddler(title);
			if (tiddler) {
				var text = tiddler.fields.text || "";

				// Match \define name(params), \procedure name(params), \function name(params), \widget name(params)
				var regex = /\\(define|procedure|function|widget)\s+([^\s(]+)\s*\(([^)]*)\)/g;
				var match;
				while ((match = regex.exec(text)) !== null) {
					var name = match[2];
					var paramsStr = match[3];

					if (!seen[name]) {
						seen[name] = true;
						macros.push(name);

						// Parse parameters
						var params = [];
						if (paramsStr.trim()) {
							params = paramsStr.split(",").map(function(p) {
								var paramMatch = p.trim().match(/^([^\s:]+)(?::(.*))?$/);
								return paramMatch ? paramMatch[1] : p.trim();
							});
						}
						_cache.macroParams[name] = params;
					}
				}

				// Also match definitions without parentheses (no params)
				var noParamsRegex = /\\(define|procedure|function|widget)\s+([^\s(]+)\s*$/gm;
				while ((match = noParamsRegex.exec(text)) !== null) {
					var name = match[2];
					if (!seen[name]) {
						seen[name] = true;
						macros.push(name);
						_cache.macroParams[name] = [];
					}
				}
			}
		});

		// Also add global macros from $tw.macros
		if ($tw.macros) {
			Object.keys($tw.macros).forEach(function(name) {
				if (!seen[name]) {
					seen[name] = true;
					macros.push(name);
					var macro = $tw.macros[name];
					var params = [];
					if (macro.params) {
						params = macro.params.map(function(p) {
							return p.name;
						});
					}
					_cache.macroParams[name] = params;
				}
			});
		}
	}

	_cache.macros = macros;
	return macros;
}

/**
 * Get parameters for a specific macro/procedure/function
 * Returns array of parameter names or null if not found
 */
function getMacroParams(macroName) {
	// Ensure cache is populated
	if (!_cache.macros) {
		getMacroNames();
	}
	var params = _cache.macroParams ? _cache.macroParams[macroName] : null;
	return params && params.length > 0 ? params : null;
}

/**
 * Get widget names (with $ prefix)
 * Returns simple string array
 */
function getWidgetNames() {
	if (_cache.widgets) return _cache.widgets;

	// Core widgets
	var widgets = [
		"$action-confirm", "$action-createtiddler", "$action-deletefield", "$action-deletetiddler",
		"$action-listops", "$action-log", "$action-navigate", "$action-popup", "$action-sendmessage",
		"$action-setfield", "$action-setmultiplefields", "$browse", "$button", "$checkbox",
		"$codeblock", "$count", "$draggable", "$droppable", "$dropzone", "$edit", "$edit-bitmap",
		"$edit-text", "$element", "$encrypt", "$entity", "$eventcatcher", "$fieldmangler", "$fields",
		"$fill", "$genesis", "$image", "$importvariables", "$jsontiddler", "$keyboard", "$let",
		"$link", "$linkcatcher", "$list", "$list-empty", "$list-item", "$list-item-body", "$log",
		"$macrocall", "$messagecatcher", "$navigator", "$parameters", "$password", "$qualify",
		"$radio", "$range", "$raw", "$reveal", "$scrollable", "$select", "$set", "$setmultiplevariables",
		"$slot", "$slots", "$text", "$tiddler", "$transclude", "$vars", "$view", "$wikify"
	];

	// Add custom widgets defined in wiki
	if ($tw && $tw.wiki) {
		var customWidgets = $tw.wiki.filterTiddlers(
			"[all[tiddlers+shadows]tag[$:/tags/Global]] [all[tiddlers+shadows]tag[$:/tags/Macro]]"
		);
		customWidgets.forEach(function(title) {
			var tiddler = $tw.wiki.getTiddler(title);
			if (tiddler) {
				var text = tiddler.fields.text || "";
				var regex = /\\widget\s+\$?([^\s(]+)/g;
				var match;
				while ((match = regex.exec(text)) !== null) {
					var name = "$" + match[1].replace(/^\$/, "");
					if (widgets.indexOf(name) === -1) {
						widgets.push(name);
					}
				}
			}
		});
	}

	_cache.widgets = widgets;
	return widgets;
}

/**
 * Get filter operator names
 * Returns simple string array
 */
function getFilterOperators() {
	if (_cache.operators) return _cache.operators;

	var operators = [
		// Core operators from TiddlyWiki
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
		"toggle", "compare", "enlist", "shadow", "!shadow",
		"days", "minutes", "weeks", "months", "years", "hours", "seconds",
		"sameday", "then", "else", "editions", "plugintiddlers", "commands", "modules",
		"moduletypes", "variables", "function", "getvar", "charcode", "jsonextract",
		"jsonget", "jsonindexes", "jsontype", "log", "reduce", "average",
		"max", "maxall", "median", "min", "minall", "negate", "product", "sum",
		"abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "pow",
		"random", "round", "sign", "sin", "sqrt", "tan", "trunc", "fixed", "precision"
	];

	// Add custom operators from $tw.wiki.filterOperators
	if ($tw && $tw.wiki && $tw.wiki.filterOperators) {
		Object.keys($tw.wiki.filterOperators).forEach(function(op) {
			if (operators.indexOf(op) === -1) {
				operators.push(op);
			}
		});
	}

	_cache.operators = operators;
	return operators;
}

/**
 * Get all field names from all tiddlers (cached)
 * Returns simple string array
 */
function getFieldNames() {
	var now = Date.now();
	if (_cache.fields && (now - _cache.fieldsTime) < CACHE_TTL) {
		return _cache.fields;
	}

	var fields = {};
	// Start with common core fields
	var coreFields = [
		"title", "text", "tags", "modified", "created", "creator", "modifier",
		"type", "caption", "description", "list", "list-before", "list-after",
		"draft.of", "draft.title", "plugin-type", "plugin-priority", "color",
		"icon", "library", "source", "code-body", "throttle.refresh"
	];
	coreFields.forEach(function(f) { fields[f] = true; });

	if ($tw && $tw.wiki) {
		// Collect all unique field names from all tiddlers
		$tw.wiki.each(function(tiddler, title) {
			if (tiddler && tiddler.fields) {
				Object.keys(tiddler.fields).forEach(function(field) {
					fields[field] = true;
				});
			}
		});
	}

	_cache.fields = Object.keys(fields).sort();
	_cache.fieldsTime = now;
	return _cache.fields;
}

/**
 * Get all tag names (cached)
 * Returns simple string array
 */
function getTagNames() {
	var now = Date.now();
	if (_cache.tags && (now - _cache.tagsTime) < CACHE_TTL) {
		return _cache.tags;
	}

	var tags = [];
	if ($tw && $tw.wiki) {
		// Use TiddlyWiki's built-in method to get all tags
		var tagMap = $tw.wiki.getTagMap();
		tags = Object.keys(tagMap).sort();
	}

	_cache.tags = tags;
	_cache.tagsTime = now;
	return tags;
}

/**
 * Get function names (tiddlers with \function pragma)
 * Returns simple string array
 */
function getFunctionNames() {
	var now = Date.now();
	if (_cache.functions && (now - _cache.functionsTime) < CACHE_TTL) {
		return _cache.functions;
	}

	var functions = [];
	var seen = {};

	if ($tw && $tw.wiki) {
		// Get tiddlers that might contain function definitions
		var defTiddlers = $tw.wiki.filterTiddlers(
			"[all[tiddlers+shadows]tag[$:/tags/Macro]] [all[tiddlers+shadows]tag[$:/tags/Global]]"
		);

		defTiddlers.forEach(function(title) {
			var tiddler = $tw.wiki.getTiddler(title);
			if (tiddler) {
				var text = tiddler.fields.text || "";

				// Match \function name or \function name(params)
				var regex = /\\function\s+([^\s(]+)/g;
				var match;
				while ((match = regex.exec(text)) !== null) {
					var name = match[1];
					if (!seen[name]) {
						seen[name] = true;
						functions.push(name);
					}
				}
			}
		});

		// Also check $tw.wiki.getTiddlerText for function definitions in shadow tiddlers
		if ($tw.wiki.shadowTiddlers) {
			Object.keys($tw.wiki.shadowTiddlers).forEach(function(title) {
				var shadowInfo = $tw.wiki.shadowTiddlers[title];
				if (shadowInfo && shadowInfo.tiddler && shadowInfo.tiddler.fields) {
					var text = shadowInfo.tiddler.fields.text || "";
					var regex = /\\function\s+([^\s(]+)/g;
					var match;
					while ((match = regex.exec(text)) !== null) {
						var name = match[1];
						if (!seen[name]) {
							seen[name] = true;
							functions.push(name);
						}
					}
				}
			});
		}
	}

	_cache.functions = functions.sort();
	_cache.functionsTime = now;
	return _cache.functions;
}

/**
 * Get variable names (from \define, \procedure, \widget, \function)
 * Returns simple string array
 */
function getVariableNames() {
	var now = Date.now();
	if (_cache.variables && (now - _cache.variablesTime) < CACHE_TTL) {
		return _cache.variables;
	}

	var variables = [];
	var seen = {};

	if ($tw && $tw.wiki) {
		// Get tiddlers that might contain variable definitions
		var defTiddlers = $tw.wiki.filterTiddlers(
			"[all[tiddlers+shadows]tag[$:/tags/Macro]] [all[tiddlers+shadows]tag[$:/tags/Global]]"
		);

		defTiddlers.forEach(function(title) {
			var tiddler = $tw.wiki.getTiddler(title);
			if (tiddler) {
				var text = tiddler.fields.text || "";

				// Match \define, \procedure, \function, \widget
				var regex = /\\(define|procedure|function|widget)\s+([^\s(]+)/g;
				var match;
				while ((match = regex.exec(text)) !== null) {
					var name = match[2];
					if (!seen[name]) {
						seen[name] = true;
						variables.push(name);
					}
				}
			}
		});

		// Add global variables from $tw.macros
		if ($tw.macros) {
			Object.keys($tw.macros).forEach(function(name) {
				if (!seen[name]) {
					seen[name] = true;
					variables.push(name);
				}
			});
		}

		// Add global procedures from wiki
		if ($tw.wiki.globalProcedures) {
			Object.keys($tw.wiki.globalProcedures).forEach(function(name) {
				if (!seen[name]) {
					seen[name] = true;
					variables.push(name);
				}
			});
		}
	}

	_cache.variables = variables.sort();
	_cache.variablesTime = now;
	return _cache.variables;
}

// ============================================================================
// Startup
// ============================================================================

exports.startup = function() {
	var core = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/lib/core.js");
	var langTw = require("$:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/lang-tiddlywiki/lang-tiddlywiki.js");

	if (!core || !core.registerLanguage || !langTw || !langTw.tiddlywiki) {
		return;
	}

	var LanguageDescription = core.language.LanguageDescription;

	// Register TiddlyWiki wikitext with completion callbacks
	core.registerLanguage(LanguageDescription.of({
		name: "TiddlyWiki",
		alias: ["tiddlywiki", "wikitext", "tw", "tw5"],
		extensions: ["tid"],
		support: langTw.tiddlywiki({
			// Completion callbacks - provide TiddlyWiki data to the parser
			getTiddlerTitles: getTiddlerTitles,
			getMacroNames: getMacroNames,
			getMacroParams: getMacroParams,
			getWidgetNames: getWidgetNames,
			getFilterOperators: getFilterOperators,
			getFieldNames: getFieldNames,
			getTagNames: getTagNames,
			getFunctionNames: getFunctionNames,
			getVariableNames: getVariableNames,

			// Enable all completions
			completeTiddlers: true,
			completeMacros: true,
			completeWidgets: true,
			completeFilterOperators: true,
			completeFilterRunPrefixes: true,
			completeHTMLTags: true
		})
	}));

	// Export cache clear function for external use
	if (!$tw.CodeMirror) {
		$tw.CodeMirror = {};
	}
	$tw.CodeMirror.clearAutocompleteCache = clearCache;
};
