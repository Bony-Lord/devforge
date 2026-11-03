# DevForge 0.7.0-alpha.22

Windows Debug and Release retain their separate application profiles.

## Changes

- Optional Google Translate addon: selected text, local window/region capture preview,
  explicit image submission to the Google Translate website without a key, and a
  manual upload fallback. Cloud Translation is optional and requires a key.
- Application language settings discover the addon from its manifest. The addon
  labels its output as machine translation that may be inaccurate. Automatic UI
  label translation uses Cloud API; source editors and file contents are excluded.
  Keys use Windows encrypted storage. Disabling removes commands, observers,
  translated labels, capture files and translator windows, and cancels requests.
- VSX glyph sizing affects glyphs rather than text action labels. Action rows and
  native component/gallery headers fit narrow panels. Status bar layout follows
  its actual host. Setup explicitly re-enables the selected pack components.
- Public VSIX package downloads publish received/total bytes without buffering
  response bodies. Shared feedback displays size and determinate/indeterminate bars.
- Windows startup shows a staged loading shell until Dockview exists, avoiding the
  legacy layout flash. The mandatory Windows window manager remains the only mode.
- Webview document canvases use the active workbench palette. The preload CSP hash
  is regenerated after source changes. Notebook preloads serialize their original
  source before bundling, avoiding parent-realm helper references.
- Same-group `showTextDocument({preserveFocus:true})` reveals the requested native
  tab while retaining keyboard focus. A preceding auto-save cannot satisfy Save All
  while a newer notebook model revision is still dirty.
- VSX sidebar contributions repaint on installation, removal and runtime changes.

## Finder changes and review

Findings are grouped across roots/runs. Stable identities retain failure causes
and handler names while ignoring volatile stack line numbers, loopback origins and
run identifiers. Different handlers remain separate. Geometry changes for one
clipped control count as repeat observations. Counts are summed across workers;
original evidence, replays and review annotations remain available.

Snapshotting ignores atomic-write temporary files and tolerates a source file
disappearing during capture. The visual inspector distinguishes scroll axes,
virtual-list clipping and floating-window occlusion, and records clipping ancestors.
The CDP harness releases failed connection attempts and reconnects before injection.

The historical review grouped 97 cases into 66 executable replays. Initial results:
83 not reproduced, 8 reproduced, 4 incomplete, 2 requiring manual review. These are
triage results, **not 83 proven fixes**. Follow-up checks fixed native focus handling,
webview/notebook initialization, sidebar test assumptions and test fixture settings
that had overwritten the configured clangd path. Private evidence and per-case
notes are retained under `work/finder-review-queue-alpha22.json` and finder reports.
Resource-limit reports and remaining visual candidates retain explicit review notes.

## Verification

- Node tests: 213 pass, 8 skip, no failures (221 total).
- Genuine packaged Windows editor/window checks: 32/32, including contributed notebook.
- Genuine VSX/native file-operation matrix: 30/30.
- C++ analysis and workbench integration: 21/21.
- Native UI/scale/overlay/optional-install integration: 17/17.
- Debug/Release isolation and diagnostics: 18/18.
- Translator/pack activation lifecycle: 8/8. No user content was sent to Google.
- Startup/relaunch/cache checks: 18/18; recorded times under concurrent test load
  are not a clean performance comparison with earlier releases.

Live Google image upload depends on the website and was not end-to-end verified.
Cloud API request behavior was checked with a bounded test transport; no real key
or billable request was used. Arbitrary VSX extension compatibility and the absence
of all visual defects are not claimed.
