/**
 * Wiki rule completion source for \rules pragma
 */
// Fallback core wiki parser rules (used when no callback provided)
export const coreWikiRules = [
    // Pragma rules
    { name: "commentblock", types: "block, pragma" },
    { name: "fnprocdef", types: "pragma" },
    { name: "import", types: "pragma" },
    { name: "macrodef", types: "pragma" },
    { name: "parameters", types: "pragma" },
    { name: "parsermode", types: "pragma" },
    { name: "rules", types: "pragma" },
    { name: "whitespace", types: "pragma" },
    // Block rules
    { name: "codeblock", types: "block" },
    { name: "filteredtranscludeblock", types: "block" },
    { name: "heading", types: "block" },
    { name: "horizrule", types: "block" },
    { name: "list", types: "block" },
    { name: "macrocallblock", types: "block" },
    { name: "quoteblock", types: "block" },
    { name: "styleblock", types: "block" },
    { name: "table", types: "block" },
    { name: "transcludeblock", types: "block" },
    { name: "typedblock", types: "block" },
    // Inline rules
    { name: "codeinline", types: "inline" },
    { name: "commentinline", types: "inline" },
    { name: "dash", types: "inline" },
    { name: "entity", types: "inline" },
    { name: "extlink", types: "inline" },
    { name: "filteredtranscludeinline", types: "inline" },
    { name: "hardlinebreaks", types: "inline" },
    { name: "image", types: "inline" },
    { name: "macrocallinline", types: "inline" },
    { name: "prettyextlink", types: "inline" },
    { name: "prettylink", types: "inline" },
    { name: "styleinline", types: "inline" },
    { name: "syslink", types: "inline" },
    { name: "transcludeinline", types: "inline" },
    { name: "wikilink", types: "inline" },
    { name: "wikilinkprefix", types: "inline" },
    // Mixed block/inline rules
    { name: "conditional", types: "block, inline" },
    { name: "html", types: "block, inline" },
    // Emphasis rules (inline)
    { name: "bold", types: "inline" },
    { name: "italic", types: "inline" },
    { name: "strikethrough", types: "inline" },
    { name: "subscript", types: "inline" },
    { name: "superscript", types: "inline" },
    { name: "underscore", types: "inline" },
];
/**
 * Wiki rule completion source for \rules only/except
 * @param getWikiRules Optional callback to get wiki rules programmatically
 */
export function wikiruleCompletion(getWikiRules) {
    return (context) => {
        const pos = context.pos;
        const doc = context.state.doc;
        const line = doc.lineAt(pos);
        const textBefore = doc.sliceString(line.from, pos);
        // First check if we're on a \rules only/except line
        const rulesMatch = /^(\s*)\\rules\s+(only|except)\s+/.exec(textBefore);
        if (!rulesMatch)
            return null;
        // Extract the current partial (last word being typed, or empty if after space)
        const afterKeyword = textBefore.slice(rulesMatch[0].length);
        const partialMatch = /(\S*)$/.exec(afterKeyword);
        const partial = partialMatch ? partialMatch[1] : "";
        const from = pos - partial.length;
        // Get rules from callback or use fallback
        const rules = getWikiRules ? getWikiRules() : coreWikiRules;
        const options = rules.map(rule => ({
            label: rule.name,
            type: "constant",
            detail: rule.types,
        }));
        return {
            from,
            to: pos,
            options,
            validFor: /^\S*$/
        };
    };
}
//# sourceMappingURL=wikirule.js.map