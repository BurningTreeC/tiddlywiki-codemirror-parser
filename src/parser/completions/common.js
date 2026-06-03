/**
 * Common utilities and constants for TiddlyWiki completions
 */
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
// ============================================================================
// State Effects and Extensions
// ============================================================================
/**
 * State effect to request completion trigger after a completion is accepted.
 */
export const triggerCompletionEffect = StateEffect.define();
/**
 * Extension that listens for triggerCompletionEffect and triggers completion.
 */
export const triggerCompletionOnAccept = EditorView.updateListener.of((update) => {
    for (const tr of update.transactions) {
        for (const effect of tr.effects) {
            if (effect.is(triggerCompletionEffect)) {
                // Use requestAnimationFrame + setTimeout to ensure the completion
                // popup has fully closed before we try to open a new one
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        startCompletion(update.view);
                    }, 1);
                });
                return;
            }
        }
    }
});
// ============================================================================
// Self-closing tags and widgets
// ============================================================================
export const selfClosingTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
]);
export const selfClosingWidgets = new Set([
    // Action widgets (never have children)
    "$action-confirm", "$action-createtiddler", "$action-deletetiddler",
    "$action-deletefield", "$action-listops", "$action-log",
    "$action-navigate", "$action-popup", "$action-sendmessage",
    "$action-setfield", "$action-setmultiplefields",
    // Widgets that don't process children
    "$audio", "$codeblock", "$count", "$data", "$edit-text",
    "$encrypt", "$entity", "$error", "$image", "$jsontiddler",
    "$raw", "$text"
]);
// ============================================================================
// Built-in variables
// ============================================================================
export const builtInVariables = [
    "transclusion",
    "currentTiddler",
    "storyTiddler",
    "tv-story-list",
    "tv-history-list",
    "tv-config-toolbar-icons",
    "tv-config-toolbar-text",
    "tv-config-toolbar-class",
    "tv-wikilinks",
    "tv-show-missing-links",
    "revealedTitle",
    "tv-tiddler-preview"
];
// ============================================================================
// Default field names
// ============================================================================
export const defaultFieldNames = [
    "title", "text", "tags", "modified", "created", "creator", "modifier",
    "type", "caption", "description", "list", "list-before", "list-after",
    "draft.of", "draft.title", "plugin-type", "plugin-priority", "color",
    "icon", "library", "source", "code-body", "throttle.refresh"
];
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Helper to build changes for all selections (multi-cursor support)
 */
export function buildMultiSelectionChanges(view, from, to, insert, patternLen) {
    const selections = view.state.selection.ranges;
    const mainIndex = view.state.selection.mainIndex;
    return selections.map((range, idx) => {
        if (idx === mainIndex) {
            return { from, to, insert };
        }
        else {
            return { from: range.from - patternLen, to: range.from, insert };
        }
    });
}
/**
 * Calculate boost value for autocompletion based on tiddler type.
 * Priority order (highest to lowest):
 * - Regular tiddlers: boost 1
 * - System tiddlers ($:/): boost -1
 * - Draft tiddlers: boost -100 (always at bottom)
 */
export function getTiddlerBoost(title, isDraftTiddler) {
    // Drafts always go to the bottom
    if (isDraftTiddler && isDraftTiddler(title)) {
        return -100;
    }
    // System tiddlers below regular tiddlers
    return title.startsWith("$:/") ? -1 : 1;
}
/**
 * Get sortText for autocompletion to ensure correct sort order.
 * Uses prefix to force: regular tiddlers, then system, then drafts.
 */
export function getTiddlerSortText(title, isDraftTiddler) {
    // Drafts always at the bottom
    if (isDraftTiddler && isDraftTiddler(title)) {
        return "2_" + title;
    }
    // System tiddlers after regular tiddlers
    if (title.startsWith("$:/")) {
        return "1_" + title;
    }
    // Regular tiddlers first
    return "0_" + title;
}
// ============================================================================
// Local Definition Extraction (cached)
// ============================================================================
let _localDefsCache = { text: "", result: null };
/**
 * Find where the pragma section ends in a document.
 * Pragmas are only valid at the top of the document.
 * The pragma section ends when we encounter non-pragma, non-whitespace content
 * that is not inside a multi-line pragma block.
 */
export function findPragmaSectionEnd(text) {
    let pos = 0;
    let inMultiLinePragma = false;
    while (pos < text.length) {
        // Skip whitespace at start of line
        const lineStart = pos;
        while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) {
            pos++;
        }
        // Check for end of text or newline (empty line)
        if (pos >= text.length) {
            return text.length;
        }
        if (text[pos] === '\n' || text[pos] === '\r') {
            pos++;
            if (text[pos - 1] === '\r' && text[pos] === '\n')
                pos++;
            continue;
        }
        // Check for pragma line starting with backslash
        if (text[pos] === '\\') {
            const lineRest = text.slice(pos);
            // Check for \end (ends multi-line pragma)
            if (/^\\end\b/.test(lineRest)) {
                inMultiLinePragma = false;
                // Skip to end of line
                while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r')
                    pos++;
                if (text[pos] === '\r')
                    pos++;
                if (text[pos] === '\n')
                    pos++;
                continue;
            }
            // Check for definition pragmas that start multi-line blocks
            const defMatch = /^\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/.exec(lineRest);
            if (defMatch) {
                // Check if it's a single-line definition (has content on same line after params)
                const afterMatch = lineRest.slice(defMatch[0].length);
                const hasInlineContent = /^\s*\S/.test(afterMatch) && !/^\s*[\r\n]/.test(afterMatch);
                if (!hasInlineContent) {
                    inMultiLinePragma = true;
                }
                // Skip to end of line
                while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r')
                    pos++;
                if (text[pos] === '\r')
                    pos++;
                if (text[pos] === '\n')
                    pos++;
                continue;
            }
            // Check for other valid pragmas (rules, whitespace, import, parameters, parsermode)
            if (/^\\(rules|whitespace|import|parameters|parsermode)\b/.test(lineRest)) {
                // Skip to end of line
                while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r')
                    pos++;
                if (text[pos] === '\r')
                    pos++;
                if (text[pos] === '\n')
                    pos++;
                continue;
            }
            // Unknown backslash - if we're in a multi-line pragma, it's content
            // Otherwise, this ends the pragma section
            if (!inMultiLinePragma) {
                return lineStart;
            }
        }
        else if (inMultiLinePragma) {
            // Inside multi-line pragma - this is pragma content, skip to end of line
            while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r')
                pos++;
            if (text[pos] === '\r')
                pos++;
            if (text[pos] === '\n')
                pos++;
            continue;
        }
        else {
            // Non-backslash, non-whitespace content outside pragma block - end of pragma section
            return lineStart;
        }
        // Skip to end of line (fallback)
        while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r')
            pos++;
        if (text[pos] === '\r')
            pos++;
        if (text[pos] === '\n')
            pos++;
    }
    return text.length;
}
/**
 * Extract definition names from document text
 */
export function extractLocalDefinitions(text) {
    if (_localDefsCache.text === text && _localDefsCache.result) {
        return _localDefsCache.result;
    }
    const functions = [];
    const procedures = [];
    const macros = [];
    const widgets = [];
    const seen = {};
    const definitionParams = {};
    // Only look for pragmas in the pragma section at the top of the document
    const pragmaSectionEnd = findPragmaSectionEnd(text);
    const pragmaSection = text.slice(0, pragmaSectionEnd);
    // Pragmas must be at start of line with only whitespace in front
    const pragmaRegex = /(?:^|[\r\n])[ \t]*\\(define|procedure|function|widget)\s+([^\s(]+)(?:\(([^)]*)\))?/gm;
    let match;
    while ((match = pragmaRegex.exec(pragmaSection)) !== null) {
        const type = match[1];
        const name = match[2];
        const paramsStr = match[3];
        if (!seen[name]) {
            seen[name] = true;
            switch (type) {
                case 'function':
                    functions.push(name);
                    break;
                case 'procedure':
                    procedures.push(name);
                    break;
                case 'define':
                    macros.push(name);
                    break;
                case 'widget':
                    widgets.push(name);
                    break;
            }
            if (paramsStr !== undefined && paramsStr.trim()) {
                const params = paramsStr.split(',').map(p => {
                    const paramName = p.trim().split(':')[0].trim();
                    return paramName;
                }).filter(p => p.length > 0);
                if (params.length > 0) {
                    definitionParams[name] = params;
                }
            }
            else {
                // Check for \parameters pragma on the next line
                const afterDef = text.slice(match.index + match[0].length);
                const parametersMatch = /^\s*\n?\s*\\parameters\s*\(([^)]*)\)/.exec(afterDef);
                if (parametersMatch) {
                    const params = parametersMatch[1].split(',').map(p => {
                        const paramName = p.trim().split(':')[0].trim();
                        return paramName;
                    }).filter(p => p.length > 0);
                    if (params.length > 0) {
                        definitionParams[name] = params;
                    }
                }
            }
        }
    }
    const widgetVars = [];
    // <$set name="varname" ...>
    const setRegex = /<\$set\s+[^>]*name\s*=\s*["']([^"']+)["']/gi;
    while ((match = setRegex.exec(text)) !== null) {
        const varName = match[1];
        if (!seen[varName]) {
            seen[varName] = true;
            widgetVars.push(varName);
        }
    }
    // <$vars attr1="val1" ...>
    const varsRegex = /<\$vars\s+([^>]+)>/gi;
    while ((match = varsRegex.exec(text)) !== null) {
        const attrs = match[1];
        const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const varName = attrMatch[1];
            if (!seen[varName]) {
                seen[varName] = true;
                widgetVars.push(varName);
            }
        }
    }
    // <$let attr1="val1" ...>
    const letRegex = /<\$let\s+([^>]+)>/gi;
    while ((match = letRegex.exec(text)) !== null) {
        const attrs = match[1];
        const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const varName = attrMatch[1];
            if (!seen[varName]) {
                seen[varName] = true;
                widgetVars.push(varName);
            }
        }
    }
    // <$parameters param1="default1" param2="default2" ...>
    const parametersRegex = /<\$parameters\s+([^>]+)>/gi;
    while ((match = parametersRegex.exec(text)) !== null) {
        const attrs = match[1];
        const attrRegex = /([a-zA-Z_][\w-]*)\s*=/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const varName = attrMatch[1];
            if (!seen[varName]) {
                seen[varName] = true;
                widgetVars.push(varName);
            }
        }
    }
    // <$list variable="item" counter="idx" ...>
    // Handle variable attribute
    const listVarRegex = /<\$list\s+[^>]*variable\s*=\s*["']([^"']+)["']/gi;
    while ((match = listVarRegex.exec(text)) !== null) {
        const varName = match[1];
        if (!seen[varName]) {
            seen[varName] = true;
            widgetVars.push(varName);
        }
    }
    // Handle counter attribute - also adds counter-first and counter-last
    const listCounterRegex = /<\$list\s+[^>]*counter\s*=\s*["']([^"']+)["']/gi;
    while ((match = listCounterRegex.exec(text)) !== null) {
        const counterName = match[1];
        // Add the counter variable itself
        if (!seen[counterName]) {
            seen[counterName] = true;
            widgetVars.push(counterName);
        }
        // Add counter-first (set to "yes" when on first iteration)
        const firstVar = counterName + "-first";
        if (!seen[firstVar]) {
            seen[firstVar] = true;
            widgetVars.push(firstVar);
        }
        // Add counter-last (set to "yes" when on last iteration)
        const lastVar = counterName + "-last";
        if (!seen[lastVar]) {
            seen[lastVar] = true;
            widgetVars.push(lastVar);
        }
    }
    // <$range variable="i" ...>
    const rangeRegex = /<\$range\s+[^>]*variable\s*=\s*["']([^"']+)["']/gi;
    while ((match = rangeRegex.exec(text)) !== null) {
        const varName = match[1];
        if (!seen[varName]) {
            seen[varName] = true;
            widgetVars.push(varName);
        }
    }
    // <$wikify name="html" ...>
    const wikifyRegex = /<\$wikify\s+[^>]*name\s*=\s*["']([^"']+)["']/gi;
    while ((match = wikifyRegex.exec(text)) !== null) {
        const varName = match[1];
        if (!seen[varName]) {
            seen[varName] = true;
            widgetVars.push(varName);
        }
    }
    const variables = [
        ...builtInVariables,
        ...functions,
        ...procedures,
        ...macros,
        ...widgets,
        ...widgetVars
    ];
    const result = { functions, procedures, macros, widgets, widgetVars, builtIns: builtInVariables, variables, definitionParams };
    _localDefsCache = { text, result };
    return result;
}
// ============================================================================
// Lexically Scoped Widget Variable Extraction
// ============================================================================
/**
 * Get variables that are lexically in scope at a given position.
 * Walks up the parse tree from the cursor position and extracts variables
 * from enclosing widgets like <$set>, <$let>, <$vars>, <$list>, etc.
 *
 * This provides TRUE lexical scoping - variables only appear in autocompletion
 * when the cursor is actually inside the widget's scope.
 */
export function getScopedWidgetVariables(state, pos) {
    const tree = syntaxTree(state);
    const doc = state.doc.toString();
    const variables = [];
    const seen = new Set();
    // Helper to extract attribute value from a Widget/InlineWidget node
    function getAttributeValue(widgetNode, attrName) {
        let child = widgetNode.firstChild;
        while (child) {
            if (child.name === "Attribute") {
                let nameNode = null;
                let valueNode = null;
                let attrChild = child.firstChild;
                while (attrChild) {
                    if (attrChild.name === "AttributeName") {
                        nameNode = attrChild;
                    }
                    else if (attrChild.name === "AttributeString" || attrChild.name === "AttributeValue") {
                        valueNode = attrChild;
                    }
                    attrChild = attrChild.nextSibling;
                }
                if (nameNode && valueNode) {
                    const name = doc.slice(nameNode.from, nameNode.to);
                    if (name === attrName) {
                        let val = doc.slice(valueNode.from, valueNode.to);
                        // Remove quotes if present
                        if ((val.startsWith('"') && val.endsWith('"')) ||
                            (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        return val;
                    }
                }
            }
            child = child.nextSibling;
        }
        return null;
    }
    // Helper to get all attribute names from a widget (for <$let>, <$vars>, <$parameters>)
    function getAllAttributeNames(widgetNode) {
        const names = [];
        let child = widgetNode.firstChild;
        while (child) {
            if (child.name === "Attribute") {
                let attrChild = child.firstChild;
                while (attrChild) {
                    if (attrChild.name === "AttributeName") {
                        names.push(doc.slice(attrChild.from, attrChild.to));
                    }
                    attrChild = attrChild.nextSibling;
                }
            }
            child = child.nextSibling;
        }
        return names;
    }
    // Helper to get widget name from a Widget/InlineWidget node
    function getWidgetName(widgetNode) {
        let child = widgetNode.firstChild;
        while (child) {
            if (child.name === "WidgetName") {
                return doc.slice(child.from, child.to);
            }
            child = child.nextSibling;
        }
        return null;
    }
    // Helper to add a variable if not already seen
    function addVariable(name) {
        if (!seen.has(name)) {
            seen.add(name);
            variables.push(name);
        }
    }
    // Walk up the parse tree from the cursor position
    let node = tree.resolveInner(pos, -1);
    while (node && !node.type.isTop) {
        // Check if this is a Widget or InlineWidget
        if (node.name === "Widget" || node.name === "InlineWidget") {
            const widgetName = getWidgetName(node);
            if (widgetName) {
                switch (widgetName) {
                    case "$set": {
                        // <$set name="varname" ...> → varname
                        const varName = getAttributeValue(node, "name");
                        if (varName)
                            addVariable(varName);
                        break;
                    }
                    case "$let":
                    case "$vars":
                    case "$parameters": {
                        // <$let attr1="val" attr2="val"> → attr1, attr2
                        // <$vars attr1="val"> → attr1
                        // <$parameters param1="default"> → param1
                        const attrNames = getAllAttributeNames(node);
                        for (const name of attrNames) {
                            addVariable(name);
                        }
                        break;
                    }
                    case "$list": {
                        // <$list variable="item" counter="idx"> → item, idx, idx-first, idx-last
                        const varName = getAttributeValue(node, "variable");
                        if (varName)
                            addVariable(varName);
                        const counterName = getAttributeValue(node, "counter");
                        if (counterName) {
                            addVariable(counterName);
                            addVariable(counterName + "-first");
                            addVariable(counterName + "-last");
                        }
                        break;
                    }
                    case "$range": {
                        // <$range variable="i"> → i
                        const varName = getAttributeValue(node, "variable");
                        if (varName)
                            addVariable(varName);
                        break;
                    }
                    case "$wikify": {
                        // <$wikify name="html"> → html
                        const varName = getAttributeValue(node, "name");
                        if (varName)
                            addVariable(varName);
                        break;
                    }
                    case "$droppable": {
                        // <$droppable> provides actionTiddler in its actions attribute scope
                        // But this is for action context, not general scope - skip here
                        break;
                    }
                    case "$importvariables": {
                        // <$importvariables> imports variables but we'd need the filter to know which
                        // For now, skip - complex to determine which variables are imported
                        break;
                    }
                }
            }
        }
        node = node.parent;
    }
    return variables;
}
//# sourceMappingURL=common.js.map