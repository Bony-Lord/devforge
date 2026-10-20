"""Split the verified full runtime into a GCC/CMake base and optional tool packs.

ELF DT_NEEDED dependencies are followed recursively. The base uses GNU ld.bfd,
so GCC does not pull the 130 MB LLVM linker library into the minimal install.
"""
import argparse, hashlib, json, pathlib, posixpath, struct, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]

def needed(data):
    if data[:4]!=b'\x7fELF':return []
    if data[4:6]!=b'\x02\x01':raise ValueError('Expected little-endian ELF64')
    shoff=struct.unpack_from('<Q',data,40)[0];shsize,shnum=struct.unpack_from('<HH',data,58)
    sections=[struct.unpack_from('<IIQQQQIIQQ',data,shoff+i*shsize) for i in range(shnum)]
    result=[]
    for section in sections:
        if section[1]!=6:continue
        strings=sections[section[6]];table=data[strings[4]:strings[4]+strings[5]]
        for offset in range(section[4],section[4]+section[5],16):
            kind,value=struct.unpack_from('<qQ',data,offset)
            if kind==1:result.append(table[value:table.index(b'\0',value)].decode())
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',type=pathlib.Path,required=True);ap.add_argument('--output',type=pathlib.Path,required=True);args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.input) as z:
        manifest=json.loads(z.read('forge-runtime.json'));content={i.filename:z.read(i) for i in z.infolist() if i.filename!='forge-runtime.json'}
    metadata={f['path']:f for f in manifest['files']};links={v['path']:v for v in manifest['links']}
    # Existing full image had LLVM aliases shadowing the GNU binutils already included.
    aliases={'ld':'ld.bfd','ar':'gar','ranlib':'granlib','nm':'gnm','objcopy':'gobjcopy','objdump':'gobjdump','readelf':'greadelf','strip':'gstrip','strings':'gstrings','size':'gsize','addr2line':'gaddr2line','c++filt':'gc++filt'}
    for name,target in aliases.items():links['bin/'+name]={'path':'bin/'+name,'target':target,'hard':False}
    dependencies={p:needed(b) for p,b in content.items() if b[:4]==b'\x7fELF'}
    def closure(seeds):
        files=set();queue=list(seeds)
        while queue:
            path=queue.pop()
            if path in files:continue
            if path in links:
                target=links[path]['target'];target=target.replace('/data/data/com.forgex/files/usr/','') if target.startswith('/data/') else posixpath.normpath(posixpath.join(posixpath.dirname(path),target)) if not target.startswith('/') else None
                if target is not None and target not in content and target not in links:continue
                files.add(path)
                if target:queue.append(target)
            elif path in content:
                files.add(path)
                for library in dependencies.get(path,[]):
                    target='lib/'+library
                    if target in content or target in links:queue.append(target)
        return files
    seeds={
      'base':{p for p in content if p.startswith(('include/','lib/gcc/','libexec/gcc/','lib/clang/','lib/ldscripts/','share/cmake-','etc/tls/','etc/ssl/','share/terminfo/'))}|{'bin/'+n for n in ['gcc-15','g++-15','cpp-15','gcc-ar-15','gcc-nm-15','gcc-ranlib-15','as','ld.bfd','gar','granlib','gnm','gobjcopy','gobjdump','greadelf','gstrip','gstrings','gsize','gaddr2line','gc++filt','make','cmake','ninja','sh']}|{'bin/'+n for n in aliases}|{p for p in links if p.startswith('bin/aarch64-linux-android-') and p.endswith('-15')}|{'lib/libc++_shared.so'}|{p for p in content if p.startswith('lib/') and p.count('/')==1 and (p.endswith(('.o','.a')) or p.endswith('.so') and content[p][:4]!=b'\x7fELF')},
      'analysis':{'bin/clangd','bin/clang-format'},
      'clang':{'bin/clang','bin/clang++','bin/clang-21','bin/lld','bin/ld.lld'},
      'debugger':{p for p in content if p.startswith(('lib/python','lib/guile/','share/guile/','share/gdb/','lib/gdb/'))}|{'bin/gdb','bin/python','bin/python3','bin/python3.14','bin/forge-pty'},
      'git':{p for p in content if p.startswith(('libexec/git-core/','share/git-core/','etc/tls/','etc/ssl/'))}|{p for p in links if p.startswith('libexec/git-core/')}|{'bin/git','bin/git-shell','bin/git-upload-pack','bin/git-receive-pack'}
    }
    resolved={k:closure(v) for k,v in seeds.items()};catalog={'version':2,'arch':manifest['arch'],'release':'v0.3.0-toolpacks','base':{},'packs':[]}
    descriptions={'analysis':('Анализ и форматирование','clangd, clang-tidy, clang-format; семантика, ошибки и подсказки'), 'clang':('Компилятор Clang','Альтернативный компилятор LLVM Clang'), 'debugger':('Отладчик','GDB, Python и просмотр C++ контейнеров'), 'git':('Git','История, коммиты и HTTPS-клонирование')}
    for name,allpaths in resolved.items():
        paths=allpaths if name=='base' else allpaths-resolved['base'];requires=[]
        if name=='clang':paths-=resolved['analysis'];requires=['analysis']
        out=args.output/('runtime-base.zip' if name=='base' else 'cpp-studio-'+name+'-aarch64.zip')
        datafiles=[dict(metadata[p],sha256=hashlib.sha256(content[p]).hexdigest()) for p in sorted(paths) if p in content]
        data={'version':2,'id':name,'arch':manifest['arch'],'files':datafiles,'links':[links[p] for p in sorted(paths) if p in links]}
        reuse=False
        if out.exists():
            with zipfile.ZipFile(out) as old:reuse=json.loads(old.read('forge-runtime.json'))==data and all(i.date_time==(2026,1,1,0,0,0) for i in old.infolist())
        if not reuse:
            with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
                for p in sorted(paths):
                    if p in content:z.writestr(zipfile.ZipInfo(p,date_time=(2026,1,1,0,0,0)),content[p],compress_type=zipfile.ZIP_DEFLATED)
                z.writestr(zipfile.ZipInfo('forge-runtime.json',date_time=(2026,1,1,0,0,0)),json.dumps(data,separators=(',',':')),compress_type=zipfile.ZIP_DEFLATED)
        entry={'id':name,'asset':out.name,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'installedBytes':sum(len(content[p]) for p in paths if p in content),'requires':requires,'files':[f['path'] for f in datafiles],'links':[v['path'] for v in data['links']]}
        if name=='base':catalog['base']=entry
        else:entry['name'],entry['description']=descriptions[name];entry['probe']={'analysis':'clangd','clang':'clang-21','debugger':'gdb','git':'git'}[name];catalog['packs'].append(entry)
        print(name,round(entry['bytes']/1e6,1),'MB compressed',round(entry['installedBytes']/1e6,1),'MB installed',flush=True)
    (ROOT/'app/src/main/assets/tool-packs.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Catalog written; base must be copied to app/src/main/assets/runtime.zip for packaging.')

if __name__=='__main__':main()
