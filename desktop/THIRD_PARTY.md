# Desktop runtime notices

DevForge uses Electron (MIT), Chromium and its listed third-party components,
including the dynamically linked FFmpeg library under LGPL 2.1 or later.
Electron's LICENSE and complete LICENSES.chromium.html accompany the executable.
The UI's Monaco, Inter, JetBrains Mono, Lucide and YAML notices are available in
the application's license viewer; iconv-lite and safer-buffer licenses are also
included in the portable archive.

The matching FFmpeg sources, Electron patches, pinned build metadata and rebuild
instructions are in `DevForge-desktop-native-sources-44.9.1.zip`, distributed
beside the binary archives on the same GitHub release / CI artifact page.

No restriction is imposed on replacing LGPL libraries or reverse engineering for
debugging modifications to those libraries. DevForge does not claim ownership
of third-party components. System compilers/debuggers are installed separately.

Source and patches: https://github.com/Bony-Lord/devforge/releases
FFmpeg license information: https://ffmpeg.org/legal.html

Optional Python style tools (autopep8 2.3.2, pycodestyle 2.15.0, tomli 2.5.0) are
downloaded separately as verified wheels and retain their MIT licenses inside
the wheel archives. License copies accompany this package. The pinned download
manifest is in resources/app/python/style-manifest.json; no pip installation into
the user's interpreter is performed.

Optional Jedi 0.20.1/parso 0.8.7 are separate verified downloads, with all upstream notices retained in their wheels and installed cache. License copies accompany this core package. See resources/app/python/intelligence-manifest.json. The window engine is a separate pinned Dockview implementation plus its MIT notice; see resources/app/ui/addons/optional-assets.json.

Markdown-it 14.1.0 (MIT) renders notebook/document Markdown; json5 2.2.3 (MIT) parses declarative VSIX metadata. Their license files accompany the package. Build-only resedit 1.7.2 (MIT) sets DevForge PE icons; it is not loaded by the installed application.
