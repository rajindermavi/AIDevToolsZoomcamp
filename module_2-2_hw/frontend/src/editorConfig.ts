import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";

export type Language = "python" | "javascript";

const baseTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0b132b",
      color: "#e2e8f0",
      fontSize: "14px",
    },
    ".cm-content": {
      fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
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

export function getExtensions(language: Language) {
  const langExt =
    language === "python" ? python() : javascript({ jsx: true, typescript: true });
  return [baseTheme, langExt];
}
