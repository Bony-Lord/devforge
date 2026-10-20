# Modern Android runtime

The `modern` build targets API 36 and requires Android 9 or newer. The `compat` build retains target 28 for regression/rollback; it is not the store build.

Raising targetSdk alone would break a compiler IDE: Android 10+ prevents an app targeting API 29+ from executing writable app-home binaries. C++ Studio therefore installs its tool executables through PackageManager, in the APK's read-only native-library directory. The original compiler paths are links to those installed files. GCC gets explicit executable/search prefixes, and Clang gets explicit resource, header and linker paths.

User code is built as a position-independent shared program. A small, separately launched, packaged native host loads it with `dlopen` and calls its exported `main`. The program's working directory is the **project root**. CMake's executable-link rule is adapted in the IDE's generated cache; the project's source tree and CMakeLists.txt remain ordinary files. OS-specific libraries and prebuilt desktop binaries still require an Android port/rebuild.

The normal host monitors a child process and reports genuine fatal signals separately from exit codes. GDB uses the host's `--direct` mode, pending breakpoints and the shared program's symbols. Tool commands also run under a process monitor so Stop can terminate their descendants.

All 222 ARM64 runtime ELF images are checked for 16 KB segment alignment. `libandroid-spawn` is rebuilt from the checksum-pinned Termux recipe using NDK r28c. Runtime source timestamps are preserved: otherwise Guile rejects its compiled modules and GDB startup becomes very slow. Native source archives and license notices accompany distribution; see [THIRD_PARTY.md](../THIRD_PARTY.md).

## APK and store bundle

The direct-install modern APK contains its native tools. These can be **enabled/disabled**, which does not shrink the APK. This avoids a native-code downloader in the modern build. The compatibility build keeps the older removable/downloadable tool-pack workflow.

For the AAB, runtime data is an install-time asset pack. Use `-PstudioBundle=true`; direct APK builds include the same data directly. This separates data from the base module without making the compiler depend on a network connection at first launch. Store acceptance, the broad-storage permission declaration and Play Protect review are separate checks; a successful local build does not establish approval.

```powershell
python tools/prepare_modern_runtime.py --input path/to/runtime-full.zip --ndk path/to/ndk/28.2.13676358
./build.ps1 -Release
./build.ps1 -Release -Bundle
```

Do not publish a `--verification-4k` x86_64 fixture. That option exists solely for API 36 emulator testing; the distributable runtime is ARM64 and passes the 16 KB checks.

References: [Android 10 execution restrictions](https://developer.android.com/about/versions/10/behavior-changes-10), [NDK ABI/native-library installation](https://developer.android.com/ndk/guides/abis), [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes), [install-time asset packs](https://developer.android.com/guide/playcore/asset-delivery/integrate-java), [Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk).
