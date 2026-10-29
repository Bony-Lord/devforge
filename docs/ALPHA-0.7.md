# DevForge 0.7.0-alpha.2

Experimental prerelease, not a stable recommendation. Windows still uses Electron
and bundled Chromium. Android uses its system WebView. A later desktop-shell
migration must preserve the existing host protocol, projects and extension API;
WebView2/WebKitGTK/WKWebView are candidates. No memory or performance improvement
from a future shell is claimed without measurements.

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
  RAM/disk capacity is queried from the host and used to size finite sliders.
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
