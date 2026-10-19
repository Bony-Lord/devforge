"""Include human-readable third-party notices in the offline APK UI."""
import json,pathlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
dest=ROOT/'app/src/main/assets/ui/licenses'
dest.mkdir(parents=True,exist_ok=True)
entries=[]
for source in sorted((ROOT/'licenses').rglob('*')):
    if not source.is_file():continue
    relative=source.relative_to(ROOT/'licenses')
    target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    entries.append({'name':relative.as_posix(),'path':'licenses/'+relative.as_posix()})
for name in ['LICENSE','THIRD_PARTY.md']:
    source=ROOT/name
    if source.exists():shutil.copy2(source,dest/name);entries.insert(0,{'name':name,'path':'licenses/'+name})
(dest/'index.json').write_text(json.dumps(entries),encoding='utf-8')
print('Bundled notices:',len(entries))
