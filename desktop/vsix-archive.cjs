'use strict';
// File-backed ZIP/ZIP64 reader: large language-server binaries never need to be
// inflated into a single JS buffer. CRC and byte counts are checked as they flow.
const fs=require('node:fs/promises'),streams=require('node:fs'),path=require('node:path'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises'),yauzl=require('yauzl');
const {inside}=require('./workspace.cjs');
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
class Verify extends Transform{
 constructor(entry){super();this.entry=entry;this.crc=0xffffffff;this.bytes=0;}
 _transform(chunk,_encoding,done){this.bytes+=chunk.length;if(this.bytes>this.entry.uncompressedSize)return done(Error('VSIX entry exceeds its declared size'));for(const byte of chunk)this.crc=table[(this.crc^byte)&255]^(this.crc>>>8);done(null,chunk);}
 _flush(done){done(this.bytes!==this.entry.uncompressedSize||((this.crc^0xffffffff)>>>0)!==this.entry.crc32?Error('VSIX checksum or size mismatch'):null);}
}
class VSIXArchive{
 static async open(file,{availableBytes=Number.MAX_SAFE_INTEGER}={}){
  const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,autoClose:false,strictFileNames:true,validateEntrySizes:true},(error,zip)=>error?reject(error):resolve(zip))),archive=new VSIXArchive(zip);let total=0;const seen=new Set();
  try{await new Promise((resolve,reject)=>{zip.on('error',reject);zip.on('entry',entry=>{try{const name=entry.fileName,parts=name.replace(/\/$/,'').split('/'),kind=(entry.externalFileAttributes>>>16)&0o170000;if(parts.some(p=>!p||p==='..'||p==='.'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))||name.startsWith('/')||name.includes('\\')||kind===0o120000||entry.generalPurposeBitFlag&1)throw Error('Unsafe Windows VSIX entry: '+name);const key=name.replace(/\/$/,'').toLowerCase();if(seen.has(key))throw Error('Duplicate Windows VSIX entry: '+name);seen.add(key);total+=entry.uncompressedSize;if(!Number.isSafeInteger(total)||total>availableBytes)throw Error('Not enough disk space to extract this extension');archive.entries.set(name,entry);zip.readEntry();}catch(error){reject(error);}});zip.once('end',resolve);zip.readEntry();});archive.expandedBytes=total;return archive;}catch(error){zip.close();throw error;}
 }
 constructor(zip){this.zip=zip;this.entries=new Map();}
 async stream(name){const entry=this.entries.get(name);if(!entry)throw Error('VSIX data file missing: '+name);const stream=await new Promise((resolve,reject)=>this.zip.openReadStream(entry,(error,stream)=>error?reject(error):resolve(stream)));return{stream,verify:new Verify(entry)};}
 async read(name,{maxBytes=8*1024*1024}={}){const entry=this.entries.get(name);if(!entry)throw Error('VSIX data file missing: '+name);if(entry.uncompressedSize>maxBytes)throw Error('VSIX manifest is too large to parse');const chunks=[],{stream,verify}=await this.stream(name);await pipeline(stream,verify,async source=>{for await(const chunk of source)chunks.push(chunk);});return Buffer.concat(chunks).toString('utf8');}
 async extract(destination){const root=path.resolve(destination);if((await fs.lstat(root)).isSymbolicLink())throw Error('VSIX destination is a link');for(const[name,entry]of this.entries){if(!name.startsWith('extension/')||name.endsWith('/'))continue;const target=path.resolve(root,name.slice(10));if(!inside(target,root)||target===root)throw Error('VSIX extraction escaped its directory');await fs.mkdir(path.dirname(target),{recursive:true});const {stream,verify}=await this.stream(name);await pipeline(stream,verify,streams.createWriteStream(target,{flags:'wx',mode:0o600}));}return this.expandedBytes;}
 close(){this.zip.close();}
}
module.exports={VSIXArchive};
