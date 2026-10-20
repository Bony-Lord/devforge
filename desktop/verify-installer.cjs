'use strict';
// CI installs the actual Windows wizard payload into a fresh per-user directory.
// Linux/macOS validate native package contents without changing the host OS.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {capture}=require('./tooling.cjs');const {version}=require('./package.json');
async function main(){
  const output=path.resolve(__dirname,'../work/ci-desktop-installed'),dist=path.join(__dirname,'dist/installers');await fs.mkdir(output,{recursive:true});
  const run=async(exe,args,options={})=>{const r=await capture(exe,args,{timeout:240000,...options});if(r.code)throw Error([exe,r.code,r.text,r.error].join('\n'));return r.text;};
  if(process.platform==='win32'){
    if(!process.env.CI&&!process.argv.includes('--local'))throw Error('Use --local only for an explicitly authorized local installer check');
    const destination=path.join(output,'application');await fs.mkdir(destination,{recursive:false});
    await run(path.join(dist,`Cpp-Studio-${version}-win-${process.arch}-setup.exe`),['/S','/currentuser','/NODESKTOPSHORTCUT','/D='+destination]);
    await fs.access(path.join(destination,'resources/app/project-config.cjs'));await run(path.join(destination,'CppStudio.exe'),['--smoke','--data-dir='+path.join(output,'data')]);
  }else if(process.platform==='linux'){
    const deb=path.join(dist,`Cpp-Studio-${version}-linux-${process.arch}-setup.deb`);await run('dpkg-deb',['--extract',deb,path.join(output,'payload')]);await run('dpkg-deb',['--control',deb,path.join(output,'control')]);
    const entries=await fs.readdir(path.join(output,'payload/opt'));assert.equal(entries.length,1);const payload=path.join(output,'payload/opt',entries[0]);await fs.access(path.join(payload,'resources/app/project-config.cjs'));await fs.access(path.join(payload,'LICENSES.chromium.html'));
    const postinst=await fs.readFile(path.join(output,'control/postinst'),'utf8');assert.match(postinst,/chrome-sandbox/);assert.match(postinst,/4755/);
    await fs.writeFile(path.join(output,'package-inspection.json'),JSON.stringify({package:deb,extracted:true,installed:false,payload},null,2));
  }else{
    const pkg=path.join(dist,`Cpp-Studio-${version}-mac-${process.arch}-setup.pkg`);await run('/usr/sbin/pkgutil',['--expand-full',pkg,path.join(output,'expanded')]);const listing=await run('/usr/sbin/pkgutil',['--payload-files',pkg]);assert.match(listing,/C\+\+ Studio.app/);assert.match(listing,/project-config.cjs/);assert.match(listing,/LICENSES.chromium.html/);
    await fs.writeFile(path.join(output,'package-inspection.json'),JSON.stringify({package:pkg,expanded:true,installed:false},null,2));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
