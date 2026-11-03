# DevForge 0.7.0-beta.1 — Windows

## Behavior

- Empty workspaces do not prompt for trust. Execution without a project returns
  `WORKSPACE_NOT_OPEN`, and a stale trust dialog cannot trust a different project.
- VSX search actions use their own flex space; native header buttons retain their
  size and remain inside the sidebar at 65%, 80%, 100% and 125% UI scale.
- Empty explorer space has a root context menu, including create/paste/refresh,
  project trash and project settings. It does not reuse a selected file's destructive
  actions. Encoding conversion is unavailable for binary documents such as PDF;
  text read-only states explain why conversion cannot save.
- Embedded browser pages have an independent `embeddedBrowserTheme` setting,
  dark by default. Explicit white backgrounds and black text are adapted together.
  The document's original inline colors are restored when switching modes.
- Download identities include gallery operation IDs. Completion/cancellation
  messages without byte fields finish the same row; completed rows expire.
  The agent recognizes both Open VSX `/api/.../*.vsix` and `/vscode/asset/.../VSIXPackage`
  downloads and their redirects. HTTP and Undici bytes are observed without copying
  or reading ahead of the consumer. HEAD metadata requests do not show downloads.
- Opening an IDE pack resolves metadata and HEAD sizes only. Downloading its VSX
  dependencies requires a separate explicit action. Stock gallery installs show
  their package size and confirmation before the installer starts fetching bytes.

## Google Translate 1.1.0

The optional addon replaces the earlier website-opening behavior with in-app text
results. Keyless mode calls Google's web-client endpoint; it is not the supported
Cloud API and Google may rate-limit or change it. Errors are surfaced, not bypassed.
Cloud Translation Basic v2 remains optional. Its key uses Windows encrypted storage.
The addon contains a four-step setup guide and links to project creation, billing,
API enablement, credentials, quotas, prices and Google's documentation.

Interface translation covers visible app/extension UI and embedded webviews.
It updates new labels while enabled and restores original text/attributes on stop.
Source editors, file content, paths and code blocks are excluded from automatic
translation. Machine translation is marked and can be inaccurate.

Ctrl+Alt+T (configurable, only while the addon is enabled) opens screen-region
selection. The frameless translation window is movable/resizable; refresh translates
again, Live refreshes at most every two seconds, Esc closes it. Windows OCR runs
locally with existing language packs, and only recognized text is sent to Google.
The overlay is excluded from capture using Electron's Windows content protection.
The region must fit inside one monitor. Unloading closes windows, aborts requests,
unregisters its shortcut and removes owned captures. No OCR models are downloaded.

## Tools and runtimes

A separate tab is reachable from DevForge tools and IDE packs. It offers the pinned
portable Python versions plus version selection for standalone clangd, LLVM/Clang,
WinLibs GCC, CMake, Ninja, Git, Node.js, Rust, Go and Java. Windows package metadata
comes from winget; where available, a HEAD request obtains installer size. The actual
installer runs only after selecting a version and pressing Download and install.
VSX install confirmations link relevant extensions to that tab. These are optional
tool suggestions, not mandatory addon dependencies.

## Verification

- Full existing unit run: 215 passed, 8 skipped (223 total). Follow-up targeted
  tests include empty-workspace trust, keyless text/cache, OCR geometry, encrypted
  Cloud keys/cancellation, metadata-only dependency planning, both download paths
  and CSP/theme patch behavior.
- Real packaged translator/UI suite: 18/18, including whole-app label/tooltip
  translation and restoration, tools tab, download cleanup, empty workspace and PDF.
- Real stock VSX package: size before confirmation, cancel without installation,
  confirmed install, streamed byte counts and completed-row cleanup all passed.
- Packaged UI integration: 16/16, including four zoom levels, webview positioning,
  Project/Extensions switching and reload. Real C++/extension workbench: 21/21.
- Separate Electron fixture: real Windows OCR of generated text, isolated overlay
  IPC/placement, Live toggle and disposal passed. Network translation was mocked
  in UI tests; the keyless endpoint was separately checked with a synthetic phrase.
- Independent browser palette fixture verified white/black input becomes readable
  dark colors, and switching back restores the light document.
- winget metadata/version/HEAD checks for LLVM, GCC and Node succeeded; standalone
  clangd's version list was verified. Third-party tool installers were not executed
  during testing. No personal screenshot or real project text was sent to Google.

Physical multi-monitor/DPI screen capture and long-running Live use still need
manual verification. Cloud requests use mock tests; no real key or paid API was used.
No new hour-long finder fleet was started; the user's earlier stopped runs stay stopped.
Private logs, test profiles and screenshots remain outside Git.
