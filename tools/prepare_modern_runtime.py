"""Package pinned native tools in Android's read-only installed library directory.

The old verified full runtime is input, never modified. All host ELF images are
deduplicated into jniLibs; their original paths become links to package-manager
installed files. Only data/static link inputs are extracted to writable storage.
"""
import argparse,hashlib,json,os,pathlib,posixpath,shutil,struct,subprocess,tarfile,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]

def digest(data):return hashlib.sha256(data).hexdigest()
def elf(data,machine_id=183):
    if data[:6]!=b'\x7fELF\x02\x01':return None
    kind,machine=struct.unpack_from('<HH',data,16)
    if machine!=machine_id or kind not in (2,3):return None
    off=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
    loads=[struct.unpack_from('<IIQQQQQQ',data,off+i*size)for i in range(count)if struct.unpack_from('<I',data,off+i*size)[0]==1]
    return {'kind':kind,'pageAlignment':min((p[7]for p in loads),default=0),'loads':loads}

def checked_recipe(destination):
    lock=json.loads((ROOT/'native-sources/sources.lock.json').read_text(encoding='utf-8'))
    recipe=next(r for r in lock['recipes']if r['repo']=='termux/termux-packages')
    archive=ROOT/recipe['file'];assert digest(archive.read_bytes())==recipe['sha256']
    selected={}
    with tarfile.open(archive)as tar:
        for m in tar:
            if '/packages/libandroid-spawn/'in m.name and m.isfile():
                name=m.name.rsplit('/',1)[-1]
                if name in ['posix_spawn.cpp','posix_spawn.h','LICENSE']:
                    data=tar.extractfile(m).read();(destination/name).write_bytes(data);selected[name]=digest(data)
    assert set(selected)=={'posix_spawn.cpp','posix_spawn.h','LICENSE'}
    return {'recipeCommit':recipe['commit'],'sourceFiles':selected}

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=pathlib.Path,required=True);p.add_argument('--ndk',type=pathlib.Path,required=True);p.add_argument('--arch',choices=['aarch64','x86_64'],default='aarch64');p.add_argument('--generated-root',type=pathlib.Path);p.add_argument('--verification-4k',action='store_true',help='x86_64 emulator fixture only; never a release runtime');args=p.parse_args()
    if args.verification_4k:assert args.arch=='x86_64'and args.generated_root,'4 KB verification requires a separate x86_64 output'
    generated=args.generated_root or ROOT/'app/src/modern';assets=generated/'assets';libs=generated/'jniLibs'/('arm64-v8a'if args.arch=='aarch64'else'x86_64')
    assets.mkdir(parents=True,exist_ok=True);libs.mkdir(parents=True,exist_ok=True)
    build=ROOT/'work'/('modern-native'if args.arch=='aarch64'else'modern-native-x86_64');build.mkdir(parents=True,exist_ok=True)
    prebuilt=args.ndk/'toolchains/llvm/prebuilt'/('windows-x86_64'if os.name=='nt'else'linux-x86_64'if os.uname().sysname=='Linux'else'darwin-x86_64')
    suffix='.cmd'if os.name=='nt'else''
    cc=prebuilt/('bin/'+args.arch+'-linux-android28-clang'+suffix);cxx=prebuilt/('bin/'+args.arch+'-linux-android28-clang++'+suffix)
    runner=build/'libstudio_runner.so';spawn=build/'libandroid-spawn.so'
    flags=['-O2','-fvisibility=hidden','-Wl,-z,max-page-size=16384','-Wl,-z,common-page-size=16384']
    subprocess.run([str(cc),*flags,str(ROOT/'native/studio-runner.c'),'-ldl','-o',str(runner)],check=True)
    # Hiding/stripping the host's main avoids breaking there instead of user main.
    subprocess.run([str(prebuilt/('bin/llvm-strip.exe'if os.name=='nt'else'bin/llvm-strip')),'--strip-all',str(runner)],check=True)
    provenance=checked_recipe(build)
    subprocess.run([str(cxx),*[f for f in flags if f!='-fvisibility=hidden'],'-shared','-fPIC','-static-libstdc++','-Wl,-soname,libandroid-spawn.so','-I'+str(build),str(build/'posix_spawn.cpp'),'-o',str(spawn)],check=True)
    subprocess.run([str(prebuilt/('bin/llvm-strip.exe'if os.name=='nt'else'bin/llvm-strip')),'--strip-unneeded',str(spawn)],check=True)
    exports=subprocess.check_output([str(prebuilt/('bin/llvm-nm.exe'if os.name=='nt'else'bin/llvm-nm')),'-D','--defined-only',str(spawn)],text=True)
    assert ' posix_spawn\n'in exports and ' posix_spawnp\n'in exports,'Spawn API was not exported'
    (libs/runner.name).write_bytes(runner.read_bytes())
    with zipfile.ZipFile(args.input)as source:
        original=json.loads(source.read('forge-runtime.json'));assert original['arch']==args.arch
        content={f.filename:source.read(f)for f in source.infolist()if f.filename!='forge-runtime.json'and not f.is_dir()}
    content['lib/libandroid-spawn.so']=spawn.read_bytes()
    native={};mapping=[];data=[];bad=[]
    metadata={f['path']:f for f in original['files']}
    for path,body in sorted(content.items()):
        if path.startswith('/')or'..'in pathlib.PurePosixPath(path).parts:raise ValueError('Unsafe runtime path')
        image=elf(body,183 if args.arch=='aarch64'else 62)
        if image:
            if image['pageAlignment']<16384 or any((x[2]-x[3])%16384 for x in image['loads']):bad.append(path)
            name='libstudio_'+digest(body)[:24]+'.so';native[name]=body
            mapping.append({'path':path,'library':name,'sha256':digest(body),'bytes':len(body),'alignment':image['pageAlignment']})
        else:data.append((path,body,metadata.get(path,{}).get('exec',False)))
    if bad and not args.verification_4k:raise RuntimeError('Rebuild these native files for 16 KB: '+', '.join(bad))
    for name,body in native.items():(libs/name).write_bytes(body)
    expected=set(native)|{runner.name}
    # Only exact generated files owned by this tool are eligible for cleanup.
    for file in libs.glob('libstudio_*.so'):
        if file.name not in expected:file.unlink()
    links={x['path']:x for x in original['links']}
    aliases={'ld':'ld.bfd','ar':'gar','ranlib':'granlib','nm':'gnm','objcopy':'gobjcopy','objdump':'gobjdump','readelf':'greadelf','strip':'gstrip','strings':'gstrings','size':'gsize','addr2line':'gaddr2line','c++filt':'gc++filt','gcc':'gcc-15','g++':'g++-15','cc':'gcc-15','c++':'g++-15'}
    for name,target in aliases.items():links['bin/'+name]={'path':'bin/'+name,'target':target,'hard':False}
    links['bin/sh']={'path':'bin/sh','target':'/system/bin/sh','hard':False}
    manifest={'version':1,'arch':args.arch,'verificationOnly':args.verification_4k,'runner':runner.name,'runnerSha256':digest(runner.read_bytes()),'native':mapping,'links':list(links.values()),'files':[{'path':p,'sha256':digest(b),'bytes':len(b),'exec':x,'mtime':metadata.get(p,{}).get('mtime',0)}for p,b,x in data],'provenance':provenance,'inputSha256':digest(args.input.read_bytes())}
    with zipfile.ZipFile(assets/'runtime-modern-data.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6)as out:
        for path,body,executable in data:
            entry=zipfile.ZipInfo(path,(1980,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=(0o755 if executable else 0o644)<<16;out.writestr(entry,body)
    manifest['dataSha256']=digest((assets/'runtime-modern-data.zip').read_bytes())
    manifest['identity']=digest(json.dumps(manifest,sort_keys=True).encode())
    (assets/'modern-runtime.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
    (assets/'runtime-info.json').write_text(json.dumps({'arch':args.arch,'version':2,'mode':'installed-tools'}),encoding='utf-8')
    # Tool names remain compatible; this build never downloads native code.
    catalog=json.loads((ROOT/'app/src/main/assets/tool-packs.json').read_text(encoding='utf-8'));catalog['delivery']='bundled';catalog['version']=3
    for pack in catalog['packs']:pack.update({'local':True,'bytes':0,'embedded':True})
    (assets/'tool-packs.json').write_text(json.dumps(catalog,separators=(',',':')),encoding='utf-8')
    report={'nativeImages':len(mapping),'deduplicatedImages':len(native),'nativeBytes':sum(map(len,native.values())),'dataBytes':(assets/'runtime-modern-data.zip').stat().st_size,'pageAlignment16k':not bad,'verificationOnly':args.verification_4k,'provenance':provenance}
    (build/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
