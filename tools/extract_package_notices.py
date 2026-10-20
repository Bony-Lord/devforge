"""Copy unmodified legal notices from the exact, SHA256-pinned binary packages.

This only extracts text notices, never installs or executes package contents.
"""
import argparse, hashlib, io, json, pathlib, posixpath, tarfile
from prepare_runtime import ROOT, ar_members

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=pathlib.Path, required=True)
    args = parser.parse_args()
    packages = json.loads((ROOT/'native-packages.lock.json').read_text(encoding='utf-8'))['packages']
    report = []; payloads = {}; links = {}; pending = []
    lock=json.loads((ROOT/'native-sources/sources.lock.json').read_text(encoding='utf-8'))
    recipe=next(x for x in lock['recipes'] if x['repo']=='termux/termux-packages')
    source=ROOT/recipe['file']
    if hashlib.sha256(source.read_bytes()).hexdigest()!=recipe['sha256']: raise RuntimeError('Recipe checksum mismatch')
    with tarfile.open(source) as archive:
        for member in archive:
            if '/termux-licenses/LICENSES/' not in member.name: continue
            path='share/LICENSES/'+member.name.split('/termux-licenses/LICENSES/',1)[1]
            if member.isfile(): payloads[path]=archive.extractfile(member).read()
            elif member.issym(): links[path]=posixpath.normpath(posixpath.join(posixpath.dirname(path),member.linkname))
    for package in packages:
        source = args.cache / pathlib.PurePosixPath(package['Filename']).name
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != package['SHA256']:
            raise RuntimeError('Package checksum mismatch: '+package['Package'])
        notices = []
        for name, payload in ar_members(data):
            if not name.startswith('data.tar'): continue
            with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
                for member in archive:
                    path = pathlib.PurePosixPath(member.name.removeprefix('./'))
                    if not (member.isfile() or member.issym()) or not path.name.lower().startswith(('copying','license','copyright','notice','authors')):
                        continue
                    if '..' in path.parts or path.is_absolute() or member.size > 16*1024*1024:
                        raise RuntimeError('Invalid notice path')
                    prefix = 'data/data/com.termux/files/usr/'
                    if not str(path).startswith(prefix): continue
                    relative = str(path)[len(prefix):]
                    if member.isfile(): payloads[relative]=archive.extractfile(member).read()
                    else: links[relative]=posixpath.normpath(posixpath.join(posixpath.dirname(relative),member.linkname))
                    pending.append((package['Package'],relative,notices))
        report.append({'package':package['Package'],'version':package['Version'],'sha256':package['SHA256'],'notices':notices})
    for package,path,notices in pending:
        resolved=path; visited=set()
        while resolved in links:
            if resolved in visited: raise RuntimeError('Notice link cycle')
            visited.add(resolved); resolved=links[resolved]
        if resolved not in payloads: raise RuntimeError('Missing notice: '+package+': '+path+' -> '+resolved)
        dest=ROOT/'licenses/native'/package/'package'/path
        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payloads[resolved]);notices.append(dest.relative_to(ROOT).as_posix())
    (ROOT/'licenses/package-notices.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'packages':len(report),'notices':sum(len(x['notices']) for x in report),'withoutOwnNotice':[x['package'] for x in report if not x['notices']]}))

if __name__ == '__main__': main()
