# Reproducing interaction regressions

0.6 beta adds real notebook mouse hover, pinned Ctrl+Q documentation, Escape,
active function parameter help, immediate invalidation of old cell diagnostics,
Python-file hover in the top overlay, text-only untrusted docstrings, settings
category/search navigation, and reachable controls at phone width. Icon inventory
tests catch silent fallback to generic file symbols. Cell execution smoke selects
the explicit run action rather than relying on its position among buttons.
The exact beta results are in `verification-design-beta.json`.
Temporary project ownership checks resolve real paths before comparing them:
Windows CI can redirect TEMP through a junction to another drive. The dedicated
fixture test covers such an alias and still rejects the fixture root and outside
projects. This preserves the guard around the trash/restore test.

The previous checks did not adequately cover complete user workflows. In
particular, a disabled Create button, project transitions and modal geometry
could pass checks that only inspected isolated controls. This local dev.4 update
adds reproducible Electron interactions to the source tree.

From the repository root, with Node 22 or newer:

```sh
npm ci --prefix desktop
npm run test:ui --prefix desktop
node --test tests/*.test.cjs
npm test --prefix desktop
python tests/python_kernel_test.py
python tests/python_style_test.py
```

Set `DEVFORGE_TEST_PYTHON` to a real Python executable for optional desktop Python
process tests. The interaction suite needs Python 3.10+, GCC, GDB/gdbserver,
CMake/Ninja and clangd installed on the test computer. Initial Python quality
component installation downloads pinned wheels. Tests use fresh temporary
projects and a separate app profile; they never remove or edit the user's projects.
The runner starts the existing Electron development runtime and closes only its
own process. It does not install or execute an unsigned DevForge launcher.

The actual UI suite is [desktop/ui-regressions.cjs](../desktop/ui-regressions.cjs).
Its machine-readable report is written to
`desktop/test-results/ui-regressions.json`, or `DEVFORGE_UI_REPORT`. To test an
already packaged application with the same runner:

```sh
node desktop/ui-regressions.cjs --app=/absolute/path/to/package/resources/app
```

Covered workflows include:

- Creating a project with one Create click, without mandatory Preview; empty-name rejection.
- Extensions as an ordinary document tab, its bounds and separate project/run/app icons.
- Opening console, terminal, problems and debugger in both interface modes.
- Opening code after clearing old editor panels without joining the explorer group.
- Keeping application extensions and window mode in a new notebook project.
- Touch hold opening the existing context menu; movement and a second finger cancelling it.
- Visible project actions, the exact folder in a trash confirmation, cancellation,
  removal from the list, moving the active project, an empty workspace after removal,
  and restoration with exact file bytes preserved.
- No renderer exceptions or console errors during these workflows.

The backend tests add independent checks for stale paths, protected folders,
registered child projects, busy execution, occupied restore destinations and
rollback after a simulated metadata-save failure. Real GCC/clangd tests parse
`bits/stdc++.h` and build/run `std::print` using both direct and CMake builds.
Navigation tests distinguish a cancelled initial local load from genuine load
failures and foreign navigation.

[The UI workflow](../.github/workflows/ui-regressions.yml) installs an explicit
test toolchain on Windows and uploads the report even on failure. Adding this
workflow does not mean a remote CI run has happened; this update remains local.

These checks do not prove that the IDE is stable or equivalent to CLion. Touch
events here are Chromium emulation, not a physical Android device. Native Sora
selection, system IME, real tablet gesture arbitration, Android external-storage
execution and Linux/macOS GUI installers still need platform tests. The current
build remains a development build. Results for the delivered payload are in
`verification-project-management-local.json`.


Local dev.5 extends the suite with marketplace search/details, direct Attach and
conflicting replacement, initial widths across notebook creation, real typed Jedi
completions, smart Python/notebook input, resource metadata, exact shortcut routing,
narrow-header geometry, lazy build folders, inherited hidden-folder color and
separate project windows. Window-store tests verify shared settings/extensions,
independent cold-restored sessions and the project archive after restart.

`desktop/tests/notebook-budget.test.cjs` checks cumulative execution and monitored
disk limits without deleting output. Kernel tests exercise real Windows memory/CPU
Job Object setup and recoverable MemoryError. `desktop/tests/python.test.cjs` checks
a real infinite-cell timeout and restart. Runtime download/install/probe/discovery/
remove is opt-in: `DEVFORGE_TEST_DOWNLOADS=1 node --test desktop/tests/python-runtimes.test.cjs`.
The local report records whether this network test actually ran.
