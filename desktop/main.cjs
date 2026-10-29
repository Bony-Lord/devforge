'use strict';
const {app,BrowserWindow,ipcMain,session,dialog,shell,nativeTheme,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {DesktopHost}=require('./host.cjs');
const {inside}=require('./workspace.cjs');
let window,host,server,origin,base,quitting=false;
const smoke=process.argv.includes('--smoke');
const headless=process.argv.includes('--headless-check');
if(process.argv.includes('--headless-check'))app.commandLine.appendSwitch('remote-debugging-port','9333');
const dataArg=process.argv.find(a=>a.startsWith('--data-dir='));
if(dataArg)app.setPath('userData',path.resolve(dataArg.slice('--data-dir='.length)));
app.setName('DevForge');
const ui=path.join(__dirname,'ui');
const sourceUi=path.join(__dirname,'../app/src/main/assets/ui');
function trusted(event){return window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url.startsWith(base);}
async function serve(){
  const root=await fs.realpath(await fs.access(ui).then(()=>ui,()=>sourceUi)),token=crypto.randomBytes(24).toString('hex');
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
  server=http.createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw Error('Denied');
      const url=new URL(req.url,origin);if(!url.pathname.startsWith('/'+token+'/'))throw Error('Denied');
      const relative=decodeURIComponent(url.pathname.slice(token.length+2))||'index.html';
      const file=await fs.realpath(path.resolve(root,relative));if(!inside(file,root)||!(await fs.stat(file)).isFile())throw Error('Denied');
      res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
      if(req.method==='HEAD')res.end();else res.end(await fs.readFile(file));
    }catch{if(smoke)console.error('Missing UI asset: '+String(req.url).replace('/'+token+'/',''));res.statusCode=404;res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;base=origin+'/'+token+'/';return base+'index.html';
}
async function start(){
  const page=await serve();
  host=await new DesktopHost(app.getPath('userData'),(type,data)=>{if(window&&!window.isDestroyed())window.webContents.send('studio:event',type,data);},{
    projectsDirectory:smoke||process.argv.includes('--isolated')?undefined:path.join(app.getPath('documents'),'DevForge'),
    reducedMotion:()=>nativeTheme.prefersReducedMotion,
    chooseFolder:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openDirectory']});return r.canceled?null:r.filePaths[0];},
    chooseFile:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile']});return r.canceled?null:r.filePaths[0];},
    showInFiles:file=>shell.showItemInFolder(file),
    showNotices:()=>shell.openPath(app.isPackaged?path.join(process.platform==='darwin'?process.resourcesPath:path.resolve(process.resourcesPath,'..'),'LICENSES.chromium.html'):path.join(__dirname,'node_modules/electron/dist/LICENSES.chromium.html')),
    writeClipboard:text=>require('electron').clipboard.writeText(text),
    saveData:async(text,name)=>{const result=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),name),properties:['showOverwriteConfirmation']});if(result.canceled)return false;await require('./workspace.cjs').atomic(result.filePath,text);return true;},
    openExternal:url=>{const value=new URL(url);if(value.protocol!=='https:'||value.hostname!=='github.com')throw Error('External link denied');return shell.openExternal(value.href);},
    exportProject:async root=>{
      const result=await dialog.showSaveDialog(window,{defaultPath:path.join(app.getPath('downloads'),path.basename(root)+'.zip'),filters:[{name:'ZIP',extensions:['zip']}],properties:['showOverwriteConfirmation']});if(result.canceled)return false;
      const destination=path.resolve(result.filePath);if(inside(destination,root))throw Error('Choose an archive location outside the project');
      const temp=destination+'.studio-'+crypto.randomUUID();try{const info=await require('./archive.cjs').zipDirectory(root,temp,{exclude:new Set(['.forge','.git','build','.cache','node_modules'])});await fs.rename(temp,destination);host.event('toast','Project exported: '+destination);return info;}finally{await fs.rm(temp,{force:true});}
    }
  }).init();
  if(smoke){if(!host.ws.prefs.current)await host.ws.newProject('smoke-fixture');host.ws.prefs.settings.interfaceMode='simple';host.ws.prefs.settings.pythonExecutable=process.env.DEVFORGE_TEST_PYTHON||'';host.ws.prefs.settings.setupDismissed=true;host.ws.prefs.settings.language=process.env.CPP_STUDIO_SMOKE_LANGUAGE||'ru';host.ws.prefs.settings.toolPaths={...host.ws.prefs.settings.toolPaths,...process.env.CPP_STUDIO_FORMAT?{format:process.env.CPP_STUDIO_FORMAT}:{},...process.env.CPP_STUDIO_CLANGD?{clangd:process.env.CPP_STUDIO_CLANGD}:{},...process.env.CPP_STUDIO_NINJA?{ninja:process.env.CPP_STUDIO_NINJA}:{}};await host.ws.persist();await host.tools.discover();}
  const bounds=host.ws.prefs.window||{};
  window=new BrowserWindow({width:Math.max(800,Math.min(2400,bounds.width||1360)),height:Math.max(560,Math.min(1800,bounds.height||880)),minWidth:720,minHeight:480,show:false,backgroundColor:'#191b23',title:'DevForge',icon:path.join(__dirname,'icon.png'),autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:false,backgroundThrottling:!smoke,offscreen:smoke||headless,devTools:!app.isPackaged}});
  if(process.platform==='darwin')app.dock?.setIcon(path.join(__dirname,'icon.png'));Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(base))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  if(smoke){window.webContents.on('console-message',(_event,level,message)=>console.log('renderer',level,message));window.webContents.on('did-finish-load',()=>console.log('page loaded'));window.webContents.on('did-fail-load',(_e,code,description)=>console.log('load failed',code,description));}
  window.webContents.on('render-process-gone',(_event,details)=>{if(!quitting)dialog.showErrorBox('DevForge','The editor process stopped: '+details.reason+'\nSaved project files are unchanged.');});
  ipcMain.on('studio:request',async(event,raw)=>{
    if(!trusted(event)||typeof raw!=='string'||raw.length>10*1024*1024)return;
    let id;try{const request=JSON.parse(raw);id=request.id;if(typeof id!=='string'||id.length>64)throw Error('Invalid request id');const value=await host.handle(request.op,request.data||{});if(trusted(event))event.sender.send('studio:result',{id,value});}
    catch(error){if(trusted(event))event.sender.send('studio:result',{id,error:error.message||String(error)});}
  });
  window.on('resize',()=>{if(!smoke){const {width,height}=window.getBounds();host.ws.prefs.window={width,height};clearTimeout(window.saveBoundsTimer);window.saveBoundsTimer=setTimeout(()=>host.ws.persist().catch(console.error),400);}});
  window.on('close',event=>{if(!quitting){event.preventDefault();quitting=true;host.close().finally(()=>{server.close();window.destroy();app.quit();});}});
  await window.loadURL(page);if(smoke){const {runSmoke}=require('./smoke.cjs');await runSmoke({app,window,host,base});quitting=true;await host.close();server.close();window.destroy();app.quit();}else if(!headless)window.show();
}
app.whenReady().then(start).catch(error=>{console.error(error);if(!smoke)dialog.showErrorBox('DevForge',error.message);app.exit(1);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(window&&!window.isDestroyed())window.show();});
