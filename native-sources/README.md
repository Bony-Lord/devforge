# Corresponding native sources

Full application sources and Gradle project: https://github.com/Bony-Lord/gcc-cpp-studio
This archive contains corresponding native component sources and recipes; the
application's Java/JavaScript sources and Gradle wrapper are in that repository.

This directory accompanies GCC-CPP-Studio-arm64.apk. Original GNU/copyleft source archives
are provided here, with SHA256 values and source URLs in sources.lock.json.
Full Termux and TUR recipe/build-system snapshots include downstream patches and
configuration. The NDK GCC 15 toolchain snapshot provides the compiler build route.
The original authors and licenses remain in ../licenses and in the archives.

Forge modifications: tools/prepare_runtime.py relocates equal-length app prefixes,
prunes optional tools/development files and adds a libc++ convenience header and a
system-shell symlink. The exact binary packages are in native-packages.lock.json.
Run `python tools/prepare_runtime.py --locked` to reproduce the runtime archive from
those exact original package checksums. No proprietary CLion/JetBrains source or
assets were copied. Java/JavaScript host code is available in ../app.

Build original toolchains using the included upstream build instructions/recipes
on a supported Linux build host; Forge's binary relocation is then applied by the
included script. LGPL libraries are dynamically linked; replacement/relinking is
possible by rebuilding the runtime. No technical restriction on modified builds.
