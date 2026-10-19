"""Provide original copyleft sources, exact recipe snapshots and modification script.

Downloads source; does not run downloaded scripts. Upstream archives are verified
against the checksums in Termux/TUR recipes. Keep this folder alongside the APK.
"""
import concurrent.futures, hashlib, io, json, pathlib, re, sys, tarfile, urllib.request
from prepare_runtime import ROOT, CACHE, fetch, ar_members
sys.stdout.reconfigure(encoding='utf-8')
OUT=ROOT/'native-sources';OUT.mkdir(exist_ok=True)

SOURCES=[
('gcc-15','https://mirrors.kernel.org/gnu/gcc/gcc-15.2.0/gcc-15.2.0.tar.gz','7294d65cc1a0558cb815af0ca8c7763d86f7a31199794ede3f630c0d1b0a5723'),
('binutils','https://mirrors.kernel.org/gnu/binutils/binutils-2.47.tar.xz','154ab23b60070e8f27013c22977f1129425d67d1e8acd6e13010e617811e4cff'),
('libgmp','https://mirrors.kernel.org/gnu/gmp/gmp-6.3.0.tar.xz','a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898'),
('libmpfr','https://mirrors.kernel.org/gnu/mpfr/mpfr-4.2.2.tar.xz','b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01'),
('libmpc','https://mirrors.kernel.org/gnu/mpc/mpc-1.4.1.tar.xz','91204cd32f164bd3b7c992d4a6a8ce6519511aadab30f78b6982d0bf8d73e931'),
('libiconv','https://mirrors.kernel.org/gnu/libiconv/libiconv-1.19.tar.gz','88dd96a8c0464eca144fc791ae60cd31cd8ee78321e67397e25fc095c4a19aa6'),
('make','https://mirrors.kernel.org/gnu/make/make-4.4.1.tar.gz','dd16fb1d67bfab79a72f5e8390735c49e3e8e70b4945a15ab1f81ddb78658fb3'),
('zstd','https://github.com/facebook/zstd/archive/refs/tags/v1.5.7.tar.gz','37d7284556b20954e56e1ca85b80226768902e2edabd3b649e9e72c0c9012ee3'),
('liblzma','https://github.com/tukaani-project/xz/releases/download/v5.8.4/xz-5.8.4.tar.xz','4ce24038fd4221e0d13bc1a2de7a4db56e90b92b3bf75321f6c14be73f65de4b'),
('patchelf','https://github.com/NixOS/patchelf/archive/refs/tags/0.19.2.tar.gz','05e674fcc89ef3ffbd851266d063f45f13bd16facec9839a54d0095b930c6f07')]

SOURCES += [('gdb', 'https://mirrors.kernel.org/gnu/gdb/gdb-18.1.tar.xz', 'cd9fc3fe2b47743840e42c1592d3d87f8302eb18639c0b8b4ba0898002e2348f'), ('guile', 'https://mirrors.kernel.org/gnu/guile/guile-3.0.11.tar.gz', '3c9c16972a73bb792752f2e4f1cce7212d7638d5494b5f7e8e19f3819dbf3a19'), ('libunistring', 'https://mirrors.kernel.org/gnu/libunistring/libunistring-1.4.2.tar.xz', '5b46e74377ed7409c5b75e7a96f95377b095623b689d8522620927964a41499c'), ('readline', 'https://mirrors.kernel.org/gnu/readline/readline-8.3.tar.gz', 'fe5383204467828cd495ee8d1d3c037a7eba1389c22bc6a041f627976f9061cc'), ('gdbm', 'https://mirrors.kernel.org/gnu/gdbm/gdbm-1.26.tar.gz', '6a24504a14de4a744103dcb936be976df6fbe88ccff26065e54c1c47946f4a5e'), ('git', 'https://mirrors.kernel.org/pub/software/scm/git/git-2.56.0.tar.xz', '26c56c296b38c0695b26fa95f475f1d01704d2d38e73465ca30b0b2f5dc789d3'), ('less', 'https://www.greenwoodsoftware.com/less/less-710.tar.gz', 'd1008fb78dcae1323ddab664bcb352a61f022b1b131bd8018548e021d975ec7a')]

def source(item):
    package,url,sha=item
    folder=OUT/package;folder.mkdir(exist_ok=True);path=folder/url.split('/')[-1]
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=sha:
        data=fetch(url)
        if hashlib.sha256(data).hexdigest()!=sha:raise RuntimeError('Source checksum failed: '+package)
        path.write_bytes(data)
    # License texts are directly available outside the archives too.
    with tarfile.open(path) as archive:
        for m in archive:
            base=pathlib.PurePosixPath(m.name).name
            if m.isfile() and base.upper().startswith(('COPYING','LICENSE','NOTICE','COPYRIGHT')) and len(pathlib.PurePosixPath(m.name).parts)<=3:
                dest=ROOT/'licenses/upstream'/package/base
                dest.parent.mkdir(parents=True,exist_ok=True)
                if not dest.exists():dest.write_bytes(archive.extractfile(m).read())
    print('Source verified:',package,path.stat().st_size,flush=True)
    return {'package':package,'url':url,'sha256':sha,'file':str(path.relative_to(ROOT))}

def snapshot(repo):
    name=repo.replace('/','-')
    lock=OUT/(name+'.json')
    if lock.exists():entry=json.loads(lock.read_text())
    else:
        info=json.loads(fetch('https://api.github.com/repos/'+repo+'/commits?per_page=1'))
        sha=info[0]['sha'];url=f'https://codeload.github.com/{repo}/tar.gz/{sha}'
        entry={'repo':repo,'commit':sha,'url':url,'file':f'native-sources/{name}-{sha[:12]}.tar.gz'}
    path=ROOT/entry['file']
    if not path.exists():path.write_bytes(fetch(entry['url']))
    entry['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    lock.write_text(json.dumps(entry,indent=2),encoding='utf-8')
    print('Recipe snapshot:',repo,entry['commit'],flush=True)
    return entry

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        sources=list(ex.map(source,SOURCES))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        recipes=list(ex.map(snapshot,['termux/termux-packages','termux-user-repository/tur','termux-user-repository/ndk-toolchain-gcc-15']))
    lock=json.loads((ROOT/'native-packages.lock.json').read_text(encoding='utf-8'))
    # Extract installed notices unchanged, including permissive libraries.
    for p in lock['packages']:
        file=CACHE/pathlib.PurePosixPath(p['Filename']).name
        for name,data in ar_members(file.read_bytes()):
            if not name.startswith('data.tar'):continue
            with tarfile.open(fileobj=io.BytesIO(data)) as t:
                for m in t:
                    base=pathlib.PurePosixPath(m.name).name
                    if m.isfile() and '/share/doc/' in m.name and base.lower().startswith(('copying','license','notice','copyright','authors')):
                        dest=ROOT/'licenses/native'/p['Package']/base;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(t.extractfile(m).read())
    # Readline 8.3.6 is the 8.3 source plus six upstream patches.
    recipe=ROOT/'work/readline-build.sh'
    recipe.parent.mkdir(parents=True,exist_ok=True)
    recipe.write_bytes(fetch('https://raw.githubusercontent.com/termux/termux-packages/'+recipes[0]['commit']+'/packages/readline/build.sh'))
    for number,sha in re.findall(r'PATCH_CHECKSUMS\[(\d+)\]=([a-f0-9]{64})',recipe.read_text()):
        if int(number)>6:continue
        url='https://mirrors.kernel.org/gnu/readline/readline-8.3-patches/readline83-'+number
        path=OUT/'readline/patches'/('readline83-'+number);path.parent.mkdir(parents=True,exist_ok=True)
        data=path.read_bytes() if path.exists() else fetch(url)
        assert hashlib.sha256(data).hexdigest()==sha
        path.write_bytes(data)
        sources.append({'package':'readline-patch-'+number,'url':url,'sha256':sha,'file':str(path.relative_to(ROOT))})
    (OUT/'sources.lock.json').write_text(json.dumps({'archives':sources,'recipes':recipes},indent=2),encoding='utf-8')
    (OUT/'README.md').write_text('''# Corresponding native sources

This directory accompanies GCC-CPP-Studio-arm64.apk. Original GNU/copyleft source archives
are provided here, with SHA256 values and source URLs in sources.lock.json.
Full Termux and TUR recipe/build-system snapshots include downstream patches and
configuration. The NDK GCC 15 toolchain snapshot provides the compiler build route.
The original authors and licenses remain in ../licenses and in the archives.

Forge modifications: tools/prepare_runtime.py relocates equal-length app prefixes,
prunes optional tools/development files and adds a libc++ convenience header and a
system-shell symlink. The exact binary packages are in native-packages.lock.json.
Run `python tools/prepare_runtime.py --locked` to reproduce the runtime archive from
those exact original package checksums. No proprietary CLion/JetBrains source or
assets were copied. Java/JavaScript host code is available in ../app.

Build original toolchains using the included upstream build instructions/recipes
on a supported Linux build host; Forge's binary relocation is then applied by the
included script. LGPL libraries are dynamically linked; replacement/relinking is
possible by rebuilding the runtime. No technical restriction on modified builds.
''',encoding='utf-8')
