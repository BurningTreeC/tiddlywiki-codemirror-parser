import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
  indentNodeProp,
  foldNodeProp,
} from "@codemirror/language"

import {tw5Parser} from "./tw5-parser"

const data = defineLanguageFacet({
  commentTokens: {
    // Best-effort: TW5 has multiple comment conventions depending on rules.
    line: "\\\\",
  },
})

function simpleFold(_tree: any, from: number, to: number) {
  if (to - from <= 2) return null
  return {from, to}
}

export const tiddlywikiLanguage = new Language(
  data,
  tw5Parser,
  [
    foldNodeProp.add({
      Heading: simpleFold,
      List: simpleFold,
      QuoteBlock: simpleFold,
      CodeBlock: simpleFold,
      Table: simpleFold,
      Paragraph: () => null,
    }),
    indentNodeProp.add({
      Document: () => null,
      List: () => null,
      ListItem: () => null,
    }),
    languageDataProp.add({
      Document: data,
    }),
  ],
  "tiddlywiki"
)

export function tiddlywiki() {
  return new LanguageSupport(tiddlywikiLanguage)
}
