# Release 1.0 work

Work in progress, not a stable-release claim. Branch: `codex/release-1.0`.

Accepted scope: a polished, usable Android release, modern target SDK, Windows/Linux/macOS support, responsive and uncluttered UI, system integration, and runtime-error diagnostics (at least Debug).

The user currently has no Android device connected and explicitly chose to continue without one. Do not imply new physical-device validation. Keep 0.3.1 published artifacts unchanged.

## Architecture being implemented

- Android modern flavor: API 36, tools in PackageManager's read-only native-library directory, data separately extracted. Generated user code is a shared object loaded by a separate packaged native host, never execve'd from writable storage. This needs device/emulator proof; raising the target alone is not acceptance.
- Compat flavor: API 28, only for regression/rollback. App ID/signing key remain compatible.
- NDK r28c and SDK 36 installed in the existing local SDK. The pinned runtime has 222 ARM64 native images; one 4 KB library (`libandroid-spawn`) is rebuilt from the exact Termux recipe snapshot. Others already support 16 KB.
- Desktop: Electron with sandbox/context isolation and an explicit IPC host, real Monaco renderer, local system GCC/Clang/CMake/GDB, ordinary project roots. Windows can be tested locally with MSYS2 GCC 14.2/GDB; Linux/macOS need CI and appropriate debugger capabilities.
- Runtime diagnostics: library assertions in Debug, ASan/UBSan where genuinely supported, structured signal reports, clickable stack/locations, GDB stop on crashes; do not silently claim unsupported GCC sanitizer features.

## Remaining acceptance

1. Finish modern host run/debug/packaging, validate ELF entry/dynamic exports and native page alignment; test a real compiler/program chain. Add install-time data asset pack for Play AAB size if required.
2. Finish desktop host/editor adapter, run compile/CMake/stdio/GDB/LSP/filesystem/encoding tests and package Windows. Build/test Linux/macOS in CI.
3. Finish runtime fault UI, sanitizer settings and real fault scenarios.
4. Polish settings/navigation/animation without reintroducing native viewport jumps. Respect reduced motion.
5. Update licenses, build/release documentation and reproducible packaging; verify sources/assets/signatures and exact-commit CI before publishing candidates. Store approval/signing/notarization remain separately verified states.

Private signing key stays in workspace `work/build/forge-development.jks`, never Git. Do not change memory files. Prior devices and original-project preferences were restored at the end of 0.3.1.
