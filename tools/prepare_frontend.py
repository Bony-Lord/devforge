"""Bundle the ISC-licensed yaml parser while preserving config comments/unknown keys."""
import base64, hashlib, io, json, pathlib, platform, subprocess, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'work/frontend';CACHE.mkdir(parents=True,exist_ok=True)

def package(name,version):
    meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+name+'/'+version))
    data=urllib.request.urlopen(meta['dist']['tarball']).read()
    digest=base64.b64encode(hashlib.sha512(data).digest()).decode()
    assert meta['dist']['integrity']=='sha512-'+digest
    folder=CACHE/name.replace('/','-').replace('@','');folder.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for item in archive:
            if not item.isfile() or not item.name.startswith('package/'):continue
            target=folder/item.name[len('package/'):]
            assert target.resolve().is_relative_to(folder.resolve())
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile(item).read())
    return folder,{'name':name,'version':version,'license':meta['license'],'url':meta['dist']['tarball'],'integrity':meta['dist']['integrity'],'sha256':hashlib.sha256(data).hexdigest()}

yaml,lock=package('yaml','2.9.1')
osname={'Windows':'win32','Linux':'linux','Darwin':'darwin'}[platform.system()]
arch='arm64' if platform.machine().lower() in ['arm64','aarch64'] else 'x64'
esbuild,buildlock=package('@esbuild/'+osname+'-'+arch,'0.25.11')
exe=esbuild/('esbuild.exe' if osname=='win32' else 'bin/esbuild');exe.chmod(0o755)
out=ROOT/'app/src/main/assets/ui/vendor/yaml.js';out.parent.mkdir(exist_ok=True)
subprocess.run([str(exe),str(yaml/'browser/index.js'),'--bundle','--minify','--format=iife','--global-name=StudioYAML','--outfile='+str(out)],check=True)
(ROOT/'licenses/yaml-LICENSE').write_bytes((yaml/'LICENSE').read_bytes())
(ROOT/'frontend-vendor.lock.json').write_text(json.dumps({'runtime':[lock],'buildTool':[buildlock]},indent=2),encoding='utf-8')
print('Bundled yaml',lock['version'],out.stat().st_size,'bytes')
