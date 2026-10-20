# Desktop runtime notices

C++ Studio uses Electron (MIT), Chromium and its listed third-party components,
including the dynamically linked FFmpeg library under LGPL 2.1 or later.
Electron's LICENSE and complete LICENSES.chromium.html accompany the executable.
The UI's Monaco, Inter, JetBrains Mono, Lucide and YAML notices are available in
the application's license viewer; iconv-lite and safer-buffer licenses are also
included in the portable archive.

The matching FFmpeg sources, Electron patches, pinned build metadata and rebuild
instructions are in `Cpp-Studio-desktop-native-sources-44.9.1.zip`, distributed
beside the binary archives on the same GitHub release / CI artifact page.

No restriction is imposed on replacing LGPL libraries or reverse engineering for
debugging modifications to those libraries. C++ Studio does not claim ownership
of third-party components. System compilers/debuggers are installed separately.

Source and patches: https://github.com/Bony-Lord/gcc-cpp-studio/releases
FFmpeg license information: https://ffmpeg.org/legal.html
