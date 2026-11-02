'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DashboardStore}=require('./dashboard-store.cjs'),{atomic}=require('./core.cjs');
async function createDashboard(options={}){
 const store=await new DashboardStore(options).init(),token=crypto.randomBytes(24).toString('hex'),ui=path.join(__dirname,'dashboard');let origin,server,snapshotWork,snapshotAt=0,lastSnapshot;
 const snapshot=async()=>{if(snapshotWork)return snapshotWork;if(Date.now()-snapshotAt<1000&&lastSnapshot)return lastSnapshot;snapshotWork=store.snapshot().then(value=>{lastSnapshot=value;snapshotAt=Date.now();return value;}).finally(()=>snapshotWork=null);return snapshotWork;};
 const send=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const body=async req=>{let value='';for await(const bytes of req){value+=bytes;if(Buffer.byteLength(value)>65536)throw Error('Слишком большой запрос');}return value?JSON.parse(value):{};};
 server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(req.headers.host!==new URL(origin).host)throw Error('Недоступный адрес');const url=new URL(req.url,origin),prefix='/'+token+'/';if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}if(req.headers.origin&&req.headers.origin!==origin)throw Error('Недоступный источник');const route=url.pathname.slice(prefix.length);
   if(req.method==='POST'&&req.headers.origin!==origin)throw Error('Недоступный источник');
   if(req.method==='GET'&&route==='api/health')return send(res,200,{service:'devforge.finder.dashboard/1',pid:process.pid});
   if(req.method==='GET'&&route==='api/state')return send(res,200,await snapshot());
   if(req.method==='GET'&&route==='api/catalog')return send(res,200,{suites:{general:require('./fleet.cjs').suites,vsx:require('./vsx-scenarios.cjs').suites},defaultApp:path.join(process.env.LOCALAPPDATA||'','Programs/DevForge/DevForge.exe')});
   if(req.method==='GET'&&route==='api/findings'){await snapshot();return send(res,200,store.findings({runId:url.searchParams.get('run')||undefined,kind:url.searchParams.get('kind')||undefined,review:url.searchParams.get('review')||undefined,query:url.searchParams.get('q')||'',offset:Number(url.searchParams.get('offset'))||0,limit:Number(url.searchParams.get('limit'))||80}));}
   if(req.method==='GET'&&route==='api/finding'){await snapshot();return send(res,200,await store.detail(url.searchParams.get('run'),url.searchParams.get('id')));}
   if(req.method==='GET'&&route==='api/artifact'){
    await snapshot();const artifact=await store.artifact(url.searchParams.get('run'),url.searchParams.get('path')),ext=path.extname(artifact.file).toLowerCase(),types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.log':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.jsonl':'text/plain; charset=utf-8'};
    res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");if(!types[ext])res.setHeader('Content-Disposition','attachment; filename="'+path.basename(artifact.file).replace(/[^a-z0-9_.-]/gi,'_')+'"');res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Content-Length':artifact.size,'Cache-Control':'private, max-age=30'});createReadStream(artifact.file).on('error',()=>res.destroy()).pipe(res);return;
   }
   if(req.method==='POST'&&route.startsWith('api/')){
    const input=await body(req);await snapshot();let result;
    if(route==='api/start')result=await store.launch(input);
    else if(route==='api/stop')result=await store.stop(input.runId);
    else if(route==='api/control')result=await store.control(input.runId,input.patch);
    else if(route==='api/restart')result=store.restart(input.runId,input.patch||{});
    else if(route==='api/review')result=await store.review(input.key,input);
    else if(route==='api/root')result=await store.addRoot(input.path,input.name);
    else if(route==='api/replay'){const detail=await store.detail(input.runId,input.findingId),run=store.run(input.runId);if(!detail.finding.replay)throw Error('У этой находки нет записи повтора');result=await store.launch({focus:run.state.focus||run.config.focus||'general',app:run.state.app||run.config.app,performance:'idle',hours:.25,name:'Повтор · '+detail.finding.title,maxMemoryMb:Math.max(4096,run.config.maxMemoryMb||0),workerMemoryMb:4096,maxWorkers:1,replay:{runId:input.runId,path:detail.finding.replay}});}
    else if(route==='api/shutdown'){send(res,200,{ok:true});setTimeout(()=>server.close(),100);return;}
    else throw Error('Неизвестное действие');snapshotAt=0;return send(res,200,result);
   }
   const assets={'':'index.html','index.html':'index.html','app.js':'app.js','style.css':'style.css'};if(req.method!=='GET'||!assets[route]){res.writeHead(404);res.end();return;}
   const file=assets[route];res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(await fs.readFile(path.join(ui,file)));
  }catch(error){if(!res.headersSent)send(res,400,{error:error.message});else res.destroy();}
 });
 await require('../browser-server.cjs').listenBrowserServer(server);origin='http://127.0.0.1:'+server.address().port;const url=origin+'/'+token+'/';
 return{server,store,url,origin,async close(){await new Promise(resolve=>server.close(resolve));}};
}
module.exports={createDashboard};
if(require.main===module){const data=process.argv.find(a=>a.startsWith('--data='))?.slice(7);createDashboard(data?{data}:{}).then(async app=>{await atomic(path.join(app.store.data,'server.json'),{service:'devforge.finder.dashboard/1',pid:process.pid,url:app.url,startedAt:new Date().toISOString()});console.log(app.url);const close=()=>app.server.close();process.once('SIGINT',close);process.once('SIGTERM',close);}).catch(error=>{console.error(error);process.exitCode=1;});}
