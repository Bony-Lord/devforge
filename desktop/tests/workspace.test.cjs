const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace,encode,decode,templates,inside}=require('../workspace.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpp-studio-workspace-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return new Workspace(dir).init();}
test('lossless encodings preserve BOM, Cyrillic and reject destructive conversions',()=>{
  for(const encoding of ['UTF-8','UTF-8-BOM','UTF-16LE','UTF-16BE','windows-1251','KOI8-R']){const bytes=encode('Привет, C++\r\n',encoding,encoding.startsWith('UTF-16'));const decoded=decode(bytes,encoding);assert.equal(decoded.text,'Привет, C++\r\n');assert.deepEqual(encode(decoded.text,encoding,decoded.bom),bytes);}
  assert.throws(()=>encode('Привет','US-ASCII'),/Cannot encode/);assert.throws(()=>decode(Buffer.from([0xff]),'UTF-8'),/Cannot decode/);
});
test('saves are atomic, history survives and external edits cannot be overwritten',async t=>{
  const ws=await fixture(t),file=path.join(ws.root,'main.cpp');await ws.read(file);await ws.write(file,'int main(){return 1;}');assert.match((await ws.history(file))[0].text,/Hello/);
  await fs.writeFile(file,'// externally changed\n');await assert.rejects(ws.write(file,'// stale buffer'),/changed outside/);assert.equal(await fs.readFile(file,'utf8'),'// externally changed\n');
  await ws.read(file);await ws.write(file,'// reopened and saved\n');assert.equal(await fs.readFile(file,'utf8'),'// reopened and saved\n');
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
