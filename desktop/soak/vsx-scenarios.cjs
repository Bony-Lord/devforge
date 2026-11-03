'use strict';
const fs=require('node:fs'),path=require('node:path');
const names=['vsx-command','vsx-language-resources','vsx-providers','vsx-settings','vsx-settings-ui','vsx-lifecycle','vsx-dependency-review','vsx-uninstall-reinstall','vsx-update-roundtrip','vsx-sidebar','vsx-context-menu','vsx-keybinding','vsx-webview','vsx-browser','vsx-gallery-search','vsx-resize','vsx-reload'];
const suites=['VSX workbench and C++ analysis','VSX file operations','VSX editor columns','VSX workspaces','VSX workspace creation','VSX workspace Save As','VSX gallery and IDE packs','VSX stock uninstall and reload','VSX startup cache and reload'];
function environmentWarning(message){return /^\s*(?:%c)?\[Extension Host\]\s*(?:%c)?\(node:\d+\)\s*\[(DEP\d+)\]\s+DeprecationWarning:/.exec(message)?.[1];}
function findingSignature(title,detail){if(!title.startsWith('vsx-'))return;const prefix=title+'|';return String(detail).startsWith(prefix)?String(detail):prefix+String(detail).split('\n')[0];}
function generate(rng,index,coverage){
 const pending=coverage&&names.filter(name=>!((coverage[name]?.passed||0)+(coverage[name]?.failed||0)+(coverage[name]?.unavailable||0))),untouched=pending?.length?pending[Math.floor(rng()*pending.length)]:null;
 let type=names[index<names.length?index:Math.floor(rng()*names.length)];
 if(coverage&&index>=names.length){const weights=names.map(name=>({name,w:1/Math.sqrt(1+(coverage[name]?.passed||0)+(coverage[name]?.failed||0)+(coverage[name]?.unavailable||0))}));let n=rng()*weights.reduce((sum,c)=>sum+c.w,0);for(const c of weights){n-=c.w;if(n<=0){type=c.name;break;}}}
 if(untouched)type=untouched;const params={mode:rng()<.5?'one':'two'};if(type==='vsx-resize'){params.width=[390,480,720,1360,1920][Math.floor(rng()*5)];params.height=[640,900,1080][Math.floor(rng()*3)];}return{schema:1,type,params};
}
async function initialize({cdp,fixture}){await cdp.until('!!window.StudioCodeOSS?.api',60000);await cdp.evaluate('__devforgeVSX.initialize('+JSON.stringify(fixture.vsx)+')');}
async function evidence({fixture,store,base}){
 const io=require('node:fs/promises'),{inside,hash}=require('./core.cjs'),records=[];
 const profile=await io.realpath(fixture.profile);
 for(const key of ['library','probe','upgrade','browser']){
  const file=await io.realpath(path.join(profile,'vsx-fixtures',key+'.vsix'));if(!inside(file,profile))throw Error('VSIX evidence escaped its fixture');
  const bytes=await io.readFile(file);if(bytes.length>512*1024)throw Error('Synthetic VSIX grew beyond its evidence budget');
  const relative=base+'/vsix/'+key+'.vsix';await store.write(relative,bytes);records.push({file:relative,sha256:hash(bytes),id:fixture.vsx.packages[key].manifest.id,version:fixture.vsx.packages[key].manifest.version});
 }return records;
}
async function execute(action,context){
 if(action.type==='self-check')return require('./scenarios.cjs').execute(action,context);
 const {cdp,fixture,inject,call}=context;await call({type:'closeTransient'});await call({type:'assertScope'});
 if(action.type==='vsx-reload'){await call({type:'save'});await cdp.send('Page.reload');await cdp.until('document.readyState==="complete"');await inject();}
 else if(action.type==='vsx-resize')await cdp.send('Emulation.setDeviceMetricsOverride',{width:action.params.width,height:action.params.height,deviceScaleFactor:1,mobile:false});
 const perform=async current=>{try{return await cdp.evaluate('__devforgeVSX.perform('+JSON.stringify(current)+')',60000);}catch(error){if(/AdapterMismatch:/.test(error.message))error.code='ADAPTER_MISMATCH';throw error;}};
 const refresh=async key=>{const pkg=await require('./vsx-fixtures.cjs').refreshCandidate(fixture,key);await cdp.evaluate('__devforgeVSX.refreshPackage('+JSON.stringify(key)+','+JSON.stringify(pkg)+')');};
 if(action.type==='vsx-update-roundtrip'){for(const phase of ['upgrade','probe']){await refresh(phase);await perform({...action,phase});}}
 else if(action.type==='vsx-uninstall-reinstall'){await perform({...action,phase:'remove'});await refresh('probe');await perform({...action,phase:'install'});}
 else{if(action.type==='vsx-browser')await refresh('browser');await perform(action);}
 if(action.type==='vsx-keybinding'){
  const before=await cdp.evaluate("StudioCodeOSS.api.execute('df.vsx.probe').then(r=>r.keyCount)");
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'8',code:'Digit8',windowsVirtualKeyCode:56,modifiers:3});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'8',code:'Digit8',windowsVirtualKeyCode:56,modifiers:3});
  await cdp.until("StudioCodeOSS.api.execute('df.vsx.probe').then(r=>r.keyCount==="+(before+1)+')',10000);
 }
 if(action.type==='vsx-providers'){const actual=await require('node:fs/promises').readFile(path.join(fixture.main,'sample.dfpipe'),'utf8');if(actual!=='BAD EXAMPLE\n')throw Error('VSX formatter did not reach saved project bytes');}
}
module.exports={names,suites,generate,initialize,execute,evidence,environmentWarning,findingSignature,visualAfter:['vsx-settings-ui','vsx-dependency-review','vsx-sidebar','vsx-webview','vsx-resize'],restartAfterFailure:['vsx-lifecycle','vsx-uninstall-reinstall','vsx-update-roundtrip','vsx-browser','vsx-reload'],adapter:'\n;'+fs.readFileSync(path.join(__dirname,'vsx-adapter.js'),'utf8')};
