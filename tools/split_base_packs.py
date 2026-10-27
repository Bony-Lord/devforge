"""Move the unchanged GCC/CMake base into three independently downloadable packs."""
import argparse,hashlib,json,pathlib,zipfile,posixpath
ROOT=pathlib.Path(__file__).resolve().parents[1]

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--input',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,required=True);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 catalog=json.loads((ROOT/'app/src/main/assets/tool-packs.json').read_text(encoding='utf-8'))
 with zipfile.ZipFile(args.input)as source:
  manifest=json.loads(source.read('forge-runtime.json'));assert manifest['id']=='base'
  files={f['path']:f for f in manifest['files']};links={f['path']:f for f in manifest['links']};allpaths=set(files)|set(links)
  gcc={p for p in allpaths if p.startswith(('lib/gcc/','libexec/gcc/'))or p.startswith('bin/')and p.endswith('-15')}
  cmake={p for p in allpaths if p in ['bin/cmake','bin/ninja','bin/make']or p.startswith('share/cmake-')}
  for _ in range(len(links)+1):
   changed=False
   for p,link in links.items():
    target=link['target'];target=target.removeprefix('/data/data/com.forgex/files/usr/')if target.startswith('/data/data/com.forgex/files/usr/')else posixpath.normpath(posixpath.join(posixpath.dirname(p),target))
    for group in [gcc,cmake]:
     if target in group and p not in group:group.add(p);changed=True
   if not changed:break
  assert not gcc&cmake
  groups={'platform':allpaths-gcc-cmake,'gcc':gcc,'cmake':cmake};assert set.union(*groups.values())==allpaths
  names={'platform':('Библиотеки C/C++','Заголовки, системные библиотеки и инструменты линковки'),'gcc':('GCC 15.2','Компилятор C/C++; загружается отдельно от приложения'),'cmake':('CMake и Ninja','Сборка проектов CMake; включает Ninja и Make')}
  probes={'platform':'lib/libc++_shared.so','gcc':'bin/gcc-15','cmake':'bin/cmake'};entries=[]
  for name,paths in groups.items():
   data={'version':3,'id':name,'arch':manifest['arch'],'files':[files[p]for p in sorted(paths)if p in files],'links':[links[p]for p in sorted(paths)if p in links]}
   out=args.output/('cpp-studio-'+name+'-'+manifest['arch']+'.zip')
   with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as archive:
    for p in sorted(paths):
     if p in files:
      content=source.read(p);assert hashlib.sha256(content).hexdigest()==files[p]['sha256'];archive.writestr(zipfile.ZipInfo(p,date_time=(2026,1,1,0,0,0)),content,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
    archive.writestr(zipfile.ZipInfo('forge-runtime.json',date_time=(2026,1,1,0,0,0)),json.dumps(data,separators=(',',':')),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
   entry={'id':name,'asset':out.name,'release':'v0.3.7-toolpacks','bytes':out.stat().st_size,'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'installedBytes':sum(source.getinfo(p).file_size for p in paths if p in files),'requires':[]if name=='platform'else['platform'],'name':names[name][0],'description':names[name][1],'probePath':probes[name],'files':[f['path']for f in data['files']],'links':[f['path']for f in data['links']]}
   entries.append(entry);print(json.dumps({k:entry[k]for k in ['id','bytes','installedBytes','sha256']}),flush=True)
 old=[p for p in catalog['packs']if p['id']not in groups]
 for p in old:p['requires']=list(dict.fromkeys(['platform',*p['requires']]))
 catalog.update(version=3,delivery='download',legacyBaseSha256=catalog.get('legacyBaseSha256',catalog['base']['sha256']),packs=entries+old)
 (ROOT/'app/src/main/assets/tool-packs.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (args.output/'tool-packs.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
 (args.output/'SHA256SUMS.txt').write_text(''.join(hashlib.file_digest(p.open('rb'),'sha256').hexdigest()+'  '+p.name+'\n'for p in sorted(args.output.glob('*.zip'))),encoding='utf-8')

if __name__=='__main__':main()
