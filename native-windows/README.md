# DevForge Native — Windows preview

Development version `0.8.0-native.1`. Windows is the active target; other platforms
remain on the previous implementation until the native Windows version is ready.

The interface uses WPF, AvalonEdit, AvalonDock and Markdig. It contains no Chromium,
Electron or WebView. A single Node.js child serves all windows through private
standard-input/output pipes; it provides the existing project, tool and Python
services. Node.js includes V8 for JavaScript execution; it does not render the UI.

## Working foundation

- Native file tabs and split/docked/floating panels using one layout implementation.
- Project directories, inline rename, external file refresh and read-only project windows.
- CMake/GCC build/run, project-root working directory and editable run configurations.
- GDB step over/into/out, breakpoints, stack, expandable variables and runtime stops.
- Native notebook code/Markdown cells, persistent Python execution, `!`/`%` commands,
  editable JSON with a visible return to cells and per-notebook resource limits.
- Smart pairs/indentation, JSON/CMake syntax, native clangd integration, Jedi completion,
  formatting and configurable keyboard shortcuts with duplicate detection.
- Global addon installation and project attachment templates. Six CMake library
  attachments download pinned upstream sources only when the project is configured.

## Preview limitations

This is not a feature-complete or stable replacement for the old UI. Full VS Code
Extension Host APIs, all old addon UI adapters, full theme integration, Markdown
mathematics, rich notebook MIME renderers and complete English translation remain
unfinished. VSIX conversion currently covers declarative data only; executable
VS Code extensions are not run. Do not interpret an installed legacy addon as proof
that every feature already has a native UI adapter.

## Install and data

Use the Windows x64 Setup executable. Requires an installed .NET Desktop Runtime
8 or newer (x64). GCC, CMake, Python, clangd and optional libraries are not bundled.
The preview installs as **DevForge Native Preview**, alongside the previous DevForge.
Its settings are in `%APPDATA%/DevForge.Native`. First launch imports only project
references and basic preferences from the old version; it creates no demo project
and does not copy, delete or move existing projects. Project references are shared
paths: do not edit the same project in both the old and native app simultaneously.
Read-only conflict detection currently covers windows of the same native process.

## Build, package and verify

```
dotnet restore native-windows/DevForge.Windows.csproj --locked-mode
dotnet build native-windows/DevForge.Windows.csproj --no-restore
node --test native-windows/backend.test.cjs
```

Set `DEVFORGE_NATIVE_RUNTIME=1` for real local Python/CMake/GDB smoke tests. Network
library delivery is separately opt-in with `DEVFORGE_NATIVE_NETWORK=1`.
Run the native executable with `--self-test --isolated --data-dir=<fresh-directory>
--test-results=<directory>` for WPF interaction checks. Test data must be isolated.
Add `--with-toolchain` to include actual clangd diagnostics and clang-format checks.
UI tests run on a private Windows desktop, never switching the user's desktop.
Failures write a report and exit rather than opening a dialog. `verify-installer.ps1`
checks a fresh installation (including paths containing spaces), installed file
hashes, native interactions, an intentional failure exit and safe uninstallation.

`node native-windows/package.cjs` creates the Windows installer. Set
`DEVFORGE_NODE_EXE` to a Node executable matching `runtime.json`, and optionally
`DEVFORGE_MAKENSIS` to an NSIS compiler. Packaging checks the official Node checksum,
keeps compiler/interpreter downloads out, excludes browser assets and includes
third-party license notices. The uninstaller removes only listed application files;
projects and profile data are retained.
