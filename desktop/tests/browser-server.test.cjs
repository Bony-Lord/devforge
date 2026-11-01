'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),http=require('node:http'),{listenBrowserServer,isBrowserPort}=require('../browser-server.cjs');
test('blocked ephemeral ports are released and retried without weakening browser policy',async()=>{
 class FakeServer extends EventEmitter{constructor(){super();this.ports=[6566,10080,55678];this.closed=0;}listen(port,host){assert.equal(host,'127.0.0.1');this.port=this.ports.shift();queueMicrotask(()=>this.emit('listening'));}address(){return {port:this.port};}close(callback){this.closed++;callback();}}
 const server=new FakeServer();assert.equal(await listenBrowserServer(server),55678);assert.equal(server.closed,2);assert.equal(server.listenerCount('error'),0);assert.equal(server.listenerCount('listening'),0);
 for(const port of [0,6566,6000,6667,10080,-1,65536,'50000'])assert.equal(isBrowserPort(port),false);
});
test('listener returns an actually bound, reachable loopback HTTP server',async t=>{
 const server=http.createServer((_req,res)=>res.end('native browser server'));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=await listenBrowserServer(server);assert(isBrowserPort(port));assert.equal(await(await fetch('http://127.0.0.1:'+port)).text(),'native browser server');
});
