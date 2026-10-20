const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {zipDirectory,crc32}=require('../archive.cjs');
test('ZIP exports Unicode paths and bytes, excludes cache and never overwrites an existing archive',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-zip-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'project');await fs.mkdir(source);await fs.mkdir(path.join(source,'.forge'));await fs.mkdir(path.join(source,'src'));
  const data=Buffer.from('#include <iostream>\r\n// Привет\r\n');await fs.writeFile(path.join(source,'src','пример.cpp'),data);await fs.writeFile(path.join(source,'.forge','private'),Buffer.from('cache'));
  const zip=path.join(dir,'project.zip'),result=await zipDirectory(source,zip,{exclude:new Set(['.forge'])});assert.equal(result.entries,1);const bytes=await fs.readFile(zip);assert.equal(bytes.readUInt32LE(0),0x04034b50);const size=bytes.readUInt32LE(18),nameLength=bytes.readUInt16LE(26),name=bytes.subarray(30,30+nameLength).toString();assert.equal(name,'src/пример.cpp');assert.deepEqual(zlib.inflateRawSync(bytes.subarray(30+nameLength,30+nameLength+size)),data);assert.equal(bytes.readUInt32LE(14),crc32(data));
  await assert.rejects(zipDirectory(source,zip),/EEXIST/);await assert.rejects(zipDirectory(source,path.join(source,'self.zip')),/outside source/);assert.deepEqual(await fs.readFile(zip),bytes);
});
