'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Application}=require('./soak/cdp.cjs');
async function main(){
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'df-vsx-sidebar-')),token=crypto.randomUUID(),report={checks:[]},output=path.resolve(process.env.DEVFORGE_SIDEBAR_REPORT||'work/vsx-sidebar.json');
 await fs.writeFile(path.join(profile,'.devforge-soak-owned.json'),JSON.stringify({format:'devforge.soak.fixture/1',token}));
 const fixture=await require('./soak/vsx-fixtures.cjs').prepare(profile),app=new Application(process.argv.find(a=>a.startsWith('--app='))?.slice(6)||__dirname,profile);
 const check=(title,passed)=>{report.checks.push({title,passed:!!passed});if(!passed)throw Error(title);};
 try{
  await app.launch();const c=app.cdp;await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});await c.until('window.forge?.startupComplete&&!!StudioCodeOSS.api',90000);
  for(const name of ['adapter.js','vsx-adapter.js'])await c.evaluate(await fs.readFile(path.join(__dirname,'soak',name),'utf8'));
  await c.evaluate('__devforgeSoak.initialize('+JSON.stringify(fixture.roots)+')');await c.evaluate('__devforgeVSX.initialize('+JSON.stringify(fixture.vsx)+')');
  await c.evaluate('__devforgeVSX.perform({type:"vsx-sidebar"})',60000);check('Extension icon opens its tree in the shared native rail; sidebar follows dock widths',true);
  const id=fixture.vsx.ids.probe,button='.activitybar [data-vsx-container="workbench.view.extension.df-vsx"]';
  await c.evaluate(`forge.addons.marketToggle(forge.addons.marketplaceEntries().find(e=>e.manifest.id===${JSON.stringify(id)}),false,true,true)`);await c.until('!document.querySelector('+JSON.stringify(button)+')',15000);check('Disabling the owner removes its sidebar icon',true);
  await c.evaluate(`forge.addons.marketToggle(forge.addons.marketplaceEntries().find(e=>e.manifest.id===${JSON.stringify(id)}),true,true,true)`);await c.until('!!document.querySelector('+JSON.stringify(button)+')',15000);check('Re-enabling restores exactly one icon',await c.evaluate('document.querySelectorAll('+JSON.stringify(button)+').length===1'));
  await c.evaluate("(async()=>{await (await StudioCodeOSS.api.getService(StudioCodeOSS.api.IViewsService)).openViewContainer('workbench.view.extensions',true);await StudioCodeOSS.showTool('sidebar');return true;})()");
  report.sizes=[];for(const [width,height]of [[1360,900],[390,720],[1360,900]]){
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,150));
   const size=await c.evaluate(`(()=>{const e=forge.windows.contents.get('extensionViews'),p=e.querySelector('[id="workbench.parts.sidebar"]'),b=e.getBoundingClientRect(),r=p.getBoundingClientRect();return{width:innerWidth,host:b.width,part:r.width,height:b.height,partHeight:r.height,nestedRail:!!e.querySelector('[id="workbench.parts.activitybar"]')};})()`);report.sizes.push(size);check('Gallery fits its actual dock at viewport '+width,size.part>0&&size.partHeight>0&&size.part<=size.host+2&&size.partHeight<=size.height+2&&!size.nestedRail);await fs.writeFile(output+'.'+width+'.png',await c.screenshot());
  }
  check('No renderer exceptions',!c.events.length);report.passed=true;
 }catch(error){report.error=error.stack;process.exitCode=1;}
 finally{report.logs=app.cdp?.logs;await app.close();await fs.writeFile(output,JSON.stringify(report,null,2));const real=await fs.realpath(profile),temp=await fs.realpath(os.tmpdir()),marker=JSON.parse(await fs.readFile(path.join(real,'.devforge-soak-owned.json'),'utf8'));if(path.dirname(real)===temp&&path.basename(real).startsWith('df-vsx-sidebar-')&&marker.token===token){await fs.rm(real,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.fixtureRemoved=true;}await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
main().then(()=>process.exit(process.exitCode||0)).catch(error=>{console.error(error);process.exit(1);});
