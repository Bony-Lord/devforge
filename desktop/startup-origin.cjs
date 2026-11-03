'use strict';
// A stable, profile-private loopback origin lets Chromium reuse validated code
// caches. It is not an API credential: IPC still trusts only this window's frame,
// and the remote extension agent keeps its own fresh connection token.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{atomic}=require('./workspace.cjs'),{isBrowserPort}=require('./browser-server.cjs');
async function readOrigin(profile){let data;try{data=JSON.parse(await fs.readFile(path.join(profile,'desktop-origin.json'),'utf8'));}catch(error){if(!['ENOENT'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
 return {token:typeof data?.token==='string'&&/^[a-f0-9]{48}$/.test(data.token)?data.token:crypto.randomBytes(24).toString('hex'),port:isBrowserPort(data?.port)?data.port:0};
}
async function saveOrigin(profile,{token,port}){if(!/^[a-f0-9]{48}$/.test(token)||!isBrowserPort(port))throw Error('Invalid loopback origin');await atomic(path.join(profile,'desktop-origin.json'),JSON.stringify({version:1,token,port})+'\n');}
function staticCacheHeaders(stat){return {'Cache-Control':'no-cache','ETag':`W/"${stat.size}-${stat.mtimeMs}"`,'Last-Modified':stat.mtime.toUTCString()};}
module.exports={readOrigin,saveOrigin,staticCacheHeaders};
