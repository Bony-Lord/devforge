'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{trimLocales}=require('../package-content.cjs');
test('Windows/Linux paks and macOS lproj translations are trimmed without touching code, licenses or external links',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-package-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const root=path.join(folder,'payload');await fs.mkdir(path.join(root,'locales'),{recursive:true});
  for(const name of ['en-US.pak','ru.pak','de.pak'])await fs.writeFile(path.join(root,'locales',name),'data');
  for(const name of ['en.lproj','en_GB.lproj','ru.lproj','fr.lproj']){await fs.mkdir(path.join(root,'framework',name),{recursive:true});await fs.writeFile(path.join(root,'framework',name,'strings'),'data');}
  await fs.writeFile(path.join(root,'LICENSES.chromium.html'),'notices');await fs.writeFile(path.join(root,'program.pak'),'code');const outside=path.join(folder,'external');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'private.txt'),'retained');await fs.symlink(outside,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
  const result=await trimLocales(root);assert.equal(result.bytes,8);assert.equal(result.removed.length,2);for(const name of ['en-US.pak','ru.pak'])await fs.access(path.join(root,'locales',name));assert.equal(await fs.readFile(path.join(outside,'private.txt'),'utf8'),'retained');await fs.access(path.join(root,'LICENSES.chromium.html'));await fs.access(path.join(root,'program.pak'));assert.equal((await trimLocales(root)).bytes,0);
});
