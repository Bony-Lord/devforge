'use strict';
// HTTP(S) restricted ports from Chromium net/base/port_util.cc, checked 2026-11-01:
// https://chromium.googlesource.com/chromium/src/+/main/net/base/port_util.cc
// Windows may have a customized ephemeral range that contains these ports.
const restricted=new Set([0,1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
const isBrowserPort=port=>Number.isInteger(port)&&port>0&&port<=65535&&!restricted.has(port);
async function listenBrowserServer(server){
 for(let attempt=0;attempt<64;attempt++){
  const port=attempt<32?0:require('node:crypto').randomInt(49152,65536);
  try{await new Promise((resolve,reject)=>{const error=value=>{server.removeListener('listening',ready);reject(value);},ready=()=>{server.removeListener('error',error);resolve();};server.once('error',error);server.once('listening',ready);server.listen(port,'127.0.0.1');});}
  catch(error){if(['EADDRINUSE','EACCES'].includes(error.code))continue;throw error;}
  if(isBrowserPort(server.address().port))return server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
 throw Error('No browser-compatible loopback port is available');
}
module.exports={listenBrowserServer,isBrowserPort};
