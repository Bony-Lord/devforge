const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace,encode,decode,templates,inside}=require('../workspace.cjs');
test('atomic profile writes tolerate temporary Windows locks and preserve the old file on failure',async t=>{
  const {atomic}=require('../workspace.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpp-studio-atomic-')),file=path.join(dir,'addons.json'),rename=fs.rename;
  t.after(async()=>{fs.rename=rename;await fs.rm(dir,{recursive:true,force:true});});await fs.writeFile(file,'old');let attempts=0;
  fs.rename=async(...args)=>{if(args[1]===file&&attempts++<2){assert.equal(await fs.readFile(file,'utf8'),'old');throw Object.assign(Error('locked'),{code:'EPERM'});}return rename(...args);};
  await atomic(file,'new');assert.equal(attempts,3);assert.equal(await fs.readFile(file,'utf8'),'new');assert.deepEqual(await fs.readdir(dir),['addons.json']);
  fs.rename=async(...args)=>{if(args[1]===file)throw Object.assign(Error('denied'),{code:'EPERM'});return rename(...args);};
  await assert.rejects(atomic(file,'lost'),{code:'EPERM'});assert.equal(await fs.readFile(file,'utf8'),'new');assert.deepEqual(await fs.readdir(dir),['addons.json']);
});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpp-studio-workspace-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const ws=await new Workspace(dir).init();await ws.newProject('fixture');return ws;}
test('lossless encodings preserve BOM, Cyrillic and reject destructive conversions',()=>{
  for(const encoding of ['UTF-8','UTF-8-BOM','UTF-16LE','UTF-16BE','windows-1251','KOI8-R']){const bytes=encode('Привет, C++\r\n',encoding,encoding.startsWith('UTF-16'));const decoded=decode(bytes,encoding);assert.equal(decoded.text,'Привет, C++\r\n');assert.deepEqual(encode(decoded.text,encoding,decoded.bom),bytes);}
  assert.throws(()=>encode('Привет','US-ASCII'),/Cannot encode/);assert.throws(()=>decode(Buffer.from([0xff]),'UTF-8'),/Cannot decode/);
});
test('saves are atomic, history survives and external edits cannot be overwritten',async t=>{
  const ws=await fixture(t),file=path.join(ws.root,'main.cpp');await ws.read(file);await ws.write(file,'int main(){return 1;}');assert.match((await ws.history(file))[0].text,/Hello/);
  await fs.writeFile(file,'// externally changed\n');await assert.rejects(ws.write(file,'// stale buffer'),/changed outside/);assert.equal(await fs.readFile(file,'utf8'),'// externally changed\n');
  await ws.read(file);await ws.write(file,'// reopened and saved\n');assert.equal(await fs.readFile(file,'utf8'),'// reopened and saved\n');
});
test('long project paths keep bounded history names and retain old history records',async t=>{
 const ws=await fixture(t),relative='long-project-folder-'.repeat(5)+'/source-file-with-long-name.cpp',file=await ws.writable(relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'original');await ws.read(file);await ws.write(file,'changed');assert(path.basename(ws.historyDir(file)).length<=80);assert((await ws.history(file)).some(r=>r.text==='original'));
 const short=path.join(ws.root,'main.cpp'),legacy=path.join(ws.cache,'history',Buffer.from(require('../workspace.cjs').key(short)).toString('base64url'));await fs.mkdir(legacy,{recursive:true});await fs.writeFile(path.join(legacy,'legacy.json'),JSON.stringify({text:'legacy record',time:1}));await ws.read(short);await ws.write(short,'new history');const records=await ws.history(short);assert(records.some(r=>r.text==='legacy record'));assert(records.some(r=>r.text.includes('Hello')));
});
test('project containment rejects traversal and junction/symlink escapes',async t=>{
  const ws=await fixture(t);await assert.rejects(ws.writable('../private.txt'),/outside project/);await assert.rejects(ws.writable(ws.root),/outside project/);
  const outside=path.join(ws.data,'outside');await fs.mkdir(outside);const link=path.join(ws.root,'escape');await fs.symlink(outside,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(ws.writable(path.join(link,'secret.cpp')),/outside project/);assert.ok(!(await ws.tree()).some(e=>e.name==='escape'));
});
test('inline creation resolves collisions, moves preserve encoding and templates never overwrite',async t=>{
  const ws=await fixture(t),a=await ws.createItem({kind:'cpp'}),b=await ws.createItem({kind:'cpp'});assert.notEqual(a.path,b.path);
  const dir=await ws.createItem({kind:'folder'});await ws.read(a.path);await ws.write(a.path,'Привет','windows-1251');const moved=await ws.move(a.path,path.join(dir.path,'renamed.cpp'));assert.equal((await ws.read(moved)).text,'Привет');assert.equal(ws.prefs.encodings[moved],'windows-1251');
  await ws.createTemplate({kind:'class',name:'model/Node',namespace:'demo'});await assert.rejects(ws.createTemplate({kind:'class',name:'model/Node'}),/already exists/);assert.match(await fs.readFile(path.join(ws.root,'model/Node.cpp'),'utf8'),/namespace demo/);
  assert.throws(()=>templates('cpp','C:/escape'));assert.throws(()=>templates('class','../Bad'));assert.ok(inside(moved,ws.root));
});
