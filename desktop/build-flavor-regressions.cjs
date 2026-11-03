'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Application}=require('./soak/cdp.cjs'),{flavor,packageFolder}=require('./build-flavor.cjs');
async function main(){
 const apps=[],profiles=[],report={checks:[]},version=require('./package.json').version,output=path.resolve(process.env.DEVFORGE_FLAVOR_REPORT||'work/build-flavors.json');
 const check=(title,value)=>{report.checks.push({title,passed:!!value});console.log((value?'PASS ':'FAIL ')+title);if(!value)throw Error(title);};
 try{for(const channel of ['debug','release']){
  const build=flavor(channel),folder=packageFolder(__dirname,version,build),profile=await fs.mkdtemp(path.join(os.tmpdir(),'df-flavor-runtime-')),token=crypto.randomUUID();profiles.push({profile,token});await fs.writeFile(path.join(profile,'.df-flavor-owner'),token);await require('./soak/vsx-fixtures.cjs').prepare(profile);
  const app=new Application(path.join(folder,build.executableName+'.exe'),profile);apps.push(app);await app.launch();await app.cdp.until('window.forge?.startupComplete&&!!StudioCodeOSS.api',90000);const c=app.cdp;
  check(channel+': real extension host and its dependency work',(await c.evaluate("StudioCodeOSS.api.execute('df.vsx.probe')",60000)).dependency===42);
  check(channel+': expected build identity',await c.evaluate(`StudioDesktop.buildChannel===${JSON.stringify(channel)}`));
  check(channel+': diagnostic toolbar is exclusive to Debug',await c.evaluate(`!!document.getElementById('debugToolsButton')===${build.debug}`));
  const file=path.join(folder,'resources/app/ui/vendor/codeoss/codeoss.js.map');if(build.debug){await fs.access(file);const map=JSON.parse(await fs.readFile(file,'utf8'));check('Debug: source maps contain original Code OSS source',map.sources.length>100&&map.sourcesContent.some(s=>s&&s.includes('class ')));
   const status=await c.evaluate("native('debugTools',{action:'status'})");check('Debug: report uses its own isolated profile',status.build.debug&&status.log.startsWith(profile+path.sep));
   await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F12',code:'F12',windowsVirtualKeyCode:123});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F12',code:'F12',windowsVirtualKeyCode:123});await c.until("native('debugTools',{action:'status'}).then(s=>s.devToolsOpen)",10000);check('Debug: F12 opens genuine DevTools',true);await c.evaluate("native('debugTools',{action:'devtools'})");
   const start=await c.evaluate("native('debugTools',{action:'trace'})");await c.evaluate("Array.from({length:10000},(_,i)=>i*i).reduce((a,b)=>a+b,0)");const end=await c.evaluate("native('debugTools',{action:'trace'})",30000);const trace=JSON.parse(await fs.readFile(end.file,'utf8'));check('Debug: genuine bounded performance recording can start and stop',start.recording&&!end.recording&&trace.traceEvents.length>0);
   await c.evaluate("console.error('debug-fixture error token=private-value');native('debugReady',{elapsedMs:42,domNodes:100})");await c.evaluate("native('debugTools',{action:'status'})");const logs=await fs.readFile(status.log,'utf8');check('Debug: renderer faults are persisted and credentials are redacted',logs.includes('debug-fixture error')&&!logs.includes('private-value'));
  }else{
   check('Release: no debug source maps in payload',!await fs.access(file).then(()=>true,()=>false));check('Release: Debug-only RPC is rejected',await c.evaluate("native('debugTools',{action:'status'}).then(()=>false,e=>/only available/.test(e.message))"));
   check('Release: debug UI script is unavailable',await c.evaluate("fetch('debug-tools.js').then(r=>r.status===404)"));check('Release: no background diagnostic logs',!await fs.access(path.join(profile,'diagnostics')).then(()=>true,()=>false));
  }
  check(channel+': no unhandled renderer exceptions',!c.events.length);
 }
 check('Debug and Release remain operational at the same time',apps.every(app=>app.child.exitCode===null));report.passed=true;
 }catch(error){report.error=error.stack;process.exitCode=1;}finally{for(const app of apps)await app.close();for(const {profile,token}of profiles){const real=await fs.realpath(profile);if(path.dirname(real)===await fs.realpath(os.tmpdir())&&path.basename(real).startsWith('df-flavor-runtime-')&&await fs.readFile(path.join(real,'.df-flavor-owner'),'utf8')===token)await fs.rm(real,{recursive:true,force:true,maxRetries:5,retryDelay:100});}await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
