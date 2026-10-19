"""Build a relocatable, offline Android C/C++ toolchain from checksum-verified debs.

Original Termux prefix is rewritten to our equal-length package ID. No emulator,
root, cloud compiler, or Termux installation is required.
"""
import argparse, concurrent.futures, gzip, hashlib, io, json, lzma, os, re, tarfile, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parents[1] / 'work' / 'packages'
MAIN = 'https://packages.termux.dev/apt/termux-main/'
TUR = 'https://tur.kcubeterm.com/'
OLD = b'/data/data/com.termux'
NEW = b'/data/data/com.forgex'
assert len(OLD) == len(NEW)

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 ForgeIDE', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def index(base, suite, arch, name):
    p = CACHE / f'{name}-{arch}.txt'
    if not p.exists():
        errors = []
        urls = [f'{base}dists/{suite}/binary-{arch}/Packages']
        if name == 'tur':
            urls += [f'https://raw.githubusercontent.com/termux-user-repository/dists/master/dists/{suite}/binary-{arch}/Packages',
                     f'https://raw.githubusercontent.com/termux-user-repository/dists/main/dists/{suite}/binary-{arch}/Packages',
                     f'https://tur.kcubeterm.com/dists/{suite}/binary-{arch}/Packages.gz']
        for url in urls:
            try:
                b = fetch(url)
                if b[:2] == b'\x1f\x8b': b = gzip.decompress(b)
                p.write_bytes(b)
                break
            except Exception as e: errors.append(str(e))
        else: raise RuntimeError(f'Cannot fetch {name}: {errors}')
    result = {}
    for block in p.read_text(encoding='utf-8').split('\n\n'):
        fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
        if 'Package' in fields:
            fields['Base'] = base
            result[fields['Package']] = fields
    return result

def ar_members(b):
    assert b[:8] == b'!<arch>\n'
    at = 8
    while at < len(b):
        name = b[at:at+16].decode().strip().rstrip('/')
        size = int(b[at+48:at+58])
        yield name, b[at+60:at+60+size]
        at += 60 + size + size % 2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--arch', default='aarch64', choices=['aarch64', 'x86_64', 'arm'])
    ap.add_argument('--index-only', action='store_true')
    ap.add_argument('--locked', action='store_true', help='Use exact native-packages.lock.json instead of live repository indexes')
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    packages = {} if args.locked else index(TUR, 'tur-packages/tur', args.arch, 'tur')
    if not args.locked: packages.update(index(MAIN, 'stable/main', args.arch, 'main'))
    if args.index_only:
        for name in ['clang', 'gcc-15', 'gcc-14', 'make', 'cmake', 'ninja']:
            print(json.dumps(packages.get(name), ensure_ascii=False))
        return
    selected = {}
    # LLVM package dependency pulls the tool set; pruning docs/static libraries is safe.
    def include(name):
        if name in selected: return
        if name not in packages: raise RuntimeError(f'Missing dependency: {name}')
        p = selected[name] = packages[name]
        for dep in p.get('Depends', '').split(','):
            dep = re.split(r'\s|\(', dep.strip().split('|')[0])[0]
            if dep: include(dep)
    if args.locked:
        locked=json.loads((ROOT/'native-packages.lock.json').read_text(encoding='utf-8'))
        assert locked['arch']==args.arch
        selected={p['Package']:p for p in locked['packages']}
    else:
        for name in ['clang', 'gcc-15', 'make', 'cmake', 'ninja', 'libandroid-support', 'patchelf', 'gdb', 'git']:
            include(name)
    print('Packages:', ', '.join(selected), flush=True)
    print('Download MB:', round(sum(int(x['Size']) for x in selected.values())/1e6), flush=True)
    def download(p):
        file = CACHE / Path(p['Filename']).name
        if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != p['SHA256']:
            b = fetch(p['Base'] + p['Filename'])
            assert hashlib.sha256(b).hexdigest() == p['SHA256'], file
            file.write_bytes(b)
        print('Verified', p['Package'], p['Version'], flush=True)
        return p, file
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        downloads = list(ex.map(download, selected.values()))
    manifest = {'version': 1, 'arch': args.arch, 'package': 'com.forgex', 'files': [], 'links': [], 'packages': list(selected.values()), 'modification': 'Equal-length prefix rewrite /data/data/com.termux -> /data/data/com.forgex; documentation/static archives pruned except compiler runtime archives.'}
    out = ROOT / 'app/src/main/assets/runtime.zip'
    count, size = 0, 0
    contents, metadata = {}, {}
    if True:
        for p, file in downloads:
            for name, data in ar_members(file.read_bytes()):
                if not name.startswith('data.tar'): continue
                with tarfile.open(fileobj=io.BytesIO(data)) as t:
                    for member in t:
                        path = member.name.removeprefix('./')
                        prefix = 'data/data/com.termux/files/usr/'
                        if not path.startswith(prefix): continue
                        path = path[len(prefix):]
                        if not path or member.isdir(): continue
                        if path.startswith('share/doc/') and member.isfile() and (Path(path).name.lower().startswith(('copying','license','copyright','notice','authors'))):
                            b=t.extractfile(member).read()
                            license_file=ROOT/'licenses/native'/p['Package']/Path(path).name
                            license_file.parent.mkdir(parents=True,exist_ok=True)
                            license_file.write_bytes(b)
                            contents[path]=b
                            metadata[path]={'path':path,'exec':False}
                        if '/f951' in path or path.startswith('bin/gfortran'): continue
                        if path.startswith(('include/llvm/', 'include/llvm-c/', 'include/clang/', 'include/clang-c/')): continue
                        if path.startswith('bin/lto-dump') or 'libgfortran' in path or '/finclude/' in path: continue
                        if path.startswith('lib/libclang.so'): continue
                        if p['Package'] == 'clang' and path.startswith('bin/') and path.split('/')[-1] not in ['clang', 'clang++', 'clang-21', 'clangd', 'clang-format', 'aarch64-linux-android-clang', 'aarch64-linux-android-clang++', 'aarch64-linux-android-cpp', 'aarch64-linux-android-gcc', 'aarch64-linux-android-g++']: continue
                        if path.startswith(('share/man/', 'share/doc/', 'share/info/', 'share/locale/', 'lib/cmake/', 'lib/pkgconfig/')): continue
                        if path.endswith('.a') and not (path.startswith('lib/clang/') or path.startswith('lib/gcc/') or 'libc++' in path or 'libunwind' in path or '/usr/lib/' in path): continue
                        if path.startswith('bin/') and (path.split('/')[-1].startswith(('llvm-', 'opt', 'llc'))): continue
                        if member.issym() or member.islnk():
                            manifest['links'].append({'path': path, 'target': member.linkname.replace('/data/data/com.termux', '/data/data/com.forgex'), 'hard': member.islnk()})
                        elif member.isfile():
                            b = t.extractfile(member).read().replace(OLD, NEW)
                            if path.startswith('lib/gcc/') and path.endswith('/specs'):
                                b=b.replace(b'-I/data/data/com.forgex/files/usr/include/c++/v1', b'-nostdinc++ -isystem /data/data/com.forgex/files/usr/include/c++/v1')
                            contents[path] = b
                            metadata[path] = {'path': path, 'exec': bool(member.mode & 0o111), 'mtime':member.mtime}
    # The compact GCC sysroot deliberately replaces overlapping NDK headers. Last
    # package wins; ZIP contains each file once, avoiding duplicate extraction.
    headers = ['algorithm','bitset','cassert','cctype','cerrno','cfloat','climits','cmath','complex','cstdio','cstdlib','cstring','ctime','deque','exception','fstream','functional','iomanip','ios','iostream','istream','iterator','limits','list','map','memory','numeric','ostream','queue','set','sstream','stack','stdexcept','string','utility','vector']
    cpp11 = ['array','chrono','initializer_list','random','tuple','type_traits','unordered_map','unordered_set']
    cpp17 = ['any','optional','variant','string_view']
    cpp20 = ['concepts','ranges','span']
    convenience='// Forge convenience header over libc++; not GNU libstdc++.\n#pragma once\n'+''.join(f'#include <{h}>\n' for h in headers)
    for version,more in [(201103,cpp11),(201703,cpp17),(202002,cpp20)]:convenience+=f'#if __cplusplus >= {version}L\n'+''.join(f'#include <{h}>\n' for h in more)+'#endif\n'
    contents['include/forge/bits/stdc++.h'] = convenience.encode()
    metadata['include/forge/bits/stdc++.h'] = {'path':'include/forge/bits/stdc++.h','exec':False}
    manifest['links'].append({'path':'bin/sh','target':'/system/bin/sh','hard':False})
    pty=ROOT/'native/forge-pty-aarch64'
    if pty.exists():
        contents['bin/forge-pty']=pty.read_bytes()
        metadata['bin/forge-pty']={'path':'bin/forge-pty','exec':True}
    manifest['files'] = list(metadata.values())
    # Preserve license/copyright files from deb documentation separately.
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path, b in contents.items():
            z.writestr(path,b)
            count += 1
            size += len(b)
        z.writestr('forge-runtime.json', json.dumps(manifest))
    (ROOT / 'native-packages.lock.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (ROOT/'app/src/main/assets/runtime-info.json').write_text(json.dumps({'arch':args.arch,'version':1}),encoding='utf-8')
    print(f'{out}: {out.stat().st_size/1e6:.1f} MB; extracted {size/1e6:.1f} MB; {count} files', flush=True)
    # MIT licensed Monaco. Keep LICENSE and third party notices in the deliverable.
    version = '0.52.2'
    tgz = CACHE / f'monaco-{version}.tgz'
    if not tgz.exists(): tgz.write_bytes(fetch(f'https://registry.npmjs.org/monaco-editor/-/monaco-editor-{version}.tgz'))
    with tarfile.open(tgz) as t:
        for m in t:
            if m.isfile() and m.name.startswith('package/min/vs/'):
                f = ROOT / 'app/src/main/assets/ui' / m.name.removeprefix('package/min/')
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(t.extractfile(m).read())
            if m.isfile() and m.name in ['package/LICENSE', 'package/ThirdPartyNotices.txt']:
                (ROOT / 'licenses' / ('monaco-' + m.name.split('/')[-1])).write_bytes(t.extractfile(m).read())

if __name__ == '__main__': main()
