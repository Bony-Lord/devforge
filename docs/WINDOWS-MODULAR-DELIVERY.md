# Windows components and installer modes

The local 0.6.0-dev.3 build starts with the essentials selection. Detecting a
system compiler no longer selects every available native tool on first launch.
No sample project is created. Project templates and explicit addon selections
request their own dependencies.

| Component | Delivery on Windows |
|---|---|
| Editor, frontend adapters, Electron runtime | Core installer |
| GCC/Clang, CMake, debugger, Python interpreter | Separately installed system tools; paths selected in the IDE |
| Python completion: Jedi + parso | Optional verified download, 4,993,005 bytes |
| Python formatting/PEP 8 | Optional verified download, 92,155 bytes |
| Window engine: patched Dockview + license | Optional verified download, under 1 MB |

The Windows core excludes the Dockview implementation bundle. Selecting the
window-manager addon downloads its exact pinned files into the application data
cache; its script loads only when the windowed interface is requested. A failed
download leaves the editor usable in simple mode. Disabling the addon and removing
the component deletes cached payload files independently of projects. Android
still bundles this particular JavaScript engine in its APK.

The optional-assets catalog records immutable source URLs, sizes and SHA-256.
The local asset server serves only catalog-listed verified cache files. Python
tools use their separate pinned manifests and do not install into system Python.
Frontend adapters for many other features are still part of the core: complete
implementation delivery for every addon and an executable third-party SDK remain
unfinished. This is not a claim that the current core is an empty wrapper.

The offline NSIS installer includes the Electron runtime. Its size is mostly that
runtime, even after excluding optional tools and retaining only Russian/English
Chromium translations. Merely turning a feature off cannot remove those bytes.

The build also supports a small `nsis-web` bootstrap:

```sh
node desktop/installers.cjs --web --package-url=https://YOUR-HOST/EXACT-CORE-PACKAGE.nsis.7z
```

The URL must refer to the matching versioned core payload. Electron-builder checks
the payload's SHA-512 and also supports the exact payload file beside the setup.
The small bootstrap does not reduce the total Electron download on a new machine.
An unpublished development payload needs the accompanying local package; a
standalone online installer is usable only after hosting that exact package.
No development release is published automatically by these commands.

Core packaging rejects downloaded wheels, bytecode caches and signing keys.
Linux packaging no longer recommends all C/C++ tools as automatic apt additions;
language toolchains are selected separately. Linux/macOS installers need their
own platform verification.
