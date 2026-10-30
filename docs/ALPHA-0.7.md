# DevForge 0.7.0-alpha.3

Experimental prerelease, not a stable recommendation. Windows still uses Electron
and bundled Chromium. Android uses its system WebView. A later desktop-shell
migration must preserve the existing host protocol, projects and extension API;
WebView2/WebKitGTK/WKWebView are candidates. No memory or performance improvement
from a future shell is claimed without measurements.

## Alpha.3 corrections

- Switching the window manager keeps the same addon catalog, current query/detail,
  documents, output and editor positions. Unrelated packs are no longer expanded
  or re-enabled when a component is toggled. Existing window-mode changes still
  reload the renderer; this is not a new window engine.
- The current C++ workload (1.1) selects language/build/debug tools and no longer
  adds visual addons, a keyboard or the window manager. Pinned 1.0 manifests are
  retained for compatibility. Explicitly disabled visual addons stay disabled.
- Run keeps its text on wide desktop layouts; the run-configuration glyph is
  complete. The main menu replaces the entire toolbar. Re-clicking popup openers
  closes them, and hidden-folder row backgrounds join at their shared edges.
- Long native operations expose a delayed spinner and header activity strip.
  The addon catalog remains usable at 1024×720 and with expanded filters.
- Available but disabled system tools can be re-enabled. Missing desktop tools
  are named, with an executable-path editor and detection in Settings > Tools.
  A GDB session requires gdbserver in this implementation; LLDB DAP is another
  supported backend where available. System tools are not silently downloaded.
- Quick Access (Ctrl+P) supports fuzzy files, `>` commands, `@` document symbols,
  `#` provider workspace symbols, `:line:column`, `filename:line:column`,
  `settings `, `ext `, `project ` and `%` project contents (`%/regex/i` too).
  Notebook matches navigate to cell source. This is not every VS Code search or
  replacement feature; workspace symbols need a language provider.
- Markdown has immediate source colors, paired delimiters, list/task/fence
  editing assistance and an optional formula renderer in regular previews and
  notebooks. **Markdown math** depends on the separate **KaTeX library** addon;
  the pinned MIT asset (~274 KB) is downloaded and checked separately. Disabling
  it restores formula source. It supports KaTeX's math syntax, not arbitrary
  LaTeX documents or executable macros. Physical Android rendering is untested.
- Project trash/delete releases the idle notebook kernel and analysis processes
  before moving its working directory, avoiding Windows directory locks. Busy
  programs/cells still require an explicit stop.
- Open VSX details show an explicit Install action or an incompatibility reason.
  Mixed packages may import only supported snippets/workbench colors; their
  executable parts do not run. Existing VSIX addon 1.0.0/1.0.1 must be upgraded to 1.0.2
  to receive this frontend update. Full Extension Host compatibility is absent.

## Additional interaction and project safeguards

- File tabs keep their normal behavior on double click; the hidden shortcut that
  toggled focus mode was removed. The last file selection wins when reads finish
  out of order. The rail uses centered icons with hover descriptions in both modes.
- Nested popovers retain the triggering item's location, even if the previous
  menu is removed or a default toolbar anchor is hidden. Standalone popovers center.
- Each desktop profile has one application writer process. Project windows remain
  available inside that process. A project already being edited offers Close or
  Read only; the second window has its own session and rejects writes/execution.
- External changes update clean open files. Unsaved edits are retained with automatic
  saving paused until the user explicitly chooses the disk or local version.
  Observing a file does not advance the native overwrite-protection baseline.
- The RAM slider's finite maximum uses total physical RAM, not current free RAM.
  This is a capacity setting, not a guarantee that allocating all RAM will succeed.
- New extension installs belong to the application profile. Project requirements
  cannot override the version of an application-scoped addon such as VSIX.

## Editing and interface

- Ordinary Markdown newlines render as line breaks rather than being merged.
- More distinct green run/debug actions, blue installed-state accents and unified
  enabled field colors. Disabled controls retain a separate disabled state.
- Custom rounded scrollbar thumbs without system arrow buttons, including a
  matching Monaco scrollbar. Necessary scrolling remains available.
- The file search occupies a configurable percentage of the free header space.
  Tool selectors are optional; narrow layouts prioritize project/run controls.
- The previous notebook and workbench appearance is retained; additional notebook
  centering and frame redesign were reverted at the user's request. Changes are
  confined to requested colors, scrollbars, field consistency and layout fixes.
- Windows has an app-specific dark caption with native window controls.
- The saved UI language is injected before startup, and project profiles cannot
  override it. Russian and English are checked after a full reload.
- Notebook budgets show infinity at the right end of each slider. Numeric entry
  accepts `∞` or `inf`; zero remains an internal legacy representation. Available
  physical RAM and free disk capacity are queried from the host to size finite sliders.
  Existing enforcement remains: CPU quota on Windows, no universal GPU quota.
- `build` and `cmake-build-*` directories are hidden in the navigator by default.
  Show build folders reveals them with generated/hidden-row styling. Source
  folders are not renamed or hidden at the operating-system level.
- Desktop file creation/deletion is watched and refreshed after a short debounce;
  generated/dependency directory churn is filtered. Expanded directories and
  scrolling are retained. Android refreshes when visible and periodically.

## Extensions

- More catalog filters: state, category, publisher, API capability and sorting;
  query tokens include `@disabled`, `@category:`, `@publisher:`, `@capability:` and
  negative terms. Enabled, installed, downloadable and incompatible entries have
  distinct styling. Removable installed packages/tools have visible Uninstall.
  System-owned tools are managed by their system installer.
- Optional **VSIX and Open VSX** addon: desktop Open VSX search, categories/sorting, descriptions and Markdown README;
  downloads are bounded and checked against the registry SHA-256 before review.
  VSIX compatibility remains **partial: snippets and JSON workbench colors**.
  Unsupported executable extensions are described as unsupported rather than
  presented as working. Full VS Code Extension Host, TextMate, LSP/debug adapter
  compatibility and arbitrary VSCodeVim execution are unfinished.
- Microsoft's Visual Studio Marketplace is not used by this alternative product.
  See the [Microsoft FAQ](https://code.visualstudio.com/docs/supporting/faq) and
  [Eclipse Open VSX](https://projects.eclipse.org/projects/ecd.openvsx).
- Reviewed JS modules may request `extensions.full-access`. They can add document
  views, commands, editor providers/decorations, interface styles, events, hooks
  and access the raw app/editor/window manager and validated native operations.
  This is privileged code with the IDE's powers, not a restricted data addon or
  isolated VS Code extension host. The review states these powers explicitly.
  Native/DEX loading and full Node extension-host APIs are not implemented.
- Official **Vim** uses a separate pinned `monaco-vim`/CodeMirror MIT asset pack;
  disabling disposes its modes/listeners and restores the editor. Desktop source
  editors are supported; notebook textarea Vim mode is not implemented.
- Official **Function map** opens an editor tab for C/C++ and Python definitions
  and name-based links, with navigation back to source. It is a lexical aid,
  not a compiler-derived call graph or a cross-project semantic graph.

## Keymaps

Keyboard settings open as an editor tab with command search, recording, unbinding,
conflict detection and DevForge/CLion/VS Code/Android presets. IDE commands and
Monaco actions can be assigned, with context for build/debug commands. These are
presets for DevForge, not an emulation of every upstream IDE action. OS-reserved
keys and the Android keyboard's own layout shortcuts remain outside the IDE.
Notebook text editing, IME, selection and completion navigation keep their local
handling; a full recorder for every text-editing gesture/chord is unfinished.

## Verification boundaries

Machine-readable results accompany the release. Fixture tests do not modify the
user's projects. Physical Android/IME/Bluetooth and native Linux/macOS installer
checks are not covered. This alpha is intentionally published as a prerelease;
it does not replace the previous recommended release.

Extension cards show publisher icons and actual enabled/installed state. Settings
are accessible from cards and the main settings page. VSIX configuration schemas
are retained when importing supported packages; extensions without their own
schema use the existing IDE settings. Disable/uninstall reviews list requirements
and active reverse dependencies, with cancellation and unused-dependency cleanup.
Monaco Vim's downloaded implementation is represented by a library addon so its
requirements and removal participate in that dependency model.
