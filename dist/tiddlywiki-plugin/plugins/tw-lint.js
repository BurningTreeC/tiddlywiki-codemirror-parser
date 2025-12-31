/*\
title: $:/plugins/BTC/tiddlywiki-codemirror-6/plugins/tw-lint.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Lint Plugin - validates wikitext for common errors.

Checks for:
- Unmatched brackets/braces
- Unclosed widgets
- Invalid widget names
- Broken links
- Malformed filters
- Unclosed formatting

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Lint Rules
// ============================================================================

/**
 * Check for unmatched brackets
 */
function checkBrackets(text, diagnostics) {
	var brackets = [
		{ open: "[[", close: "]]", name: "wiki link" },
		{ open: "{{", close: "}}", name: "transclusion" },
		{ open: "{{{", close: "}}}", name: "filtered transclusion" },
		{ open: "<<", close: ">>", name: "macro call" },
		{ open: "[img[", close: "]]", name: "image" },
		{ open: "[ext[", close: "]]", name: "external link" }
	];
	
	brackets.forEach(function(bracket) {
		var openCount = 0;
		var openPositions = [];
		var i = 0;
		
		while (i < text.length) {
			// Check for opening
			if (text.substr(i, bracket.open.length) === bracket.open) {
				openCount++;
				openPositions.push(i);
				i += bracket.open.length;
				continue;
			}
			
			// Check for closing
			if (text.substr(i, bracket.close.length) === bracket.close) {
				if (openCount > 0) {
					openCount--;
					openPositions.pop();
				} else {
					diagnostics.push({
						from: i,
						to: i + bracket.close.length,
						severity: "error",
						message: "Unmatched closing " + bracket.name + " bracket"
					});
				}
				i += bracket.close.length;
				continue;
			}
			
			i++;
		}
		
		// Report unclosed brackets
		openPositions.forEach(function(pos) {
			diagnostics.push({
				from: pos,
				to: pos + bracket.open.length,
				severity: "error",
				message: "Unclosed " + bracket.name + " bracket"
			});
		});
	});
}

/**
 * Check for unclosed widgets
 */
function checkWidgets(text, diagnostics) {
	// Find opening tags
	var openTagRegex = /<\$([a-zA-Z0-9_-]+)(?:\s[^>]*)?\s*(?<!\/)\s*>/g;
	var closeTagRegex = /<\/\$([a-zA-Z0-9_-]+)\s*>/g;
	var selfClosingRegex = /<\$([a-zA-Z0-9_-]+)(?:\s[^>]*)?\s*\/>/g;
	
	var openTags = [];
	var match;
	
	// Find self-closing tags first (to exclude them)
	var selfClosing = {};
	while ((match = selfClosingRegex.exec(text)) !== null) {
		selfClosing[match.index] = true;
	}
	
	// Find opening tags
	while ((match = openTagRegex.exec(text)) !== null) {
		if (selfClosing[match.index]) continue;
		openTags.push({
			name: match[1].toLowerCase(),
			pos: match.index,
			end: match.index + match[0].length
		});
	}
	
	// Find closing tags and match them
	while ((match = closeTagRegex.exec(text)) !== null) {
		var closeName = match[1].toLowerCase();
		var found = false;
		
		// Find matching open tag (from end)
		for (var i = openTags.length - 1; i >= 0; i--) {
			if (openTags[i].name === closeName) {
				openTags.splice(i, 1);
				found = true;
				break;
			}
		}
		
		if (!found) {
			diagnostics.push({
				from: match.index,
				to: match.index + match[0].length,
				severity: "error",
				message: "Closing tag </$" + match[1] + "> without matching opening tag"
			});
		}
	}
	
	// Report unclosed tags
	openTags.forEach(function(tag) {
		diagnostics.push({
			from: tag.pos,
			to: tag.end,
			severity: "error",
			message: "Unclosed widget <$" + tag.name + ">"
		});
	});
}

/**
 * Check for invalid widget names
 */
function checkWidgetNames(text, diagnostics) {
	var validWidgets = new Set([
		"action-confirm", "action-createtiddler", "action-deletefield",
		"action-deletetiddler", "action-listops", "action-log",
		"action-navigate", "action-popup", "action-sendmessage",
		"action-setfield", "action-setmultiplefields", "browse",
		"button", "checkbox", "codeblock", "count", "draggable",
		"droppable", "dropzone", "edit", "edit-bitmap", "edit-text",
		"element", "encrypt", "entity", "eventcatcher", "fieldmangler",
		"fields", "fill", "genesis", "image", "importvariables",
		"jsontiddler", "keyboard", "let", "link", "linkcatcher",
		"list", "list-empty", "list-item", "list-item-body", "log",
		"macrocall", "messagecatcher", "navigator", "parameters",
		"password", "qualify", "radio", "range", "raw", "reveal",
		"scrollable", "select", "set", "setmultiplevariables", "slot",
		"slots", "text", "tiddler", "transclude", "vars", "view", "wikify"
	]);
	
	var widgetRegex = /<\$([a-zA-Z0-9_-]+)/g;
	var match;
	
	while ((match = widgetRegex.exec(text)) !== null) {
		var name = match[1].toLowerCase();
		// Check if it's a valid core widget or a custom widget (starts with letter)
		if (!validWidgets.has(name) && !name.startsWith("my")) {
			diagnostics.push({
				from: match.index,
				to: match.index + match[0].length,
				severity: "warning",
				message: "Unknown widget <$" + match[1] + "> - may be custom or misspelled"
			});
		}
	}
}

/**
 * Check for broken internal links
 */
function checkLinks(text, diagnostics) {
	if (!$tw || !$tw.wiki) return;
	
	var linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	var match;
	
	while ((match = linkRegex.exec(text)) !== null) {
		var target = match[2] || match[1];
		
		// Skip external URLs
		if (/^(https?:|mailto:|ftp:|file:)/.test(target)) continue;
		
		// Skip transclusion syntax
		if (target.includes("{{") || target.includes("<<")) continue;
		
		// Skip filter syntax
		if (target.startsWith("{") || target.includes("[")) continue;
		
		// Check if tiddler exists
		if (!$tw.wiki.tiddlerExists(target) && !$tw.wiki.isShadowTiddler(target)) {
			diagnostics.push({
				from: match.index,
				to: match.index + match[0].length,
				severity: "info",
				message: "Link to non-existent tiddler: " + target
			});
		}
	}
}

/**
 * Check for unclosed formatting
 */
function checkFormatting(text, diagnostics) {
	var formats = [
		{ mark: "''", name: "bold" },
		{ mark: "//", name: "italic" },
		{ mark: "__", name: "underline" },
		{ mark: "~~", name: "strikethrough" },
		{ mark: "^^", name: "superscript" },
		{ mark: ",,", name: "subscript" },
		{ mark: "``", name: "code" }
	];
	
	// Process line by line (formatting usually doesn't span lines)
	var lines = text.split("\n");
	var lineStart = 0;
	
	lines.forEach(function(line, lineNum) {
		formats.forEach(function(fmt) {
			var count = 0;
			var i = 0;
			var lastPos = -1;
			
			while (i < line.length) {
				if (line.substr(i, fmt.mark.length) === fmt.mark) {
					count++;
					lastPos = i;
					i += fmt.mark.length;
				} else {
					i++;
				}
			}
			
			// Odd number means unclosed
			if (count % 2 !== 0 && lastPos >= 0) {
				diagnostics.push({
					from: lineStart + lastPos,
					to: lineStart + lastPos + fmt.mark.length,
					severity: "warning",
					message: "Possibly unclosed " + fmt.name + " formatting"
				});
			}
		});
		
		lineStart += line.length + 1; // +1 for newline
	});
}

/**
 * Check for common filter errors
 */
function checkFilters(text, diagnostics) {
	// Look for filter contexts
	var filterContexts = [
		/\[all\[([^\]]*)\]\]/g,
		/\[is\[([^\]]*)\]\]/g,
		/<\$list\s+filter="([^"]*)"/g,
		/<\$list\s+filter='([^']*)'/g,
		/\{\{\{([^}]*)\}\}\}/g
	];
	
	filterContexts.forEach(function(regex) {
		var match;
		while ((match = regex.exec(text)) !== null) {
			var filter = match[1];
			
			// Check for unbalanced brackets in filter
			var openBrackets = (filter.match(/\[/g) || []).length;
			var closeBrackets = (filter.match(/\]/g) || []).length;
			
			if (openBrackets !== closeBrackets) {
				diagnostics.push({
					from: match.index,
					to: match.index + match[0].length,
					severity: "error",
					message: "Unbalanced brackets in filter expression"
				});
			}
		}
	});
}

/**
 * Check for pragma errors
 */
function checkPragmas(text, diagnostics) {
	var lines = text.split("\n");
	var lineStart = 0;
	var inPragmaBlock = true;
	
	lines.forEach(function(line, lineNum) {
		var trimmed = line.trim();
		
		// Check if we're past pragma section
		if (trimmed && !trimmed.startsWith("\\") && inPragmaBlock) {
			inPragmaBlock = false;
		}
		
		// Check pragma syntax
		if (trimmed.startsWith("\\")) {
			// Pragma found after non-pragma content
			if (!inPragmaBlock && lineNum > 0) {
				diagnostics.push({
					from: lineStart,
					to: lineStart + line.length,
					severity: "warning",
					message: "Pragma should be at the start of the document"
				});
			}
			
			// Check for common pragma errors
			var defineMatch = trimmed.match(/^\\define\s+([^\s(]+)/);
			if (defineMatch) {
				// Check for \\end
				var hasEnd = text.indexOf("\\end", lineStart) > lineStart;
				if (!hasEnd && !trimmed.includes(")") ) {
					// Multi-line macro without \end
					diagnostics.push({
						from: lineStart,
						to: lineStart + line.length,
						severity: "warning",
						message: "Multi-line macro may need \\end"
					});
				}
			}
		}
		
		lineStart += line.length + 1;
	});
}

// ============================================================================
// Linter Function
// ============================================================================

function tiddlywikiLinter(view) {
	var diagnostics = [];
	var text = view.state.doc.toString();
	
	// Run all checks
	checkBrackets(text, diagnostics);
	checkWidgets(text, diagnostics);
	checkWidgetNames(text, diagnostics);
	checkFormatting(text, diagnostics);
	checkFilters(text, diagnostics);
	checkPragmas(text, diagnostics);
	
	// Link checking is optional (can be slow)
	if (view._cm6Engine && view._cm6Engine.options.lintLinks !== false) {
		checkLinks(text, diagnostics);
	}
	
	return diagnostics;
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-lint",
	description: "Validate TiddlyWiki wikitext for common errors",
	priority: 300,
	
	// Only load for TiddlyWiki content when linting is enabled
	condition: function(context) {
		var type = context.tiddlerType;
		if (context.options.lint === false) return false;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var extensions = [];
		
		var linter = (core.lint || {}).linter;
		var lintGutter = (core.lint || {}).lintGutter;
		var lintKeymap = (core.lint || {}).lintKeymap;
		var keymap = core.view.keymap;
		
		if (linter) {
			extensions.push(linter(tiddlywikiLinter, {
				delay: 500 // Debounce linting
			}));
		}
		
		if (lintGutter && context.options.lintGutter !== false) {
			extensions.push(lintGutter());
		}
		
		if (lintKeymap && keymap) {
			extensions.push(keymap.of(lintKeymap));
		}
		
		// Store engine reference for linter options
		var EditorView = core.view.EditorView;
		extensions.push(
			EditorView.updateListener.of(function(update) {
				if (!update.view._cm6Engine && context.engine) {
					update.view._cm6Engine = context.engine;
				}
			})
		);
		
		return extensions;
	},
	
	extendAPI: function(engine, context) {
		var core = this._core;
		var forceLinting = (core.lint || {}).forceLinting;
		var setDiagnostics = (core.lint || {}).setDiagnostics;
		var openLintPanel = (core.lint || {}).openLintPanel;
		var closeLintPanel = (core.lint || {}).closeLintPanel;
		
		return {
			/**
			 * Force re-lint the document
			 */
			lint: function() {
				if (this._destroyed || !forceLinting) return;
				forceLinting(this.view);
			},
			
			/**
			 * Get current diagnostics
			 */
			getDiagnostics: function() {
				if (this._destroyed) return [];
				return tiddlywikiLinter(this.view);
			},
			
			/**
			 * Open lint panel
			 */
			openLintPanel: function() {
				if (this._destroyed || !openLintPanel) return;
				openLintPanel(this.view);
			},
			
			/**
			 * Close lint panel
			 */
			closeLintPanel: function() {
				if (this._destroyed || !closeLintPanel) return;
				closeLintPanel(this.view);
			},
			
			/**
			 * Set custom diagnostics
			 */
			setDiagnostics: function(diagnostics) {
				if (this._destroyed || !setDiagnostics) return;
				this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
			}
		};
	}
};
