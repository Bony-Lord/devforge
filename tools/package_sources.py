"""Package verified corresponding native sources for distribution beside the APK."""
import argparse, hashlib, json, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=pathlib.Path)
    args = parser.parse_args()
    lock = json.loads((ROOT / 'native-sources/sources.lock.json').read_text(encoding='utf-8'))
    for entry in lock['archives'] + lock['recipes']:
        path = ROOT / entry['file'].replace('\\', '/')
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise RuntimeError('Source checksum failed: ' + str(path))
    paths = list((ROOT / 'native-sources').rglob('*')) + list((ROOT / 'licenses').rglob('*'))
    paths += [ROOT / p for p in ['LICENSE', 'THIRD_PARTY.md', 'native-packages.lock.json',
              'docs/BUILDING.md', 'docs/MODULAR-RUNTIME-0.5.md', 'tools/prepare_runtime.py', 'tools/prepare_sources.py', 'tools/package_notices.py', 'app/src/main/assets/tool-packs.json',
              'tools/package_sources.py', 'tools/split_runtime.py', 'tools/extract_package_notices.py', 'tools/check_licenses.py', 'docs/LICENSE-AUDIT.md', 'docs/PRIVACY.md', 'native/forge-pty.c', 'native/studio-runner.c', 'tools/prepare_modern_runtime.py', 'tools/prepare_component_runtime.py']]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(set(p for p in paths if p.is_file())):
            # Source tarballs are already compressed; retain their original bytes.
            method = zipfile.ZIP_STORED if path.suffix in ['.gz', '.xz', '.zip'] else zipfile.ZIP_DEFLATED
            archive.write(path, path.relative_to(ROOT).as_posix(), compress_type=method)
    print(json.dumps({'file': str(args.output), 'bytes': args.output.stat().st_size,
                      'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}, indent=2))

if __name__ == '__main__':
    main()
