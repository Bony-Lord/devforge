# DevForge 0.6.0-beta.2 — local interface and notebook update

This candidate is experimental. It was built locally; the published beta.1 is a
separate artifact. Android touch/IME behavior and Linux/macOS installers are not
physically verified by this update.

Windows was silently updated on the user's computer: all 579 installed payload
files match the package; settings and the 10 registered projects were retained.
The report is [verification-polish-beta2.json](verification-polish-beta2.json).

## Workbench

- Neutral gray work surfaces and restrained accents replace the blue palette.
- Choices use available screen space. Only the list scrolls when it really
  exceeds the available height; the surrounding popup does not scroll too.
- Scrollbar thumbs are thin and low-contrast. Python environment paths expand
  their popup where possible and wrap when necessary.
- Primary Apply buttons have a solid contrasting background.
- Hidden files and descendants use a subtle yellow row fill.
- Extensions is on the upper activity rail with navigation/Git. Console actions
  stay below. Desktop omits touch-only six-dot handles and unavailable keyboard
  actions; native mouse dragging still works.
- The DevForge mark is included in PNG, ICO and executable icon resources, not
  only the in-app header. Run-profile controls reserve room for their whole icon.

## Extensions

The catalog uses a retained compact list and a details pane, with search and
filters. Official components have bilingual summaries and usage information.
Opening details preserves the list and query. On narrow screens the details
replace the list within the same editor tab; Back restores the list.

Desktop **From file / VSIX** accepts declarative snippets and JSON workbench
colors from a local `.vsix`. It converts those contributions into a data addon
and shows the usual third-party review before installation. Snippets participate
in completion in ordinary Monaco source editors. This is a compatibility adapter,
not a VS Code extension host. Executable JS, activation events, language servers,
debug adapters, arbitrary APIs, TextMate rules and `.tmTheme` are not loaded.
Unsupported contributions are stated in the imported package details. Original
extension licenses still apply. No VS Code Marketplace service is deployed.

Reference contracts: [VS Code extension guides](https://code.visualstudio.com/api/extension-guides/overview)
and [color themes](https://code.visualstudio.com/api/extension-guides/color-theme).

## Notebook

- A visible **Cells / Ячейки** button returns from raw JSON to the notebook view.
- Code fields fit their line count instead of reserving an extra blank line.
  Long cells grow within the notebook; truly oversized cells retain scrolling.
  The syntax layer reserves the same scrollbar space as the input field.
- RAM, cell time, total execution time, working-folder budget and supported CPU
  limits have sliders plus manual numeric fields. The two controls synchronize;
  0 is unlimited. Wide ranges use logarithmic slider positions. The existing
  resource enforcement is unchanged; GPU percentage quotas remain unsupported.
- Markdown cells have a distinct edge/type label and render when not being
  edited. Double-click the preview or use the pencil to edit source; moving focus
  away restores the preview. JSON source remains intact.
- Rendering includes headings, emphasis, lists, tables, fenced code, task lists,
  `[[file|label]]` project links and Obsidian-style callouts. Tasks can be toggled
  in a writable notebook preview. This is whole-cell editing like Colab; per-block
  Obsidian Live Preview and executable Obsidian plugins are not implemented.
- `/table`, `/task`, `/code`, `/callout`, links and other templates, or the
  configured completion shortcut, offer Markdown completions. `[[` searches
  Markdown files in the project. These templates do not execute code.
- Raw HTML is escaped and remote images are not fetched automatically. Mermaid,
  MathJax/LaTeX and arbitrary Markdown-plugin APIs are not implemented.
- Problem rows and notebook diagnostics show their source, including PEP 8,
  Python, clangd, CMake and Runtime where supplied by the provider. Notebook
  runtime error outputs have a Runtime label.

The renderer uses [markdown-it 14.1.0](https://github.com/markdown-it/markdown-it/tree/14.1.0)
under MIT; its license is bundled. Sources are stored independently of rendered
DOM so preview HTML cannot rewrite code or notebook metadata.
