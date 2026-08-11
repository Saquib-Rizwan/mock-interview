import type { Monaco } from "@monaco-editor/react";

/**
 * A Monaco theme in the Vermilion palette.
 *
 * Monaco ships `vs-dark`, whose `#1E1E1E` is a neutral grey against this app's
 * `#1D1B24`. Side by side the editor reads as a cold rectangle pasted onto a
 * warm page — the one place the design visibly stopped. Rather than leave that
 * and call it "a fixed quantity", the editor gets told the palette.
 *
 * Values are duplicated from `index.css` rather than read from it, because
 * Monaco needs concrete hex at theme-definition time and cannot resolve CSS
 * custom properties. If the tokens there change, these change with them.
 */
const INK = "#14131A";
const SURFACE = "#1D1B24";
const SURFACE_2 = "#26242E";
const CREAM = "#F5EDE0";
const CREAM_2 = "#B8B0A6";
const MUTED = "#857E77";
const BORDER = "#302E39";
const VERMILION = "#FF4A1C";
const GREEN = "#46C08A";

export const VERMILION_THEME_NAME = "vermilion";

export function defineVermilionTheme(monaco: Monaco) {
  monaco.editor.defineTheme(VERMILION_THEME_NAME, {
    base: "vs-dark",
    // Inherit vs-dark's rules for every token we do not name, so an
    // unrecognised language still highlights instead of rendering flat.
    inherit: true,
    rules: [
      // Monaco wants bare hex here, unlike `colors` below.
      { token: "", foreground: CREAM.slice(1) },
      { token: "comment", foreground: MUTED.slice(1), fontStyle: "italic" },
      // The accent marks control flow — the structure of the solution — which
      // is the thing worth seeing first when you scan someone's code.
      { token: "keyword", foreground: VERMILION.slice(1) },
      { token: "keyword.control", foreground: VERMILION.slice(1) },
      { token: "operator", foreground: VERMILION.slice(1) },
      { token: "string", foreground: GREEN.slice(1) },
      { token: "number", foreground: GREEN.slice(1) },
      { token: "regexp", foreground: GREEN.slice(1) },
      { token: "type", foreground: CREAM.slice(1) },
      { token: "type.identifier", foreground: CREAM.slice(1) },
      { token: "identifier", foreground: CREAM_2.slice(1) },
      { token: "delimiter", foreground: MUTED.slice(1) },
    ],
    colors: {
      // Matches `--card`, so the editor sits in its hairline well as an inset
      // panel rather than as a hole cut in the page.
      "editor.background": SURFACE,
      "editor.foreground": CREAM,
      "editor.lineHighlightBackground": SURFACE_2,
      "editor.selectionBackground": BORDER,
      "editorCursor.foreground": VERMILION,
      "editorLineNumber.foreground": MUTED,
      "editorLineNumber.activeForeground": VERMILION,
      "editorIndentGuide.background1": BORDER,
      "editorIndentGuide.activeBackground1": MUTED,
      "editorGutter.background": SURFACE,
      "editorWidget.background": INK,
      "editorWidget.border": BORDER,
      "editorSuggestWidget.background": INK,
      "editorSuggestWidget.selectedBackground": SURFACE_2,
      "scrollbarSlider.background": BORDER,
      "scrollbarSlider.hoverBackground": MUTED,
      "editorBracketMatch.background": SURFACE_2,
      "editorBracketMatch.border": VERMILION,
    },
  });
}
