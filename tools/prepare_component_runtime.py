"""Create a small host, one signed native engine and ordinary tool data packages.

Input is the verified output of prepare_modern_runtime.py, never modified here.
Only PackageManager-installed native images execute. Data packs need no APK install.
"""
import argparse,hashlib,json,os,pathlib,posixpath,re,shutil,subprocess,tempfile,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(data):return hashlib.sha256(data).hexdigest()
def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def python_path(p):return p.startswith(('lib/python','include/python','share/man/man1/python'))or p.startswith('bin/python')or p.startswith('lib/libpython')or p.startswith('lib/pkgconfig/python')
def partition(manifest,catalog):
 owners={};packs={p['id']:p for p in catalog['packs']if not p.get('aliasOf')}
 for id,p in packs.items():
  for name in p.get('files',[])+p.get('links',[]):
   owners[name]='platform'if name in owners and owners[name]!=id else id
 paths=[f['path']for key in ['native','files','links']for f in manifest[key]]
 for name in paths:
  owners.setdefault(name,'cmake'if name in ['bin/ctest','bin/cpack']else'platform')
  if name.startswith(('lib/gcc/','libexec/gcc/')):owners[name]='gcc'
  # The former GDB ZIP also carried shared dependencies of its bundled Python.
  # Their independent runtime owner is the common platform, not the debugger.
  if owners[name]=='debugger'and re.match(r'^lib/lib(?!python)[^/]+\.so(?:\.[\d.]+)?$',name):owners[name]='platform'
  if python_path(name):owners[name]='python'
 for _ in range(8):
  for link in manifest['links']:
   target=link['target'];target=target.removeprefix('/data/data/com.forgex/files/usr/')if target.startswith('/data/data/com.forgex/files/usr/')else posixpath.normpath(posixpath.join(posixpath.dirname(link['path']),target))
   if target in owners:owners[link['path']]=owners[target]
 return owners
def main():
 p=argparse.ArgumentParser();p.add_argument('--prepared-runtime',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--sdk',type=pathlib.Path,required=True);p.add_argument('--keystore',type=pathlib.Path,required=True);p.add_argument('--pack-version',type=int,default=1);p.add_argument('--release',default='v0.5.0-runtime2');args=p.parse_args()
 if not os.environ.get('GCC_STUDIO_KEY_PASSWORD'):raise RuntimeError('Set GCC_STUDIO_KEY_PASSWORD (not a command-line password)')
 source=args.prepared_runtime.resolve();output=args.output.resolve()
 if source==output or source in output.parents or output in source.parents:raise ValueError('Use independent source/output directories')
 manifest=json.loads((source/'assets/modern-runtime.json').read_text(encoding='utf-8'));catalog=json.loads((ROOT/'app/src/main/assets/tool-packs.json').read_text(encoding='utf-8'));owners=partition(manifest,catalog)
 arch=manifest['arch'];abi='arm64-v8a'if arch=='aarch64'else'x86_64';sdk=args.sdk.resolve();build=sdk/'build-tools/35.0.0';suffix='.exe'if os.name=='nt'else'';aapt=build/('aapt2'+suffix);align=build/('zipalign'+suffix);signer=build/('apksigner.bat'if os.name=='nt'else'apksigner')
 output.mkdir(parents=True,exist_ok=True);assets=output/'assets';libs=output/'jniLibs'/abi;artifacts=output/'components';assets.mkdir(exist_ok=True);libs.mkdir(parents=True,exist_ok=True);artifacts.mkdir(exist_ok=True)
 if any(f.name!=manifest['runner']for f in libs.glob('libstudio_*.so')):raise ValueError('Output contains native payload; use a new output directory')
 shutil.copy2(source/'jniLibs'/abi/manifest['runner'],libs/manifest['runner'])
 specs={p['id']:dict(p)for p in catalog['packs']};specs['python']={**specs['python'],'requires':['platform']};specs['debugger']['requires']=list(dict.fromkeys([*specs['debugger']['requires'],'python']))
 specs['python'].pop('aliasOf',None)
 index={'version':3,'delivery':'engine-and-packs','arch':arch,'runner':manifest['runner'],'runnerSha256':manifest['runnerSha256'],'components':[],'verificationOnly':manifest.get('verificationOnly',False),'files':[],'native':[],'links':[]};descriptors={}
 with zipfile.ZipFile(source/'assets/runtime-modern-data.zip')as data:
  for id,spec in specs.items():
   descriptor={'version':1,'id':id,'arch':arch,'files':[v for v in manifest['files']if owners[v['path']]==id],'native':[v for v in manifest['native']if owners[v['path']]==id],'links':[v for v in manifest['links']if owners[v['path']]==id]}
   name='dev.forge.runtime.engine.'+arch;descriptor_bytes=encoded(descriptor);descriptors[id]=descriptor_bytes;asset='devforge-tool-'+id+'-'+arch+'.studio-toolpack';dest=artifacts/asset
   with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
    z.writestr('devforge-component.json',descriptor_bytes)
    for f in descriptor['files']:
     body=data.read(f['path']);assert sha(body)==f['sha256'];z.writestr('runtime/'+f['path'],body)
   metadata={'id':id,'package':name,'versionCode':args.pack_version,'manifestSha256':sha(descriptor_bytes),'asset':asset,'release':args.release,'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'requires':spec['requires'],'installedBytes':sum(v['bytes']for v in descriptor['files']),'name':spec['name'],'description':spec['description'],'probePath':spec.get('probePath','bin/'+spec.get('probe',id))}
   index['components'].append(metadata);print(json.dumps({k:metadata[k]for k in ['id','bytes','installedBytes']}),flush=True)
 engine_asset='devforge-native-engine-'+arch+'.apk';engine=artifacts/engine_asset
 with tempfile.TemporaryDirectory(prefix='devforge-engine-')as tmp:
  tmp=pathlib.Path(tmp);xml=tmp/'AndroidManifest.xml';xml.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.forge.runtime.engine.'+arch+'"><uses-sdk android:minSdkVersion="28" android:targetSdkVersion="36"/><application android:label="DevForge Native Engine" android:hasCode="false" android:allowBackup="false" android:extractNativeLibs="true"/></manifest>',encoding='utf-8')
  unsigned=tmp/'unsigned.apk';subprocess.run([str(aapt),'link','-I',str(sdk/'platforms/android-36/android.jar'),'--manifest',str(xml),'--version-code',str(args.pack_version),'--version-name','engine-1','-o',str(unsigned)],check=True)
  with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
   for id,body in descriptors.items():z.writestr('assets/components/'+id+'.json',body)
   for image in {f['library']:f for f in manifest['native']}.values():
    body=(source/'jniLibs'/abi/image['library']).read_bytes();assert sha(body)==image['sha256'];z.writestr('lib/'+abi+'/'+image['library'],body)
   for file in (ROOT/'app/src/main/assets/ui/licenses').glob('*.txt'):z.write(file,'assets/licenses/'+file.name)
   z.write(ROOT/'native-sources/sources.lock.json','assets/native-sources.lock.json');z.write(ROOT/'THIRD_PARTY.md','assets/THIRD_PARTY.md')
  aligned=tmp/'aligned.apk';subprocess.run([str(align),'-f','-P','16','4',str(unsigned),str(aligned)],check=True)
  subprocess.run([str(signer),'sign','--ks',str(args.keystore),'--ks-key-alias','forge','--ks-pass','env:GCC_STUDIO_KEY_PASSWORD','--key-pass','env:GCC_STUDIO_KEY_PASSWORD','--out',str(engine),str(aligned)],check=True)
 index['engine']={'package':'dev.forge.runtime.engine.'+arch,'versionCode':args.pack_version,'asset':engine_asset,'release':args.release,'bytes':engine.stat().st_size,'sha256':sha(engine.read_bytes())}
 index['identity']=sha(encoded(index));(assets/'modern-runtime.json').write_bytes(encoded(index));(assets/'runtime-info.json').write_bytes(encoded({'arch':arch,'version':4,'mode':'engine-and-packs'}))
 (assets/'tool-packs.json').write_bytes(encoded({'version':5,'arch':arch,'delivery':'engine-and-packs','engine':index['engine'],'release':args.release,'packs':index['components'],'base':{'id':'core','bytes':0}}));(artifacts/'components.json').write_bytes(encoded(index));(artifacts/'SHA256SUMS.txt').write_text(''.join(x['sha256']+'  '+x['asset']+'\n'for x in [index['engine'],*index['components']]),encoding='utf-8');print(json.dumps(index['engine']),flush=True)
if __name__=='__main__':main()
