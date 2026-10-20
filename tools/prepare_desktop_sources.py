"""Accompany unmodified Electron FFmpeg binaries with pinned library sources/patches."""
import argparse,base64,hashlib,json,pathlib,re,tarfile,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def digest(data):return hashlib.sha256(data).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
    lock=json.loads((ROOT/'desktop-sources.lock.json').read_text(encoding='utf-8'));assert json.loads((ROOT/'desktop/package.json').read_text())['devDependencies']['electron']==lock['electron'];cache=ROOT/'work/desktop-sources';cache.mkdir(parents=True,exist_ok=True)
    for item in lock['archives']:
        file=cache/item['name']
        if not file.exists():urllib.request.urlretrieve(item['url'],file)
        if digest(file.read_bytes())!=item['sha256']:raise RuntimeError('Desktop source checksum mismatch: '+item['name'])
    electron=cache/lock['archives'][1]['name']
    with tarfile.open(electron)as tar:
        dep=next(m for m in tar if m.name.endswith('/DEPS')and m.name.count('/')==1);text=tar.extractfile(dep).read().decode()
        assert re.search(r"'chromium_version':\s*'"+re.escape(lock['chromium'])+"'",text)
        patchfiles=[m.name for m in tar.getmembers()if '/patches/ffmpeg/'in m.name and m.isfile()]
        assert patchfiles,'Electron FFmpeg patches were not included'
    file=cache/'Chromium-DEPS'
    if not file.exists():file.write_bytes(base64.b64decode(urllib.request.urlopen(lock['chromiumDeps']['url'],timeout=30).read()))
    deps=file.read_bytes();assert digest(deps)==lock['chromiumDeps']['sha256'],'Chromium DEPS checksum mismatch'
    assert re.search(rb"'ffmpeg_revision':\s*'"+lock['ffmpegRevision'].encode()+rb"'",deps)
    readme=f'''C++ Studio desktop native sources for Electron {lock['electron']}

The desktop distribution uses unmodified Electron release binaries and its
dynamically loaded FFmpeg library under LGPL-2.1-or-later. This archive contains:
* complete Chromium FFmpeg source at {lock['ffmpegRevision']};
* Electron {lock['electron']} source, including its FFmpeg patches, build GN args,
  dependency revisions and release/build scripts;
* the matching Chromium DEPS and the archive checksums.

No C++ Studio modifications are made to FFmpeg. Electron's own changes are in
electron-{lock['electron']}/patches/ffmpeg inside the Electron source archive.
The Chromium FFmpeg archive includes Chromium build/configuration files and the
FFmpeg COPYING.LGPLv2.1 license. Do not substitute an unrelated FFmpeg release.

Rebuilding: follow Electron's upstream build instructions for this exact tag:
https://github.com/electron/electron/blob/v{lock['electron']}/docs/development/build-instructions-gn.md
https://github.com/electron/electron/blob/v{lock['electron']}/DEPS
Use the release GN arguments/scripts from that source; gclient synchronizes the
pinned Chromium/FFmpeg and other build dependencies and applies Electron patches.
The FFmpeg target can then be rebuilt in that configured Chromium/Electron tree.
C++ Studio adds no configure flags or changes to the upstream library binary.

The library remains a separate ffmpeg.dll / libffmpeg.so / libffmpeg.dylib.
Replacement and reverse engineering for debugging library modifications are not
prohibited. macOS may require locally re-signing the modified application bundle.
This source archive is distributed beside the binary archives on the same release
page; CI also uploads it beside every portable build.
'''
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.output,'w')as out:
        entries={'README.txt':readme.encode(),'desktop-sources.lock.json':json.dumps(lock,indent=2).encode(),'Chromium-DEPS':deps}
        for item in lock['archives']:entries[item['name']]=(cache/item['name']).read_bytes()
        for name,body in sorted(entries.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED if name.endswith('.gz')else zipfile.ZIP_DEFLATED;out.writestr(info,body)
    sha=digest(args.output.read_bytes());args.output.with_suffix('.zip.sha256').write_text(sha+'  '+args.output.name+'\n',encoding='utf-8')
    print(json.dumps({'file':str(args.output),'sha256':sha,'bytes':args.output.stat().st_size,'electron':lock['electron'],'ffmpeg':lock['ffmpegRevision']}))
if __name__=='__main__':main()
