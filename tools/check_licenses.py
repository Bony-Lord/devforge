"""Verify attribution inventory and corresponding-source checksums; not legal advice."""
import argparse,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--archives',action='store_true');args=parser.parse_args()
inventory=json.loads((ROOT/'licenses/package-notices.json').read_text(encoding='utf-8'))
packages=json.loads((ROOT/'native-packages.lock.json').read_text(encoding='utf-8'))['packages']
shared={'clang':'libllvm','libcompiler-rt':'libllvm','lld':'libllvm','llvm':'libllvm','ncurses-ui-libs':'ncurses'}
by_name={p['package']:p for p in inventory}
for package in packages:
    record=by_name[package['Package']]
    assert record['version']==package['Version'] and record['sha256']==package['SHA256']
    notices=record['notices'] or by_name[shared[package['Package']]]['notices']
    assert notices
    for path in notices: assert (ROOT/path).is_file() and (ROOT/path).stat().st_size>0,path
sources=json.loads((ROOT/'native-sources/sources.lock.json').read_text(encoding='utf-8'))
copyleft=['gcc-15','binutils','libgmp','libmpfr','libmpc','libiconv','make','zstd','liblzma','patchelf','gdb','guile','libunistring','readline','gdbm','git','less']
assert set(copyleft)<={entry['package'] for entry in sources['archives']}
for name in copyleft: assert any((ROOT/'licenses/upstream'/name).rglob('*'))
for entry in sources['archives']+sources['recipes']:
    assert len(entry['sha256'])==64 and entry['url'].startswith('https://')
    if args.archives: assert hashlib.sha256((ROOT/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
for path in ['sora-editor-LICENSE','monaco-LICENSE','lucide-LICENSE','yaml-LICENSE','kotlin-LICENSE.txt','kotlin-NOTICE.txt','androidx-LICENSE.txt','Gradle-LICENSE']:
    assert (ROOT/'licenses'/path).is_file(),path
for entry in json.loads((ROOT/'fonts.lock.json').read_text(encoding='utf-8')):
    assert hashlib.sha256((ROOT/'app/src/main/assets/ui/fonts'/entry['file']).read_bytes()).hexdigest()==entry['sha256']
dockview=json.loads((ROOT/'dockview.lock.json').read_text(encoding='utf-8'))
assert dockview['license']=='MIT' and hashlib.sha256((ROOT/dockview['bundle']).read_bytes()).hexdigest()==dockview['sha256']
assert 'MIT License' in (ROOT/'licenses/dockview-LICENSE').read_text(encoding='utf-8')
style=json.loads((ROOT/'app/src/main/assets/python/style-manifest.json').read_text(encoding='utf-8'))
intelligence=json.loads((ROOT/'app/src/main/assets/python/intelligence-manifest.json').read_text(encoding='utf-8'))
for package in style['packages']+intelligence['packages']:
    assert len(package['sha256'])==64 and package['url'].startswith('https://files.pythonhosted.org/')
    assert 'MIT' in (ROOT/'licenses'/(package['name']+'-LICENSE')).read_text(encoding='utf-8')
print(json.dumps({'nativePackages':len(packages),'attributionFiles':sum(len(p['notices']) for p in inventory),'sharedNoticeMappings':shared,'copyleftSourceFamilies':len(copyleft),'sourceArchives':len(sources['archives']),'recipeSnapshots':len(sources['recipes']),'sourceArchiveBytesVerified':args.archives},indent=2))
