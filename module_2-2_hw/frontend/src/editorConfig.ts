import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export type Language = "python" | "javascript";

const baseTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0b132b",
      color: "#e2e8f0",
      fontSize: "14px",
    },
    ".cm-scroller": {
      backgroundColor: "#0b132b",
    },
    ".cm-content": {
      fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
      backgroundColor: "#0b132b",
    },
    "&.cm-editor": {
      borderRadius: "12px",
    },
    ".cm-gutters": {
      backgroundColor: "#0b132b",
      color: "#94a3b8",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "#1f2937",
    },
  },
  { dark: true },
);


const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#9941d3ff" },
  { tag: tags.string, color: "#d58e2aff" },
  { tag: tags.comment, color: "#589cbcff", fontStyle: "italic" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.function(tags.variableName), color: "#cc5159ff" },
  { tag: tags.variableName, color: "#c7432cff" },
  { tag: tags.operator, color: "#d04327ff" },
  { tag: tags.punctuation, color: "#5cbc69ff" },
  { tag: tags.bracket, color: "#1d970fff" },
]);


export function getExtensions(language: Language) {
  const langExt =
    language === "python"
      ? python()
      : javascript({ jsx: true, typescript: true });

  return [
    baseTheme,
    syntaxHighlighting(highlightStyle),
    langExt,
  ];
}
