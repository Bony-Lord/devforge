# Development storage policy

The working checkout contains sources and small verification receipts. Keep signing
keys, user settings/projects, private backups and corresponding third-party sources.
Do not copy the entire work tree or user profiles into a public release.

- `node desktop/package.cjs` prepares the current unpacked application for an
  installer. It does not also create a portable ZIP. Request one explicitly with
  `node desktop/package.cjs --portable` when it is actually needed.
- Keep the current validated installer/package and one rollback release. Retain
  source history and release manifests instead of a full Electron copy per trial.
- Extract installer checks into an owned temporary directory, compare every file,
  save the receipt and remove the extracted payload after a successful check.
- GUI and interpreter fixtures belong to fresh isolated directories. Keep their
  reports/screenshots outside the fixture and remove the fixture after completion.
- Android emulator definitions are small. Test disks and snapshots are disposable;
  preserve definitions, reset test data when it is no longer needed, and avoid
  cloning 10 GB disks for each scenario. Never use personal device data as a fixture.
- Android intermediate build files can be regenerated. Preserve final APKs,
  signatures, lint/JVM reports and test results when reclaiming those intermediates.
- Do not follow junctions during cleanup. This computer's former SDK/JDK path on
  C: points to the actual installation on D:; this is one installation, not a
  redundant backup. Do not erase its contents through either spelling.

`tools/clean-build-artifacts.ps1` previews selected regenerable folders. `-Apply`
removes only those selected paths after checking containment, tracked files,
links and running executables. Add `-IncludeAndroidIntermediates` only when the
next Android build may regenerate its intermediate files.
