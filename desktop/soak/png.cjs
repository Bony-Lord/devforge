'use strict';
const zlib=require('node:zlib');
// Decode only screenshots produced by Page.captureScreenshot (8-bit RGB/RGBA).
// No image library or external download is needed for a small perceptual grid.
function sample(bytes,width=64,height=36){
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');let offset=8,w,h,channels,parts=[];
 while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);if(data[8]!==8||![2,6].includes(data[9])||data[12]!==0||w*h>20000000)throw Error('Unsupported screenshot PNG');channels=data[9]===6?4:3;}if(type==='IDAT')parts.push(data);offset+=length+12;if(type==='IEND')break;}
 if(!w||!h)throw Error('PNG has no dimensions');const raw=zlib.inflateSync(Buffer.concat(parts),{maxOutputLength:(w*channels+1)*h}),stride=w*channels,pixels=new Uint8Array(stride*h);
 if(raw.length!==(stride+1)*h)throw Error('Truncated screenshot PNG');
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unsupported PNG filter');for(let x=0;x<stride;x++){const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,upperLeft=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0,value=raw[y*(stride+1)+1+x];pixels[y*stride+x]=(value+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0))&255;}}
 const grid=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const px=Math.min(w-1,Math.floor((x+.5)*w/width)),py=Math.min(h-1,Math.floor((y+.5)*h/height)),index=(py*w+px)*channels;grid.push(Math.round(.2126*pixels[index]+.7152*pixels[index+1]+.0722*pixels[index+2]));}return{width:w,height:h,gridWidth:width,gridHeight:height,grid};
}
function difference(a,b){if(a.grid.length!==b.grid.length)return{changed:1,mean:255};let changed=0,total=0;for(let i=0;i<a.grid.length;i++){const d=Math.abs(a.grid[i]-b.grid[i]);total+=d;if(d>28)changed++;}return{changed:changed/a.grid.length,mean:total/a.grid.length};}
module.exports={sample,difference};
