# Code OSS extension runtime — Windows alpha.10

Windows alpha.10 uses this runtime by default (`--legacy-editor` is a diagnostic fallback). It replaces the handwritten VS Code API subset with the actual
Code OSS services and VSCodium Node Extension Host. Dockview remains DevForge's
window engine; source files and extension views share its documents and models.
`studio.vsix` still supplies the removable gallery/import workflow. Existing native
addons can use the actual VS Code API through `api.vscode` as well as DevForge's
additional UI, host, lifecycle and contribution APIs.

## Runtime and installation

- Client: CodinGame monaco-vscode-api 38.1.3, VS Code API 1.142.0.
- Node host: VSCodium REH 1.143.17232, commit c072cf642cbbadabefa22f39c58cc902a8b7427f.
- These are different upstream revisions. The tested protocol paths work; the
  newer host does not turn the client into a 1.143 API implementation.
- Original VSIX manifests, JavaScript/ESM, binaries, resources and licenses remain
  intact. The DevForge package is a lifecycle/settings envelope.
- Platform-specific registry packages, streamed checksum-verified downloads,
  cancellation, streamed ZIP/ZIP64 extraction and disk-space checks replace the
  old fixed package/file size caps. Path traversal, junction and CRC checks stay.
- Required extension dependencies are prepared transitively. Extension packs show
  a member checklist; selected members become independent installed roots.
- The gallery offers versions and reports an incompatible `engines.vscode` range
  explicitly, so users can choose an older compatible version.

## Upstream services connected

Node and browser worker hosts; TextMate grammars and semantic tokens; language
configuration; commands and keybindings/when clauses; editor/document providers;
workspace filesystem; settings and mementos; Windows-encrypted secret storage;
authentication callbacks; webviews, tree views and custom editors; terminals,
tasks, debugger, test controller, SCM, search, notebooks, output, comments and
additional workbench services. Extension UI mounts in DevForge documents; opening
it preserves previous tabs. Closing its tab parks the upstream part for reopening.

This list describes connected services, not a universal compatibility certificate.
Executable code requires a trusted, editable workspace. Read-only windows keep
safe declarative resources and block writes through both file-service and direct
provider paths. Disabling an extension restarts only the affected upstream host
kind and removes its commands, diagnostics and providers; native API registrations
in the local host survive. Project trash/delete releases tasks and terminals first.

## Alpha.10 native file, save and workspace lifecycle

Native creation (including generated/template files), folder creation, file import,
rename, batch copy/move, project trash and restoration now run the actual Code OSS
working-copy file participants around the native commit. Extensions receive the
real will/did create, rename and delete events and can contribute WorkspaceEdits.
The native backend still owns encoding, path/junction checks, trash and rollback;
paths and read-only state are checked again after participation. Closing the owning
window rejects outstanding operations. Internal cleanup and trash emptying do not
pretend to be user file operations.

Edits from onWillRenameFiles move with the dirty working copy into its destination.
Pending native saves are suspended for the source, so the old path is not recreated.
WorkspaceEdits initiated by an extension also update native tabs, breakpoints and
encoding metadata; synthetic native events are identified to avoid duplicate work.
Native Save and TextDocument.save run the genuine save participants and didSave
state changes, then commit through DevForge's writer with history, original encoding
and external-edit conflict checks. Automatic saves report the Auto reason. Errors
use upstream save-error handling and propagate to native callers without retrying
through an unguarded filesystem path. Delayed DI bound-method caches are evicted
before replacing the writer and guarded IFileService methods.

vscode.openFolder and vscode.newWindow use native project windows. In-place project
changes keep the hosting page alive instead of asking the browser lifecycle to shut
it down. Existing editing conflicts use the usual read-only choice. Explicit empty
windows do not restore a former project. Each window retains separate per-project
source-tab sessions when switching away and back. showTextDocument preserveFocus
keeps focus on the previous native control. Accepted upstream disk reloads update
the native saved state and refresh its external-edit baseline.

Evidence: work/vsx-alpha10-20261101. The real fixture VSIX checks file event ordering
against actual disk existence, participant edits and exact file bytes, both save
entry points/history/conflicts, explicit versus automatic save reasons, native
windows and returning project sessions. This does not certify multi-root workspace
files, all extension-managed installation flows or the remaining revision/API/ABI
limits below. Multi-root opening reports a direct error instead of a silent refusal. All native
window HTTP listeners reject Chromium-restricted ephemeral ports before loading
the page; an actual ERR_UNSAFE_PORT failure at 6566 exposed this on a customized
Windows ephemeral range. The browser policy is preserved.

## Alpha.9 editor and lifecycle integration

Ordinary file opening now uses the upstream editor resolver before reading text.
Contributed custom editors and notebooks, user editor associations, virtual URI
schemes, untitled documents, diff/merge inputs and explicit editor choices retain
upstream resolution. `showTextDocument` respects EXCLUSIVE_ONLY and opens ordinary
sources in native Dockview tabs even when a custom editor is visible. Temporary
fallback model references are released; native documents keep their own reference.
Side-by-side extension documents use real upstream editor groups and the configured
split direction.

Native focus changes no longer reveal the previous extension editor. Dockview tab
focus targets the embedded editor instead of its hidden placeholder. Hidden panel
contents use content-visibility and inert: descendants that set visibility:visible
cannot paint over or intercept the selected source, and reopening retains their
models. Extension editor snapshots and visibility events exclude hidden editors,
native view placeholders and inactive notebook widgets. The notebook performance
timer handles its own cancellation without hiding
unrelated errors.

Engine validation uses the client API, including locally imported bundles and old
cached reports. Unsupported versions can be stored without enabling; reviews state
the required version. Registration is verified in the actual extension service;
a skipped registration is rolled back instead of counted as enabled. This does
not remove the client/server revision difference documented above.

Evidence: `work/vsx-alpha9-20261101`. Real integrated checks include custom editor,
notebook cells, virtual query-preserving and untitled documents, real side groups,
Node active-editor state, source opening from extensions, actual diff controls,
hidden-panel hit testing and reopening. The preceding runtime and public-extension
checks remain separate from a universal compatibility claim.

## Alpha.8 repairs and additional verification

Installation/enable/disable reviews have independent document layout. Marketplace
styles no longer hide their text or clip their controls. Long source URLs and
checksums wrap in expandable details; repeated permission notices are removed.
Geometry is checked at 390, 720, 900 and 1360 pixels. Package publishers are retained.

Settings writes are serialized, resetting removes prior user overrides, and changes
made by extension APIs synchronize back to DevForge. Structured/nullable settings
and JSON schema composition fields are preserved. Old partial-runtime metadata
cannot disable the Install button in the upstream runtime.

The worker host has its upstream network policy on its own entry/iframe responses;
the main editor policy remains restricted. HTTPS/WSS and loopback network requests
are available to browser extensions under normal browser CORS rules. The VS Code
clipboard service uses Electron's Windows clipboard instead of browser permissions.
TextMate state diffs initialize synchronously so first worker replies cannot race.
When upstream auto-reload and disk already agree, native file refresh accepts those
bytes as saved instead of reporting a false edit conflict.

`work/vsx-alpha8-20261101` adds checks of the actual public Pyrefly 1.4.0 Windows
server (type errors in strict mode, hover, live settings, reset, API changes and
unload), native clipboard save/restore, worker networking, virtual filesystem
providers, SCM resources and completed test runs. A three-window scenario checks
one shared agent, independent workspaces, read-only execution suppression and
global disable/re-enable without closing sibling source documents.

## Verification and limits

Evidence is under `work/explorer-vsx-20261031`. The direct runtime matrix exercises
real file writes, providers, terminal and ProcessExecution output files, an inline
DAP adapter, a notebook serializer, scripted webview messages, worker activation,
unload, mementos/secrets across application exit/relaunch and read-only protection.
The integrated matrix exercises actual manager installation/settings/unload plus
Dockview webviews, tree views and custom file editors. Public VSCodeVim 1.32.4
edits the visible model and Red Hat YAML 2.1.2026102308 runs its language server and
publishes a real duplicate-key diagnostic in the shared Problems pane.

Unverified: arbitrary public extensions, proprietary account/service requirements,
proposed/private APIs, all native Node ABI combinations, every authentication
provider and every SCM/notebook contribution. Public Vim's first-run missing
`.registers` file rejection is an upstream extension error retained in the evidence;
its editing test passes. A forced process kill immediately after the first secret
save can precede Chromium's encryption-key persistence; a normal full app exit
and relaunch is tested. Do not claim that every VSX extension is guaranteed to work.
No native-preview or cross-platform parity is claimed.

---

## Previous alpha.6 runtime (legacy diagnostic mode)

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
