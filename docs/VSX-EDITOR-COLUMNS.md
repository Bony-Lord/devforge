# VSX editor groups on Windows

Native source files use Dockview groups. A standalone Monaco editor represents a
tab, so its position in the upstream standalone-editor list is not a ViewColumn.
Requested columns are carried through editor resolution before either owner
allocates groups. Native files resolve against Dockview's serialized grid order;
virtual/custom/notebook/diff inputs retain the genuine Code OSS editor service.

The native path supports explicit columns One through Nine, Active and Beside for
`window.showTextDocument`, `TextEditor.show`, `vscode.open` and
`vscode.openWith(..., 'default', ...)`. Existing models can have separate views in
different groups. Reopening a target reuses its tab, and `preserveFocus` returns the
requested editor while keeping the previous pane focused. Layout and visibility
changes refresh the column information sent to extensions.

Run from the repository root using the existing cached desktop dependencies:

```powershell
node desktop/compat/prepare.cjs
node desktop/view-column-regressions.cjs
node desktop/stability-regressions.cjs --codeoss --codeoss-host-only --offline-gallery
node --test desktop/tests/codeoss-editor-routing.test.cjs
```

The column harness creates its own temporary project and VSIX, launches an
isolated app, and closes only that app. It writes JSON and a screenshot to
`work/view-columns/`; `DEVFORGE_COLUMN_REPORT` overrides the JSON destination.
`--app=C:\path\DevForge.exe` targets a packaged build instead of the source app.
The fixture profile is retained at the path recorded in the report. Budget for
roughly 65 MiB per invocation when keeping these diagnostic profiles.

The 19 column checks exercise explicit and implicit targeting, independent views,
focus and selection, command variants, layout moves, closing/renumbering groups,
empty-editor reuse and intervening empty columns. The separate 26-check lifecycle
suite covers commands, hover, diagnostics, configuration, webviews, custom
editors, virtual documents, notebooks, diffs and unloading.

This is not a claim that every VSX extension works. Mixed native and embedded
workbench layouts still have separate group owners; workspace-file/multi-root
integration, differing client/server API versions, extension-managed installation,
proposed/private APIs and native dependencies require further compatibility work.
Never replace an installed build while an unattended test owns its processes.
