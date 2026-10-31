# VSX in Windows alpha.6

VSIX / Open VSX support remains the removable `studio.vsix` addon. Its gallery,
commands and imported extensions are removed from the active composition together
when the user confirms disabling its dependents. Older official gallery packages
are migrated to 1.0.3. Native addons keep their existing interfaces.

## Implemented

- Real Open VSX search, icons, metadata, SHA-256 verification and VSIX inspection.
- Snippets and JSON interface colors. Imported themes do not change the UI until
  the user enables their theme setting. TextMate token colors are reported separately.
- Language identifiers, extensions, filenames and basic language configuration.
- One Node child process per application window for reviewed executable extensions;
  it exits when the last executable extension is disabled. No extra Node download.
- Commands; configuration defaults/get/update/change events; document open/change/
  close events; active editor, selection and editor edits; workspace files; output;
  diagnostic collections; completion, hover, definitions, references, symbols,
  formatting/range formatting, rename and signature providers; persistent mementos.
- Independent owner cleanup for commands, providers, diagnostics, subscriptions,
  timers and Node child processes created through the host's child_process module.
- Extension settings use the same schema in IDE settings and extension details.
  Disabled extensions stop contributing controls; saved values remain available.

## Conflict handling and review

Executable packages always require explicit third-party-code approval and separate
acceptance of partial VS Code compatibility. The inspection lists unsupported
contribution groups, observed unsupported API calls and possible overlap with active
native addons. Static inspection cannot discover every dynamic call.

Users choose to combine analysis or keep native analysis and extension commands.
Commands are namespaced in the command palette; diagnostics identify their source.
The native-analysis preference also suppresses imported snippets. Formatting
providers remain separate, named Monaco providers. An unsupported runtime API is
an error naming the API and extension, not a silent no-op. Failed activation rolls
back its registrations and the addon installation transaction.

Executable extensions require a trusted, editable project window. They are not
sandboxed from the user's files: Node extensions have the current user's process
permissions. Read-only windows can load declarative-only packages; Node packages remain inactive. Fresh uninstalled review bundles are retained for up to a day to
avoid invalidating another window's review; explicit cancellation and uninstall
remove unreferenced bundles. No install scripts are run during inspection.

## Still incomplete

This is not unrestricted VS Code compatibility. TextMate grammars, browser-only
extensions, extension packs/dependency acquisition, proposed APIs, debugger/task/
terminal/SCM/notebook/custom editor/webview/tree-view APIs, VS Code keybinding/when
clauses and most workbench services are not implemented. Basic language configuration
does not yet apply regex-based indentation rules. ESM extension loading and native
Node ABI compatibility are not guaranteed. Large archives have explicit limits:
64 MiB compressed, 256 MiB expanded, 32 MiB per file. Editor sync currently includes
open nonvirtual documents smaller than 2 MiB.

The compatibility inventory and error reporting are part of the product. A package
must not be presented as fully compatible merely because it installs or activates.

## Evidence

`desktop/tests/vscode-runtime.test.cjs` executes actual fixture VSIX modules in a
Node child, invokes commands/providers and verifies two-owner cleanup. The offscreen
`desktop/stability-regressions.cjs` checks installation consent, Monaco diagnostics,
hover, settings and disabling through the actual application. General UI tests run
with an isolated profile. The real Amerey markdown-snippets 1.0.11 archive was
downloaded from Open VSX, checksum-verified, and inspected (34 snippets and icon).
That public declarative check is not evidence that arbitrary executable extensions
work. No native-preview or cross-platform parity is claimed.
