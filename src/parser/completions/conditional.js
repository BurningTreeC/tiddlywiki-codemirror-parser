/**
 * Conditional keyword completion source (<%if, <%else, etc.)
 */
import { getIndentUnit } from "@codemirror/language";
import { buildMultiSelectionChanges } from "./common";
const conditionalKeywords = [
    { label: "if", detail: "Conditional if", insert: " if [] %>", outdent: false },
    { label: "elseif", detail: "Conditional else-if", insert: " elseif [] %>", outdent: true },
    { label: "else", detail: "Conditional else", insert: " else %>", outdent: true },
    { label: "endif", detail: "End conditional", insert: " endif %>", outdent: true },
];
/**
 * Conditional keyword completion source
 */
export function conditionalCompletion(context) {
    const pos = context.pos;
    const doc = context.state.doc;
    const line = doc.lineAt(pos);
    const textBefore = doc.sliceString(line.from, pos);
    const match = /<%(\s*)(\w*)$/.exec(textBefore);
    if (!match)
        return null;
    const whitespace = match[1];
    const partial = match[2];
    const hasWhitespace = whitespace.length > 0;
    const from = pos - partial.length;
    const patternLen = partial.length;
    const openMarkPos = textBefore.lastIndexOf('<%');
    const options = conditionalKeywords.map(kw => {
        const insert = hasWhitespace ? kw.insert.trimStart() : kw.insert;
        return {
            label: kw.label,
            type: "keyword",
            detail: kw.detail,
            apply: (view, _completion, from, to) => {
                if (kw.outdent && openMarkPos > 0 && view.state.selection.ranges.length === 1) {
                    const unit = getIndentUnit(view.state);
                    const leadingWhitespace = textBefore.slice(0, openMarkPos);
                    let currentIndent = 0;
                    for (const ch of leadingWhitespace) {
                        if (ch === ' ')
                            currentIndent++;
                        else if (ch === '\t')
                            currentIndent += unit;
                    }
                    const newIndent = Math.max(0, currentIndent - unit);
                    const newWhitespace = ' '.repeat(newIndent);
                    const fullInsert = newWhitespace + '<%' + kw.insert;
                    const cursorOffset = (kw.label === "elseif")
                        ? fullInsert.indexOf('[') + 1
                        : fullInsert.length;
                    view.dispatch({
                        changes: { from: line.from, to, insert: fullInsert },
                        selection: { anchor: line.from + cursorOffset }
                    });
                }
                else {
                    const cursorOffset = (kw.label === "if" || kw.label === "elseif")
                        ? insert.indexOf('[') + 1
                        : insert.length;
                    const changes = buildMultiSelectionChanges(view, from, to, insert, patternLen);
                    view.dispatch({
                        changes,
                        selection: { anchor: from + cursorOffset }
                    });
                }
            }
        };
    });
    return {
        from,
        to: pos,
        options,
        validFor: /^\w*$/
    };
}
//# sourceMappingURL=conditional.js.map