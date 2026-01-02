/*\
title: $:/plugins/BurningTreeC/tiddlywiki-codemirror/plugins/tw-snippets.js
type: application/javascript
module-type: codemirror6-plugin

TiddlyWiki Snippets Plugin - provides code templates for common constructs.

Trigger snippets by typing abbreviation and pressing Tab.

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// ============================================================================
// Snippet Definitions
// ============================================================================

/**
 * Snippet format:
 * - trigger: abbreviation that triggers the snippet
 * - label: display name in completion menu
 * - detail: short description
 * - template: the snippet template with $1, $2, etc. for tab stops
 *             $0 marks final cursor position
 *             ${1:default} provides default text
 */
var SNIPPETS = [
	// === Pragmas ===
	{
		trigger: "\\def",
		label: "\\define macro",
		detail: "Define a macro",
		template: "\\define ${1:macroname}(${2:params})\n$0\n\\end"
	},
	{
		trigger: "\\proc",
		label: "\\procedure",
		detail: "Define a procedure",
		template: "\\procedure ${1:name}(${2:params})\n$0\n\\end"
	},
	{
		trigger: "\\func",
		label: "\\function",
		detail: "Define a function",
		template: "\\function ${1:name}(${2:params}) $0"
	},
	{
		trigger: "\\widg",
		label: "\\widget",
		detail: "Define a custom widget",
		template: "\\widget ${1:\\$name}(${2:params})\n$0\n\\end"
	},
	{
		trigger: "\\param",
		label: "\\parameters",
		detail: "Parameter definitions",
		template: "\\parameters (${1:param1}:\"${2:default}\")"
	},
	{
		trigger: "\\imp",
		label: "\\import",
		detail: "Import macros",
		template: "\\import ${1:[[$:/core/macros/tabs]]}"
	},
	
	// === Widgets ===
	{
		trigger: "$list",
		label: "<$list>",
		detail: "List widget",
		template: "<$list filter=\"${1:[tag[${2:tagname}]]}\">\n\t$0\n</$list>"
	},
	{
		trigger: "$link",
		label: "<$link>",
		detail: "Link widget",
		template: "<$link to=\"${1:TiddlerTitle}\">$0</$link>"
	},
	{
		trigger: "$button",
		label: "<$button>",
		detail: "Button widget",
		template: "<$button message=\"${1:tm-navigate}\" param=\"${2:TiddlerTitle}\">\n\t$0\n</$button>"
	},
	{
		trigger: "$reveal",
		label: "<$reveal>",
		detail: "Reveal widget",
		template: "<$reveal type=\"${1:match}\" state=\"${2:\\$:/state/mystate}\" text=\"${3:show}\">\n\t$0\n</$reveal>"
	},
	{
		trigger: "$set",
		label: "<$set>",
		detail: "Set variable",
		template: "<$set name=\"${1:varname}\" value=\"${2:value}\">\n\t$0\n</$set>"
	},
	{
		trigger: "$let",
		label: "<$let>",
		detail: "Define variables",
		template: "<$let ${1:var1}=\"${2:value1}\" ${3:var2}=\"${4:value2}\">\n\t$0\n</$let>"
	},
	{
		trigger: "$vars",
		label: "<$vars>",
		detail: "Define multiple variables",
		template: "<$vars ${1:var1}=\"${2:value1}\">\n\t$0\n</$vars>"
	},
	{
		trigger: "$transclude",
		label: "<$transclude>",
		detail: "Transclude widget",
		template: "<$transclude tiddler=\"${1:TiddlerTitle}\" field=\"${2:text}\"/>"
	},
	{
		trigger: "$tiddler",
		label: "<$tiddler>",
		detail: "Tiddler context widget",
		template: "<$tiddler tiddler=\"${1:TiddlerTitle}\">\n\t$0\n</$tiddler>"
	},
	{
		trigger: "$wikify",
		label: "<$wikify>",
		detail: "Wikify text to variable",
		template: "<$wikify name=\"${1:result}\" text=\"\"\"${2:wikitext}\"\"\">\n\t$0\n</$wikify>"
	},
	{
		trigger: "$view",
		label: "<$view>",
		detail: "View field widget",
		template: "<$view field=\"${1:title}\" format=\"${2:text}\"/>"
	},
	{
		trigger: "$edit",
		label: "<$edit-text>",
		detail: "Edit text widget",
		template: "<$edit-text tiddler=\"${1:TiddlerTitle}\" field=\"${2:text}\" class=\"${3:tc-edit-texteditor}\" placeholder=\"${4:Enter text}\"/>"
	},
	{
		trigger: "$checkbox",
		label: "<$checkbox>",
		detail: "Checkbox widget",
		template: "<$checkbox tiddler=\"${1:TiddlerTitle}\" field=\"${2:done}\" checked=\"${3:yes}\" unchecked=\"${4:no}\" default=\"${5:no}\"> ${6:Label}</$checkbox>"
	},
	{
		trigger: "$radio",
		label: "<$radio>",
		detail: "Radio button widget",
		template: "<$radio tiddler=\"${1:TiddlerTitle}\" field=\"${2:option}\" value=\"${3:value}\"> ${4:Label}</$radio>"
	},
	{
		trigger: "$select",
		label: "<$select>",
		detail: "Select dropdown",
		template: "<$select tiddler=\"${1:TiddlerTitle}\" field=\"${2:selection}\">\n\t<option value=\"${3:value1}\">${4:Option 1}</option>\n\t<option value=\"${5:value2}\">${6:Option 2}</option>\n</$select>"
	},
	{
		trigger: "$keyboard",
		label: "<$keyboard>",
		detail: "Keyboard shortcut widget",
		template: "<$keyboard key=\"${1:ctrl+Enter}\" actions=\"\"\"${2:<$action-sendmessage $message=\"tm-save-tiddler\"/>}\"\"\">\n\t$0\n</$keyboard>"
	},
	{
		trigger: "$eventcatcher",
		label: "<$eventcatcher>",
		detail: "Event catcher widget",
		template: "<$eventcatcher ${1:click}=\"\"\"${2:<$action-log/>}\"\"\">\n\t$0\n</$eventcatcher>"
	},
	{
		trigger: "$image",
		label: "<$image>",
		detail: "Image widget",
		template: "<$image source=\"${1:ImageTiddler}\" width=\"${2:100}\" tooltip=\"${3:description}\"/>"
	},
	{
		trigger: "$codeblock",
		label: "<$codeblock>",
		detail: "Code block widget",
		template: "<$codeblock code=\"\"\"${1:code here}\"\"\" language=\"${2:javascript}\"/>"
	},
	
	// === Actions ===
	{
		trigger: "$action-set",
		label: "<$action-setfield>",
		detail: "Set field action",
		template: "<$action-setfield $tiddler=\"${1:TiddlerTitle}\" $field=\"${2:fieldname}\" $value=\"${3:value}\"/>"
	},
	{
		trigger: "$action-del",
		label: "<$action-deletefield>",
		detail: "Delete field action",
		template: "<$action-deletefield $tiddler=\"${1:TiddlerTitle}\" $field=\"${2:fieldname}\"/>"
	},
	{
		trigger: "$action-create",
		label: "<$action-createtiddler>",
		detail: "Create tiddler action",
		template: "<$action-createtiddler $basetitle=\"${1:NewTiddler}\" ${2:fieldname}=\"${3:value}\"/>"
	},
	{
		trigger: "$action-nav",
		label: "<$action-navigate>",
		detail: "Navigate action",
		template: "<$action-navigate $to=\"${1:TiddlerTitle}\"/>"
	},
	{
		trigger: "$action-msg",
		label: "<$action-sendmessage>",
		detail: "Send message action",
		template: "<$action-sendmessage $message=\"${1:tm-save-tiddler}\" $param=\"${2:param}\"/>"
	},
	{
		trigger: "$action-log",
		label: "<$action-log>",
		detail: "Log to console",
		template: "<$action-log ${1:varname}/>"
	},
	{
		trigger: "$action-listops",
		label: "<$action-listops>",
		detail: "List operations",
		template: "<$action-listops $tiddler=\"${1:TiddlerTitle}\" $field=\"${2:list}\" $subfilter=\"${3:+[append[item]]}\"/>"
	},
	{
		trigger: "$action-confirm",
		label: "<$action-confirm>",
		detail: "Confirm action",
		template: "<$action-confirm $message=\"${1:Are you sure?}\">\n\t$0\n</$action-confirm>"
	},
	
	// === Macros ===
	{
		trigger: "<<now",
		label: "<<now>>",
		detail: "Current date/time",
		template: "<<now \"${1:YYYY-0MM-0DD 0hh:0mm}\">>"
	},
	{
		trigger: "<<tag",
		label: "<<tag>>",
		detail: "Tag pill",
		template: "<<tag \"${1:tagname}\">>"
	},
	{
		trigger: "<<tabs",
		label: "<<tabs>>",
		detail: "Tabs macro",
		template: "<<tabs \"${1:[tag[${2:TabTag}]]}\" \"${3:DefaultTab}\" \"$:/state/${4:tabs}\">>"
	},
	{
		trigger: "<<toc",
		label: "<<toc-expandable>>",
		detail: "Table of contents",
		template: "<<toc-expandable \"${1:tagname}\">>"
	},
	{
		trigger: "<<list-links",
		label: "<<list-links>>",
		detail: "List as links",
		template: "<<list-links filter:\"${1:[tag[${2:tagname}]]}\">>"
	},
	
	// === Filters ===
	{
		trigger: "[tag",
		label: "[tag[...]]",
		detail: "Filter by tag",
		template: "[tag[${1:tagname}]]"
	},
	{
		trigger: "[field",
		label: "[field:value]",
		detail: "Filter by field",
		template: "[${1:field}[${2:value}]]"
	},
	{
		trigger: "[all",
		label: "[all[...]]",
		detail: "All tiddlers",
		template: "[all[${1|tiddlers,shadows,tiddlers+shadows,current,missing,orphans|}]]"
	},
	{
		trigger: "[is",
		label: "[is[...]]",
		detail: "Filter by type",
		template: "[is[${1|current,image,binary,system,shadow,missing,draft,tag|}]]"
	},
	{
		trigger: "[search",
		label: "[search[...]]",
		detail: "Search filter",
		template: "[search[${1:searchterm}]]"
	},
	{
		trigger: "[prefix",
		label: "[prefix[...]]",
		detail: "Title prefix filter",
		template: "[prefix[${1:$:/}]]"
	},
	{
		trigger: "[sort",
		label: "[sort[...]]",
		detail: "Sort filter",
		template: "[sort[${1:title}]]"
	},
	{
		trigger: "[limit",
		label: "[limit[...]]",
		detail: "Limit results",
		template: "[limit[${1:10}]]"
	},
	{
		trigger: "[get",
		label: "[get[...]]",
		detail: "Get field value",
		template: "[get[${1:fieldname}]]"
	},
	{
		trigger: "[has",
		label: "[has[...]]",
		detail: "Has field",
		template: "[has[${1:fieldname}]]"
	},
	{
		trigger: "[!has",
		label: "[!has[...]]",
		detail: "Does not have field",
		template: "[!has[${1:fieldname}]]"
	},
	
	// === Blocks ===
	{
		trigger: "```",
		label: "```code```",
		detail: "Code block",
		template: "```${1:javascript}\n$0\n```"
	},
	{
		trigger: "<<<",
		label: "<<<quote>>>",
		detail: "Block quote",
		template: "<<<\n$0\n<<< ${1:citation}"
	},
	{
		trigger: "$$$",
		label: "$$$typed$$$",
		detail: "Typed block",
		template: "$$$${1:text/html}\n$0\n$$$"
	},
	{
		trigger: "|table",
		label: "|table|",
		detail: "Table template",
		template: "|${1:Header 1}|${2:Header 2}|h\n|${3:Cell 1}|${4:Cell 2}|\n|${5:Cell 3}|${6:Cell 4}|"
	},
	
	// === Common Patterns ===
	{
		trigger: "btn-nav",
		label: "Button navigate",
		detail: "Button that navigates",
		template: "<$button message=\"tm-navigate\" param=\"${1:TiddlerTitle}\" class=\"tc-btn-invisible\">\n\t${2:Button Text}\n</$button>"
	},
	{
		trigger: "btn-toggle",
		label: "Button toggle",
		detail: "Toggle state button",
		template: "<$reveal type=\"nomatch\" state=\"${1:\\$:/state/mystate}\" text=\"show\">\n\t<$button set=\"$1\" setTo=\"show\" class=\"tc-btn-invisible\">Show</$button>\n</$reveal>\n<$reveal type=\"match\" state=\"$1\" text=\"show\">\n\t<$button set=\"$1\" setTo=\"hide\" class=\"tc-btn-invisible\">Hide</$button>\n\t$0\n</$reveal>"
	},
	{
		trigger: "popup",
		label: "Popup pattern",
		detail: "Button with popup",
		template: "<$button popup=\"${1:\\$:/state/popup/mypopup}\" class=\"tc-btn-invisible\">\n\t${2:Click me}\n</$button>\n<$reveal type=\"popup\" state=\"$1\" animate=\"yes\">\n\t<div class=\"tc-popup tc-drop-down\">\n\t\t$0\n\t</div>\n</$reveal>"
	},
	{
		trigger: "each",
		label: "List each",
		detail: "List with each",
		template: "<$list filter=\"${1:[tag[${2:tagname}]each[${3:category}]]}\" variable=\"${4:group}\">\n\t<h2><<$4>></h2>\n\t<$list filter=\"[tag[$2]$3<$4>]\">\n\t\t<$link/>\n\t</$list>\n</$list>"
	},
	{
		trigger: "droppable",
		label: "Droppable list",
		detail: "Draggable and droppable list",
		template: "<$list filter=\"${1:[list[${2:TiddlerTitle}]]}\">\n\t<$droppable actions=\"\"\"<$action-listops $tiddler=\"$2\" $field=\"list\" $subfilter=\"+[insertbefore:currentTiddler<actionTiddler>]\"/>\"\"\">\n\t\t<$draggable tiddler=<<currentTiddler>>>\n\t\t\t<$link/>\n\t\t</$draggable>\n\t</$droppable>\n</$list>"
	}
];

// ============================================================================
// Snippet Engine
// ============================================================================

/**
 * Parse a snippet template and extract tab stops
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

/**
 * Check if current position is at end of a snippet trigger
 */
function getSnippetAtCursor(state) {
	var sel = state.selection.main;
	if (!sel.empty) return null;
	
	var pos = sel.head;
	var line = state.doc.lineAt(pos);
	var lineText = line.text;
	var col = pos - line.from;
	
	// Get word before cursor
	var wordStart = col;
	while (wordStart > 0 && /[\w$\\<\-`|]/.test(lineText[wordStart - 1])) {
		wordStart--;
	}
	
	var trigger = lineText.slice(wordStart, col);
	if (!trigger) return null;
	
	// Find matching snippet
	for (var i = 0; i < SNIPPETS.length; i++) {
		if (SNIPPETS[i].trigger === trigger) {
			return {
				snippet: SNIPPETS[i],
				from: line.from + wordStart,
				to: pos
			};
		}
	}
	
	return null;
}

/**
 * Tab key handler - expand snippet or do default
 */
function handleTab(view) {
	var match = getSnippetAtCursor(view.state);
	if (match) {
		// Delete trigger and insert snippet
		view.dispatch({
			changes: { from: match.from, to: match.to, insert: "" }
		});
		insertSnippet(view, match.snippet);
		return true;
	}
	return false; // Let default tab behavior happen
}

// ============================================================================
// Completion Integration
// ============================================================================

/**
 * Snippet completion source
 */
function snippetCompletions(context) {
	// Only trigger on certain prefixes
	var word = context.matchBefore(/[\w$\\<`|]+/);
	if (!word || word.from === word.to) return null;
	
	var prefix = word.text.toLowerCase();
	
	var options = SNIPPETS.filter(function(s) {
		return s.trigger.toLowerCase().startsWith(prefix);
	}).map(function(s) {
		return {
			label: s.trigger,
			displayLabel: s.label,
			type: "snippet",
			detail: s.detail,
			boost: 2, // Prioritize snippets
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
		validFor: /^[\w$\\<`|]*$/
	};
}

// ============================================================================
// Plugin Definition
// ============================================================================

exports.plugin = {
	name: "tw-snippets",
	description: "Code snippets and templates for TiddlyWiki wikitext",
	priority: 540,
	
	// Only load for TiddlyWiki content
	condition: function(context) {
		var type = context.tiddlerType;
		if (context.options.snippets === false) return false;
		return !type || type === "" || type === "text/vnd.tiddlywiki" || type === "text/x-tiddlywiki";
	},
	
	init: function(cm6Core) {
		this._core = cm6Core;
	},
	
	getExtensions: function(context) {
		var core = this._core;
		var keymap = core.view.keymap;
		var Prec = core.state.Prec;
		var extensions = [];
		var engine = context.engine;

		// High-precedence Tab handler for snippets
		if (keymap && Prec) {
			extensions.push(
				Prec.high(keymap.of([
					{ key: "Tab", run: handleTab }
				]))
			);
		}

		// Register completion source with the engine
		if (engine && engine.registerCompletionSource) {
			engine.registerCompletionSource(snippetCompletions, 20);
		}

		return extensions;
	},
	
	extendAPI: function(engine, context) {
		return {
			/**
			 * Get list of available snippets
			 */
			getSnippets: function() {
				return SNIPPETS.map(function(s) {
					return {
						trigger: s.trigger,
						label: s.label,
						detail: s.detail
					};
				});
			},
			
			/**
			 * Insert a snippet by trigger name
			 */
			insertSnippetByTrigger: function(trigger) {
				if (this._destroyed) return false;
				
				for (var i = 0; i < SNIPPETS.length; i++) {
					if (SNIPPETS[i].trigger === trigger) {
						return insertSnippet(this.view, SNIPPETS[i]);
					}
				}
				return false;
			},
			
			/**
			 * Insert a custom snippet template
			 */
			insertSnippet: function(template) {
				if (this._destroyed) return false;
				return insertSnippet(this.view, { template: template });
			},
			
			/**
			 * Expand snippet at cursor (if any)
			 */
			expandSnippetAtCursor: function() {
				if (this._destroyed) return false;
				return handleTab(this.view);
			}
		};
	}
};
