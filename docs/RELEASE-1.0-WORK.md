# C++ Studio 1.0.0-rc.1

This is a release candidate, not a claim of complete CLion parity or store approval.

## Implemented and verified

- Modern Android target API 36, PackageManager-installed native tools and a separately launched host for generated programs. Ordinary source/CMake trees and project-root working directory.
- All 222 packaged ARM64 native images checked for 16 KB alignment. One rebuilt dependency and the host use NDK r28c. No writable-directory exec workaround.
- Android 16 x86_64 emulator: genuine GCC and Clang builds/runs, CMake/Ninja, Unicode project folders and project-root data access; GDB SIGSEGV stop, source selection and Node.value expansion; ASan use-after-free with allocation/free/read source lines; Debug vector bounds assertion with explanatory text; return 139 distinguished from a signal.
- Fresh installation from an AAB with install-time runtime-data asset pack extracted its data and compiled/ran the sample successfully.
- Windows: real GCC/GDB, CMake/Ninja in Unicode paths, stdin, code/encoding/BOM/history/file containment, sandboxed Monaco/Electron renderer, inline project creation, real debugger controls and runtime panel. Linux/macOS equivalents run in the desktop CI matrix.
- Settings categories, system/reduced motion, bounded frame-batched output, incremental tab updates, paged variable trees, desktop tool discovery/configuration, modern/desktop first-run setup, RU/EN additions.
- Native/copyleft notices and source bundles; Electron/Chromium full notices and a checksum-pinned corresponding FFmpeg/Electron-patch source archive for desktop.

Reproducible acceptance entry points: `tests/modern_emulator_acceptance.py` (owned emulator only), `desktop/smoke.cjs`, `desktop/tests`, and the source/desktop GitHub Actions workflows. Screenshots are real app-window captures; no OS bars, personal projects or fabricated output.

## Remaining limits

- No physical ARM64 device is currently connected. The modern ARM64 execution chain, physical IME/Bluetooth/touchpad behavior and OEM installer behavior need new physical-device acceptance. Prior 0.3.1 physical checks do not substitute for this.
- Google Play submission/review and the MANAGE_EXTERNAL_STORAGE declaration have not been completed. API 36 and 16 KB alignment alone do not establish acceptance.
- Modern APK bundles all native tools. Disable/enable does not reclaim APK space; optional native Play feature delivery is not implemented. Desktop uses system tools.
- Windows publisher signing and Apple notarization are not supplied. macOS uses an ad-hoc integrity signature.
- Sanitizers have overhead and supported-toolchain limits; Android leak detection is disabled. This is not proof that arbitrary user code is bug-free.
- Desktop CI is automated coverage, not manual testing of every desktop/keyboard/window manager. Check the exact candidate commit result before distribution.

Keep the published 0.3.1 artifacts unchanged. Private keys and generated tools/test fixtures stay outside Git.
