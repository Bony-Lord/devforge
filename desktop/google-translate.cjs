'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const language=value=>{if(typeof value!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(value))throw Error('Invalid translation language');return value;};
function webURL({text='',target='ru',images=false}){const url=new URL('https://translate.google.com/');url.searchParams.set('sl','auto');url.searchParams.set('tl',language(target));url.searchParams.set('op',images?'images':'translate');if(!images){if(typeof text!=='string'||text.length>5000)throw Error('Select at most 5000 characters for web translation');url.searchParams.set('text',text);}return url.href;}
class GoogleTranslate{
 constructor({owner,directory,electron,fetcher=fetch}){this.owner=owner;this.directory=path.join(directory,'google-translate');this.electron=electron;this.fetcher=fetcher;this.windows=new Set();this.captures=new Map();this.pending=new Set();}
 async handle(data){
  if(data.action==='close'){await this.close();return true;}
  if(data.action==='status'){let configured=false;try{await fs.access(path.join(this.directory,'cloud-key'));configured=true;}catch{}return{configured};}
  if(data.action==='key'){const file=path.join(this.directory,'cloud-key');if(!data.key){await fs.rm(file,{force:true});return true;}if(typeof data.key!=='string'||data.key.length>512)throw Error('Invalid Cloud API key');const storage=this.electron.safeStorage;if(!storage.isEncryptionAvailable())throw Error('Windows secret storage is unavailable');await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(file,storage.encryptString(data.key),{mode:0o600});return true;}
  if(data.action==='cloud')return this.cloud(data);
  if(data.action==='capture')return this.capture(data.rect);
  if(data.action==='showCapture'){const capture=this.captures.get(data.id);if(!capture)throw Error('Capture expired');this.electron.shell.showItemInFolder(capture.file);return true;}
  if(data.action==='web'){const capture=data.capture&&this.captures.get(data.capture);if(data.capture&&!capture)throw Error('Capture expired');await this.open(webURL({...data,images:!!capture}),capture);return true;}
  throw Error('Unknown translator operation');
 }
 async capture(rect){
  const zoom=this.owner.webContents.getZoomFactor(),[width,height]=this.owner.getContentSize();let area;
  if(rect){if(!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<2||rect.height<2)throw Error('Invalid capture region');area=Object.fromEntries(Object.entries(rect).map(([key,value])=>[key,Math.round(value*zoom)]));if(area.x<0||area.y<0||area.x+area.width>width+1||area.y+area.height>height+1)throw Error('Capture region is outside the application');}
  const image=await this.owner.webContents.capturePage(area),bytes=image.toPNG();if(bytes.length>20*1024*1024)throw Error('Capture exceeds 20 MiB');await fs.mkdir(this.directory,{recursive:true});while(this.captures.size>=3){const [id,entry]=this.captures.entries().next().value;this.captures.delete(id);await fs.rm(entry.file,{force:true});}
  const id=crypto.randomUUID(),file=path.join(this.directory,'capture-'+id+'.png');await fs.writeFile(file,bytes);this.captures.set(id,{file});return{id,preview:image.toDataURL(),bytes:bytes.length};
 }
 async cloud({texts,target}){
  language(target);if(!Array.isArray(texts)||!texts.length||texts.length>100||texts.some(t=>typeof t!=='string'||t.length>5000)||texts.join('').length>25000)throw Error('Translation batch exceeds limits');
  let key;try{key=this.electron.safeStorage.decryptString(await fs.readFile(path.join(this.directory,'cloud-key')));}catch{throw Error('Configure a Google Cloud Translation API key in the Google Translate addon');}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);this.pending.add(controller);
  try{const response=await this.fetcher('https://translation.googleapis.com/language/translate/v2',{method:'POST',headers:{'Content-Type':'application/json','X-goog-api-key':key},body:JSON.stringify({q:texts,target,format:'text'}),signal:controller.signal});if(!response.ok)throw Error('Google Cloud Translation returned HTTP '+response.status);const body=await response.json(),values=body.data?.translations;if(!Array.isArray(values)||values.length!==texts.length||values.some(v=>typeof v.translatedText!=='string'))throw Error('Invalid Google Translation response');return values.map(v=>v.translatedText);}catch(error){if(error.name==='AbortError')throw Error('Translation timed out or was cancelled');throw error;}finally{clearTimeout(timer);this.pending.delete(controller);}
 }
 async open(url,capture){
  const window=new this.electron.BrowserWindow({parent:this.owner,show:!this.owner.webContents.isOffscreen(),width:1000,height:760,minWidth:600,minHeight:480,title:'Google Translate',autoHideMenuBar:true,backgroundColor:'#202124',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,partition:'devforge-google-translate'}});this.windows.add(window);window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.session.setPermissionCheckHandler(()=>false);window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.webContents.on('will-navigate',(event,next)=>{const parsed=new URL(next);if(parsed.protocol!=='https:'||!['translate.google.com','accounts.google.com','consent.google.com'].includes(parsed.hostname))event.preventDefault();});window.once('closed',()=>this.windows.delete(window));
  if(capture){let timer,attempts=0;const notify=status=>{if(!this.owner.isDestroyed())this.owner.webContents.send('studio:event','googleTranslateStatus',{status});},stop=()=>{clearInterval(timer);if(!window.isDestroyed()&&window.webContents.debugger.isAttached())window.webContents.debugger.detach();};const upload=async()=>{if(window.isDestroyed()){stop();return;}if(++attempts>20){stop();notify('manual-upload');return;}try{const contents=window.webContents;if(!contents.debugger.isAttached())contents.debugger.attach('1.3');const {root}=await contents.debugger.sendCommand('DOM.getDocument',{depth:-1,pierce:true});const {nodeId}=await contents.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type="file"]'});if(nodeId){await contents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[capture.file]});stop();notify('uploaded');}}catch{stop();notify('manual-upload');}};window.webContents.once('did-finish-load',()=>{timer=setInterval(upload,1000);upload();});window.once('closed',stop);}
  try{await window.loadURL(url);}catch(error){if(!window.isDestroyed())window.destroy();throw error;}
 }
 async close(){for(const controller of this.pending)controller.abort();for(const window of this.windows)if(!window.isDestroyed())window.destroy();this.windows.clear();for(const {file}of this.captures.values())await fs.rm(file,{force:true});this.captures.clear();}
}
module.exports={GoogleTranslate,webURL,language};
