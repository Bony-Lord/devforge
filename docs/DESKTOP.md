# C++ Studio desktop

Windows, Linux and macOS share the Android application's project UI and language features. Desktop uses the real Monaco editor, ordinary filesystem folders and installed native development tools. No Android toolchain is copied into the desktop distribution.

| Platform | Compiler and project tools | Analysis / formatting | Debugger |
|---|---|---|---|
| Windows x64 | MSYS2 MINGW64/UCRT64 GCC or LLVM Clang, CMake, Ninja | clangd, clang-format | GDB + gdbserver |
| Linux x64 | GCC or Clang, CMake, Ninja / Make | clangd, clang-format | GDB + gdbserver, or LLDB DAP |
| macOS | Xcode Command Line Tools or Homebrew Clang/GCC, CMake, Ninja | Homebrew LLVM clangd / clang-format | LLDB DAP |

Paths are discovered from PATH and common installation folders. Settings → Tools lets you select exact executables. Apple `/usr/bin/gcc` aliases are identified as Clang. Missing capabilities are shown explicitly rather than silently simulated. GDB runs through a loopback-only server with separate program stdin/stdout; LLDB uses DAP and a private piped terminal. System tool removal belongs to the system package manager; the IDE can disable tools.

Projects stay in their existing folders. Saves preserve the selected encoding/BOM, keep bounded history, and reject stale writes when another application changes the file. File operations resolve symlinks before checking project containment. CMake builds use a cache outside the source folder and execute from the project root.

The Electron renderer has Node integration disabled, context isolation and sandboxing enabled. An isolated preload exposes a bounded request bridge; the main process validates its sender. The local asset server serves only bundled UI files using an unpredictable local URL. External navigation, subframes and webviews are blocked. See [Electron's security guide](https://www.electronjs.org/docs/latest/tutorial/security/).

## Development and packaging

```sh
cd desktop
npm ci
npm test
npm start
npm run package
```

Portable archives retain Electron/Chromium notices and JavaScript dependency licenses. CI exercises all three desktop operating systems. Check the **actual CI result for the candidate commit** before treating a platform as verified. Windows publisher signing and Apple notarization are not provided by a local/CI build; macOS packaging uses an ad-hoc signature for bundle integrity.

An application-level renderer smoke test is available with `--smoke --data-dir=PATH`. It uses a fresh project/data folder, remains hidden, and records checks and app-only screenshots. It does not replace physical keyboard, touchpad, accessibility or Android IME testing.
