'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {inside}=require('./workspace.cjs');
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buffer){let n=0xffffffff;for(const byte of buffer)n=table[(n^byte)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
async function zipDirectory(folder,destination,{exclude=new Set(),maxBytes=1024*1024*1024,preserveSymlinks=false}={}){
  folder=await fs.realpath(folder);if(inside(destination,folder))throw Error('Archive destination must be outside source folder');
  const handle=await fs.open(destination,'wx'),central=[];let offset=0,total=0,entries=0;
  const write=async buffer=>{let at=0;while(at<buffer.length){const {bytesWritten}=await handle.write(buffer,at,buffer.length-at);if(!bytesWritten)throw Error('ZIP write failed');at+=bytesWritten;}offset+=buffer.length;};
  const walk=async(directory,prefix='')=>{
    for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.isSymbolicLink()&&!preserveSymlinks)continue;if(exclude.has(entry.name))continue;const file=path.join(directory,entry.name),relative=prefix+entry.name;
      if(entry.isDirectory()){await walk(file,relative+'/');continue;}if(!entry.isFile()&&!entry.isSymbolicLink())continue;
      const stat=await fs.lstat(file);total+=stat.size;if(total>maxBytes||stat.size>0xffffffff||entries>=65535)throw Error('ZIP size limit exceeded');
      if(entry.isSymbolicLink()&&!inside(await fs.realpath(file),folder))throw Error('Package symlink outside bundle');
      const data=entry.isSymbolicLink()?Buffer.from(await fs.readlink(file)):await fs.readFile(file),deflated=zlib.deflateRawSync(data,{level:6}),name=Buffer.from(relative),crc=crc32(data),start=offset;
      const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(deflated.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);await write(header);await write(name);await write(deflated);
      const directoryHeader=Buffer.alloc(46);directoryHeader.writeUInt32LE(0x02014b50);directoryHeader.writeUInt16LE(0x314,4);directoryHeader.writeUInt16LE(20,6);directoryHeader.writeUInt16LE(0x800,8);directoryHeader.writeUInt16LE(8,10);directoryHeader.writeUInt16LE(33,14);directoryHeader.writeUInt32LE(crc,16);directoryHeader.writeUInt32LE(deflated.length,20);directoryHeader.writeUInt32LE(data.length,24);directoryHeader.writeUInt16LE(name.length,28);directoryHeader.writeUInt32LE(((stat.mode&0xffff)<<16)>>>0,38);directoryHeader.writeUInt32LE(start,42);central.push(directoryHeader,name);entries++;
    }
  };
  try{await walk(folder);const start=offset;for(const bytes of central)await write(bytes);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries,8);end.writeUInt16LE(entries,10);end.writeUInt32LE(offset-start,12);end.writeUInt32LE(start,16);await write(end);return{entries,bytes:offset,sourceBytes:total};}
  catch(error){await handle.close();await fs.rm(destination,{force:true});throw error;}finally{try{await handle.close();}catch{}}
}
module.exports={zipDirectory,crc32};
