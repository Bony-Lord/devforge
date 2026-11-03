'use strict';
const {app,BrowserWindow,ipcMain,session,dialog,shell,nativeTheme,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {DesktopHost}=require('./host.cjs');
const {inside}=require('./workspace.cjs');
const {projectsOverlap}=require('./workspace-descriptor.cjs');
const build=require('./build-flavor.cjs').readBuildInfo(__dirname,{packaged:app.isPackaged});
let stores,codeoss,codeossStorage,codeossUserData;const openWindows=new Set(),openingProjects=new Set();
const {WindowStore}=require('./window-store.cjs');
const smoke=process.argv.includes('--smoke');
const headless=process.argv.includes('--headless-check');
const codeossEnabled=process.platform==='win32'&&!process.argv.includes('--legacy-editor');
if(headless){const port=process.argv.find(a=>a.startsWith('--cdp-port='))?.slice(11)||'9333';if(!/^[0-9]{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('Invalid test CDP port');app.commandLine.appendSwitch('remote-debugging-port',port);}
const dataArg=process.argv.find(a=>a.startsWith('--data-dir='));
app.setName(build.productName);
app.setAppUserModelId(build.appId);
if(build.debug)app.setPath('userData',path.join(app.getPath('appData'),build.profileName));
if(dataArg)app.setPath('userData',path.resolve(dataArg.slice('--data-dir='.length)));
// A profile must have one writer process. Project windows share WindowStore in
// that process; a repeated shortcut launch just focuses its existing window.
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const diagnostics=primaryInstance&&build.debug?new(require('./debug-diagnostics.cjs').DebugDiagnostics)(require('electron'),build,app.getPath('userData')):null;
if(diagnostics){app.setPath('crashDumps',path.join(diagnostics.directory,'crashes'));require('electron').crashReporter.start({productName:build.productName,submitURL:'',uploadToServer:false,compress:true});}
app.on('second-instance',()=>{const window=BrowserWindow.getFocusedWindow()||[...openWindows].find(r=>!r.window.isDestroyed())?.window;if(window){if(window.isMinimized())window.restore();if(!headless&&!smoke)window.show();window.focus();}});
const ui=path.join(__dirname,'ui');
const sourceUi=path.join(__dirname,'../app/src/main/assets/ui');
async function openWindow(project,initial=false,readOnly=false){
let reserved=false;
let window,host,server,origin,base,quitting=false,record;const extensionCallbacks=new Map();
function trusted(sender,frame){try{return window&&!window.isDestroyed()&&sender===window.webContents&&frame&&!frame.detached&&frame===sender.mainFrame&&frame.url.startsWith(base);}catch{return false;}}
async function serve(){
  const root=await fs.realpath(await fs.access(ui).then(()=>ui,()=>sourceUi)),savedOrigin=initial?await require('./startup-origin.cjs').readOrigin(app.getPath('userData')):null,token=savedOrigin?.token||crypto.randomBytes(24).toString('hex');
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm'};
  server=http.createServer(async(req,res)=>{
    try{
      const callbackUrl=new URL(req.url,origin),callbackPrefix=new URL(base).pathname+'_extension-callback/';
      if(req.headers.host===new URL(origin).host&&callbackUrl.pathname.startsWith(callbackPrefix)){
        const id=callbackUrl.pathname.slice(callbackPrefix.length),pending=extensionCallbacks.get(id);if(!pending||pending.expires<Date.now())throw Error('Invalid extension callback');
        if(req.method==='POST'){
          if(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json'))throw Error('Denied');let body='';for await(const bytes of req){body+=bytes;if(body.length>32768)throw Error('Callback exceeds limit');}const payload=JSON.parse(body);if(typeof payload.fragment!=='string'||payload.fragment.length>16384)throw Error('Invalid callback fragment');
          extensionCallbacks.delete(id);const query=new URLSearchParams(pending.components.query||'');for(const[key,value]of callbackUrl.searchParams)query.append(key,value);window.webContents.send('studio:event','codeossCallback',{...pending.components,query:query.toString(),fragment:payload.fragment||pending.components.fragment});res.end('OK');return;
        }
        if(req.method!=='GET')throw Error('Denied');const nonce=crypto.randomBytes(16).toString('hex');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'");
        res.end('<!doctype html><meta charset="utf-8"><title>DevForge</title><body style="background:#1e1e1e;color:#d4d4d4;font:16px system-ui;padding:3rem"><p id="status">DevForge…</p><script nonce="'+nonce+'">fetch(location.href,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fragment:location.hash.slice(1)})}).then(r=>{if(!r.ok)throw Error(r.status);document.getElementById("status").textContent="DevForge — можно закрыть эту вкладку. You can close this tab.";history.replaceState(null,"",location.pathname);}).catch(()=>document.getElementById("status").textContent="Не удалось передать ответ в DevForge / Callback failed");</script>');return;
      }
      const requestUrl=new URL(req.url,'http://'+req.headers.host),webview=/^[a-z0-9-]+\.localhost$/.test(requestUrl.hostname)&&requestUrl.port===new URL(origin).port;
      if(!['GET','HEAD'].includes(req.method)||!webview&&(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))throw Error('Denied');
      const url=new URL(req.url,origin);if(!url.pathname.startsWith('/'+token+'/'))throw Error('Denied');
      const relative=decodeURIComponent(url.pathname.slice(token.length+2))||'index.html';
      if(!build.debug&&(relative==='debug-tools.js'||relative.endsWith('.map')))throw Error('Debug asset is not available in Release');
      if(webview&&!/^vendor\/codeoss\/assets\//.test(relative))throw Error('Denied');
      if(relative.startsWith('_codeoss/')){if(!codeoss?.info)throw Error('Agent is not running');const target=new URL('http://'+codeoss.info.authority+'/'+relative.slice(9)+url.search),headers={...req.headers,host:target.host};delete headers.origin;const upstream=http.request(target,{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.statusCode=502;res.end('Extension agent unavailable');});req.pipe(upstream);return;}
      let stat,file;try{file=await fs.realpath(path.resolve(root,relative));}catch{}let cached=null;if(file){if(!inside(file,root)||!(stat=await fs.stat(file)).isFile())throw Error('Denied');}else{cached=await host?.optionalAssets.read(relative);if(!cached)throw Error('Not found');}
      res.setHeader('Content-Type',types[path.extname(relative)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      const extensionWorker=/^vendor\/codeoss\/assets\/(?:webWorkerExtensionHostIframe-[a-zA-Z0-9_-]+\.html|extensionHost\.worker-[a-zA-Z0-9_-]+\.js)$/.test(relative);
      res.setHeader('Content-Security-Policy',webview?"frame-ancestors 'self' "+origin:extensionWorker?"default-src 'none'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data: https:; connect-src 'self' data: https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; worker-src 'self' blob: data:; frame-ancestors 'self'":"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'self' blob: data: http://*.localhost:"+new URL(origin).port+"; form-action 'none'");
      if(stat&&relative!=='index.html'){const headers=require('./startup-origin.cjs').staticCacheHeaders(stat);for(const[name,value]of Object.entries(headers))res.setHeader(name,value);if(req.headers['if-none-match']===headers.ETag){res.statusCode=304;res.end();return;}}else res.setHeader('Cache-Control','no-store');
      if(req.method==='HEAD')res.end();else{let content=cached||await fs.readFile(file);if(relative==='index.html'){const locale=host?.ws.prefs.settings.language||app.getLocale(),language=String(locale).toLowerCase().startsWith('ru')?'ru':'en';content=content.toString('utf8').replace('<head>','<head><script>window.STUDIO_BOOT_LANGUAGE='+JSON.stringify(language)+';</script>');if(codeossEnabled)content=content.replace('</head>','<link rel="modulepreload" href="vendor/codeoss/codeoss.js">'+(language==='ru'?'<link rel="modulepreload" href="vendor/codeoss/ru.js">':'')+'</head>');if(build.debug)content=content.replace('</body>','<script src="debug-tools.js" defer></script></body>');}res.end(content);}
    }catch{if(smoke)console.error('Missing UI asset: '+String(req.url).replace('/'+token+'/',''));res.statusCode=404;res.end('Not found');}
  });
  server.on('upgrade',(req,socket,head)=>{try{const url=new URL(req.url,origin);if(!codeoss?.info||req.headers.host!==new URL(origin).host||req.headers.origin!==origin||!url.pathname.startsWith('/'+token+'/_codeoss/'))throw Error('Denied');const target=new URL('http://'+codeoss.info.authority+'/'+url.pathname.slice(token.length+11)+url.search),headers={...req.headers,host:target.host};delete headers.origin;const upstream=http.request(target,{headers});upstream.on('upgrade',(response,agent,agentHead)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(agentHead.length)socket.write(agentHead);if(head.length)agent.write(head);socket.pipe(agent);agent.pipe(socket);socket.on('error',()=>agent.destroy());agent.on('error',()=>socket.destroy());socket.on('close',()=>agent.destroy());});upstream.on('error',()=>socket.destroy());upstream.end();}catch{socket.destroy();}});
  const port=await require('./browser-server.cjs').listenBrowserServer(server,{preferredPort:savedOrigin?.port});if(initial)await require('./startup-origin.cjs').saveOrigin(app.getPath('userData'),{token,port});origin='http://127.0.0.1:'+server.address().port;base=origin+'/'+token+'/';return base+'index.html';
}
async function start(){
  const overlaps=id=>project&&projectsOverlap(stores.global.projects[project],stores.global.projects[id]);
  const existing=project&&[...openWindows].find(r=>overlaps(r.host.ws.prefs.current)&&!r.host.ws.projectReadOnly);if((existing||[...openingProjects].some(overlaps))&&!readOnly)return{conflict:true};if(project&&!readOnly){openingProjects.add(project);reserved=true;}
  const page=await serve();const workspace=await stores.workspace(project,initial,readOnly);
  host=await new DesktopHost(app.getPath('userData'),(type,data)=>{if(window&&!window.isDestroyed())window.webContents.send('studio:event',type,data);},{
    workspace,projectsDirectory:smoke||process.argv.includes('--isolated')?undefined:path.join(app.getPath('documents'),build.profileName),
    pythonRuntimeInUse:directory=>[...openWindows].some(r=>r.host!==host&&[r.host.python.kernel,r.host.pythonIntelligence.child,r.host.tools.execution].some(child=>child?.spawnfile&&inside(path.resolve(child.spawnfile),directory))),openProjectWindow:(id,readOnly)=>openWindow(id,false,readOnly),projectInUse:id=>[...openWindows].some(r=>r.host!==host&&projectsOverlap(stores.global.projects[id],stores.global.projects[r.host.ws.prefs.current])),projectEditingElsewhere:id=>[...openWindows].some(r=>r.host!==host&&!r.host.ws.projectReadOnly&&projectsOverlap(stores.global.projects[id],stores.global.projects[r.host.ws.prefs.current])),
    workspaceFoldersInUse:folders=>[...openWindows].some(r=>r.host!==host&&!r.host.ws.projectReadOnly&&projectsOverlap({workspaceFile:'pending',workspaceFolders:folders},stores.global.projects[r.host.ws.prefs.current])),
    workspaceTargetInUse:descriptor=>[...openWindows].some(r=>r.host!==host&&!r.host.ws.projectReadOnly&&projectsOverlap({workspaceFile:descriptor.file,workspaceFolders:descriptor.folders},stores.global.projects[r.host.ws.prefs.current])),
    transferWorkspaceStorage:async d=>{codeossStorage||=new(require('./codeoss-storage.cjs').CodeOSSStorage)(app.getPath('userData'),value=>{for(const record of openWindows)if(!record.window.isDestroyed())record.window.webContents.send('studio:event','codeossStorageChanged',value);},require('electron').safeStorage);return codeossStorage.transferWorkspace(d);},
    chooseWorkspaceSave:async current=>{const result=await dialog.showSaveDialog(window,{title:host.ws.prefs.settings.language==='en'?'Save workspace as…':'Сохранить рабочую область как…',defaultPath:current||path.join(app.getPath('documents'),'workspace.code-workspace'),filters:[{name:'VS Code workspace',extensions:['code-workspace']}],properties:['showOverwriteConfirmation','createDirectory']});return result.canceled?null:result.filePath;},
    reducedMotion:()=>nativeTheme.prefersReducedMotion,
    codeossInfo:async()=>{codeoss||=new(require('./codeoss-server.cjs').CodeOSSServer)(app.getPath('userData'),{logLevel:build.debug?'debug':'warn',onLog:diagnostics?text=>diagnostics.log.write('extension-agent',{message:text}):undefined});const info=await codeoss.start();return{...info,authority:new URL(origin).host,serverBasePath:'/'+new URL(base).pathname.split('/')[1]+'/_codeoss',callbackBase:base+'_extension-callback/',webviewDomain:'http://{{uuid}}.localhost:'+new URL(origin).port,enabled:codeossEnabled};},
    codeossEnabled:()=>codeossEnabled,
    codeossExternal:async url=>{const value=new URL(url);if(!['http:','https:','mailto:'].includes(value.protocol))throw Error('Unsupported external URL protocol');await shell.openExternal(value.href);return true;},
    codeossCallback:d=>{if(!/^[a-f0-9-]{36}$/.test(d.id)||!d.components||!['authority','path','query','fragment'].every(key=>d.components[key]===undefined||typeof d.components[key]==='string'&&d.components[key].length<16384)||!/^[a-z0-9-]+\.[a-z0-9.-]+$/i.test(d.components.authority||''))throw Error('Invalid extension callback');for(const[id,c]of extensionCallbacks)if(c.expires<Date.now())extensionCallbacks.delete(id);if(extensionCallbacks.size>128)throw Error('Too many extension callbacks');extensionCallbacks.set(d.id,{components:{...d.components,scheme:'devforge'},expires:Date.now()+600000});return true;},
    codeossUserData:async d=>{codeossUserData||=new(require('./codeoss-userdata.cjs').CodeOSSUserData)(app.getPath('userData'),value=>{for(const record of openWindows)if(!record.window.isDestroyed())record.window.webContents.send('studio:event','codeossUserDataChanged',value);});return codeossUserData.handle(d);},
    codeossStorage:async d=>{codeossStorage||=new(require('./codeoss-storage.cjs').CodeOSSStorage)(app.getPath('userData'),value=>{for(const record of openWindows)if(!record.window.isDestroyed())record.window.webContents.send('studio:event','codeossStorageChanged',value);},require('electron').safeStorage);return d.secret?codeossStorage.secret(d):codeossStorage.handle(d);},
    chooseFolder:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openDirectory']});return r.canceled?null:r.filePaths[0];},
    chooseFile:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile']});return r.canceled?null:r.filePaths[0];},
    chooseWorkspace:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'VS Code workspace',extensions:['code-workspace']}]});return r.canceled?null:r.filePaths[0];},
    showInFiles:file=>shell.showItemInFolder(file),
    showNotices:()=>shell.openPath(app.isPackaged?path.join(process.platform==='darwin'?process.resourcesPath:path.resolve(process.resourcesPath,'..'),'LICENSES.chromium.html'):path.join(__dirname,'node_modules/electron/dist/LICENSES.chromium.html')),
    writeClipboard:text=>require('electron').clipboard.writeText(text),
    readClipboard:()=>require('electron').clipboard.readText(),
    saveData:async(text,name)=>{const result=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),name),properties:['showOverwriteConfirmation']});if(result.canceled)return false;await require('./workspace.cjs').atomic(result.filePath,text);return true;},
    openDocumentationLink:url=>{const value=new URL(url);if(value.protocol!=='https:'||value.username||value.password)throw Error('Only HTTPS documentation links are supported');return shell.openExternal(value.href);},
    openExternal:url=>{const value=new URL(url);if(value.protocol!=='https:'||value.hostname!=='github.com')throw Error('External link denied');return shell.openExternal(value.href);},
    exportProject:async root=>{
      const result=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),path.basename(root)+'.zip'),filters:[{name:'ZIP',extensions:['zip']}],properties:['showOverwriteConfirmation']});if(result.canceled)return false;
      const destination=path.resolve(result.filePath);if(inside(destination,root))throw Error('Choose an archive location outside the project');
      const temp=destination+'.studio-'+crypto.randomUUID();try{const info=await require('./archive.cjs').zipDirectory(root,temp,{exclude:new Set(['.forge','.git','build','.cache','node_modules'])});await fs.rename(temp,destination);host.event('toast','Project exported: '+destination);return info;}finally{await fs.rm(temp,{force:true});}
    }
  });host.addons=stores.addonFacade(host);await host.init();
  if(smoke){if(!host.ws.prefs.current)await host.ws.newProject('smoke-fixture');host.ws.prefs.settings.interfaceMode='simple';host.ws.prefs.settings.pythonExecutable=process.env.DEVFORGE_TEST_PYTHON||'';host.ws.prefs.settings.setupDismissed=true;host.ws.prefs.settings.language=process.env.CPP_STUDIO_SMOKE_LANGUAGE||'ru';host.ws.prefs.settings.toolPaths={...host.ws.prefs.settings.toolPaths,...process.env.CPP_STUDIO_FORMAT?{format:process.env.CPP_STUDIO_FORMAT}:{},...process.env.CPP_STUDIO_CLANGD?{clangd:process.env.CPP_STUDIO_CLANGD}:{},...process.env.CPP_STUDIO_NINJA?{ninja:process.env.CPP_STUDIO_NINJA}:{}};await host.ws.persist();await host.tools.discover();}
  const bounds=host.ws.prefs.window||{};
  window=new BrowserWindow({width:Math.max(800,Math.min(2400,bounds.width||1360)),height:Math.max(560,Math.min(1800,bounds.height||880)),minWidth:720,minHeight:480,show:false,backgroundColor:'#1e1e1e',title:'DevForge',backgroundMaterial:'none',...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{color:'#181818',symbolColor:'#d4d4d4',height:28}}:{}),icon:path.join(__dirname,'icon.png'),autoHideMenuBar:true,
    webPreferences:{v8CacheOptions:'bypassHeatCheck',preload:path.join(__dirname,'preload.cjs'),additionalArguments:['--devforge-build-channel='+build.channel],nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:false,backgroundThrottling:!smoke&&!headless,offscreen:smoke||headless,devTools:build.debug||!app.isPackaged}});
  if(build.debug){window.setTitle('DevForge [Debug]');window.webContents.on('page-title-updated',(event,title)=>{event.preventDefault();window.setTitle(title.replace(/ \[Debug\]$/,'')+' [Debug]');});diagnostics.attach(window);}
  window.webContents.setZoomFactor(Math.max(.65,Math.min(1.8,(Number(host.ws.prefs.settings.uiScale)||100)/100)));
  record={window,host};openWindows.add(record);
  window.on('focus',()=>{if(!window.isDestroyed())window.webContents.send('studio:event','globalStateChanged',{projects:Object.keys(stores.global.projects),projectLabels:Object.fromEntries(Object.entries(stores.global.projects).map(([id,p])=>[id,p.label]))});});
  if(process.platform==='darwin')app.dock?.setIcon(path.join(__dirname,'icon.png'));Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(base))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  if(smoke){window.webContents.on('console-message',(_event,level,message)=>console.log('renderer',level,message));window.webContents.on('did-finish-load',()=>console.log('page loaded'));window.webContents.on('did-fail-load',(_e,code,description)=>console.log('load failed',code,description));}
  window.webContents.on('render-process-gone',(_event,details)=>{if(!quitting&&!headless)dialog.showErrorBox('DevForge','The editor process stopped: '+details.reason+'\nSaved project files are unchanged.');});
  const dispatch=async(op,data)=>{
    if(op==='uiScale'){const factor=Number(data.scale)/100;if(!Number.isFinite(factor)||factor<.65||factor>1.8)throw Error('Invalid interface scale');window.webContents.setZoomFactor(factor);return {factor};}
    if(op==='debugTools'){if(!diagnostics)throw Error('Debug tools are only available in the Debug build');return diagnostics.action(window,data);}
    if(op==='debugReady'){if(!diagnostics)throw Error('Debug tools are only available in the Debug build');await diagnostics.log.write('workspace-ready',{elapsedMs:Number(data.elapsedMs)||0,domNodes:Number(data.domNodes)||0});return true;}
    if(op==='debugFault'){if(!diagnostics)throw Error('Debug tools are only available in the Debug build');await diagnostics.log.write('renderer-fault',{kind:String(data.kind).slice(0,64),message:String(data.message).slice(0,8192)});return true;}
    if(!diagnostics)return host.handle(op,data);
    const at=Date.now();try{return await host.handle(op,data);}catch(error){diagnostics?.log.write('operation-error',{op,message:error.message,stack:error.stack});throw error;}finally{if(diagnostics&&Date.now()-at>=250)diagnostics.log.write('slow-operation',{op,elapsedMs:Date.now()-at});}
  };
  const ipcHandler=async(event,raw)=>{
    const sender=event.sender,frame=event.senderFrame;if(!trusted(sender,frame)||typeof raw!=='string'||raw.length>10*1024*1024)return;
    let id;try{const request=JSON.parse(raw);id=request.id;if(typeof id!=='string'||id.length>64)throw Error('Invalid request id');const previousDefaults=JSON.stringify(stores.addons?.data.profile.defaultRequested);const value=await dispatch(request.op,request.data||{});if(['workspaceCreate','workspaceSaveAs'].includes(request.op))for(const other of openWindows)if(other!==record&&!other.window.isDestroyed()&&other.host.ws.prefs.current===value.project)other.window.webContents.send('studio:event','workspaceStructureChanged',{project:value.project});if(request.op.startsWith('addon')&&JSON.stringify(stores.addons?.data.profile.defaultRequested)!==previousDefaults){for(const other of openWindows)if(other!==record&&!other.window.isDestroyed())other.window.webContents.send('studio:event','globalAddonsChanged',{requested:stores.addons.data.profile.defaultRequested});}if(trusted(sender,frame))sender.send('studio:result',{id,value});}
    catch(error){if(trusted(sender,frame))sender.send('studio:result',{id,error:error.message||String(error)});}
  };ipcMain.on('studio:request',ipcHandler);window.once('closed',()=>{ipcMain.removeListener('studio:request',ipcHandler);clearTimeout(window.saveBoundsTimer);if(!quitting){quitting=true;host.close().finally(()=>{server.close();openWindows.delete(record);});}else openWindows.delete(record);});
  window.on('resize',()=>{if(!smoke){const {width,height}=window.getBounds();host.ws.prefs.window={width,height};clearTimeout(window.saveBoundsTimer);window.saveBoundsTimer=setTimeout(()=>host.ws.persist().catch(console.error),400);}});
  window.on('close',event=>{if(!quitting){event.preventDefault();quitting=true;host.close().finally(()=>{server.close();openWindows.delete(record);window.destroy();if(!openWindows.size&&process.platform!=='darwin')app.quit();});}});
  await require('./navigation.cjs').loadLocalPage(window,page);if(smoke){const {runSmoke}=require('./smoke.cjs');await runSmoke({app,window,host,base});quitting=true;await host.close();server.close();window.destroy();app.quit();}else if(!headless)window.show();
}
try{return await start();}finally{if(reserved)openingProjects.delete(project);}
}
if(primaryInstance)app.whenReady().then(async()=>{diagnostics?.start();stores=await new WindowStore(app.getPath('userData'),smoke||process.argv.includes('--isolated')?undefined:path.join(app.getPath('documents'),build.profileName)).init();await openWindow(undefined,true);}).catch(error=>{console.error(error);if(!smoke&&!headless)dialog.showErrorBox('DevForge',error.message);app.exit(1);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
let diagnosticsClosed=false;app.on('before-quit',event=>{codeoss?.close();if(diagnostics&&!diagnosticsClosed){event.preventDefault();diagnosticsClosed=true;diagnostics.close().catch(console.error).finally(()=>app.quit());}});
app.on('activate',()=>{const record=[...openWindows].at(-1);if(record&&!record.window.isDestroyed())record.window.show();else if(stores)openWindow(undefined,true).catch(console.error);});
