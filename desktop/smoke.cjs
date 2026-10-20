'use strict';
// Application-level integration, using the actual sandboxed Electron renderer.
// This does not claim physical touch, IME or Bluetooth keyboard coverage.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function runSmoke({window,host,base}){
  const output=process.env.CPP_STUDIO_SMOKE_OUTPUT||path.join(host.ws.data,'verification');await fs.mkdir(output,{recursive:true});const checks=[],errors=[];
  window.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  const evaluate=code=>window.webContents.executeJavaScript(code,true);
  const wait=async(code,ms=30000)=>{const end=Date.now()+ms;for(;;){if(await evaluate(code))return;if(Date.now()>end)throw Error('Renderer timeout: '+code+'\n'+errors.join('\n')+'\n'+await evaluate('window.studioBootError||document.querySelector("#editor").textContent'));await new Promise(resolve=>setTimeout(resolve,100));}};
  const check=async(name,fn)=>{await fn();checks.push(name);};
  try{
    await wait('!!window.forge');await evaluate('forge.sessionReady');await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
    await check('sandboxed Monaco renderer opens the project',async()=>{const r=await evaluate('({platform:forge.state.capabilities.platform,editor:forge.state.capabilities.editor,model:forge.editor.getModel()?.getValue(),hasNode:typeof window.process!=="undefined",sandboxed:StudioDesktop.sandboxed,visible:getComputedStyle(document.querySelector("#editor")).visibility})');assert.equal(r.editor,'monaco');assert.equal(r.hasNode,false);assert.equal(r.sandboxed,true);assert.match(r.model,/Hello/);assert.equal(r.visible,'visible');});
    await check('editor typing, undo, selection and breakpoint decorations',async()=>{
      const r=await evaluate(`(async()=>{const e=forge.editor,m=e.getModel();const old=m.getValue();e.setPosition({lineNumber:1,column:1});e.trigger('smoke','type',{text:'// smoke\\n'});const typed=m.getValue().startsWith('// smoke');e.trigger('smoke','undo',null);const undo=m.getValue()===old;await forge.debugger.toggleBreakpoint(m,4);const breakpoint=m.getAllDecorations().some(d=>d.options.glyphMarginClassName==='forge-breakpoint');e.setSelection(new monaco.Range(1,1,1,9));return{typed,undo,breakpoint,selection:e.getSelection().endColumn};})()`);
      assert.deepEqual(r,{typed:true,undo:true,breakpoint:true,selection:9});
    });
    await check('menus preserve editor and split panes resize',async()=>{
      const r=await evaluate(`(()=>{forge.menu(forge.menuItems('file'),100,45);const menu=!document.querySelector('#menu').classList.contains('hidden');document.querySelector('#menu').classList.add('hidden');forge.splitEditor('side',false);forge.setCodeScale(140,false);return{menu,split:!!forge.secondaryEditor,model:forge.editor.getModel().getValue().length,width:forge.editor.getDomNode().getBoundingClientRect().width};})()`);assert.ok(r.menu&&r.split&&r.model>0&&r.width>100);await evaluate('forge.unsplitEditor();forge.setCodeScale(100,false)');
    });
    await check('GCC build and console output through renderer controls',async()=>{
      await evaluate("forge.settings.compiler=forge.toolPackState.packs.find(p=>p.id==='gcc')?.installed?'gcc':'clang';forge.settings.buildMode='file';forge.build(true)");await wait('!forge.running&&!forge.busy');const text=await evaluate('document.querySelector("#consoleOutput").textContent');assert.match(text,/Hello from C\+\+ Studio/);
    });
    await check('inline new-project form opens the newly created Unicode folder',async()=>{
      await evaluate(`(()=>{forge.newProject();const form=document.querySelector('.studio-mini-form');form.elements.projectName.value='ui-project Кириллица';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
      await wait("forge.state.root.includes('ui-project Кириллица')&&!!forge.active&&!document.querySelector('.studio-mini-form')");
      assert.match(await evaluate('forge.active.path'),/ui-project Кириллица\/main.cpp$/);
    });
    if(host.tools.tools.lldbdap||host.tools.tools.gdb&&host.tools.tools.gdbserver)await check('real debugger UI stops on invalid memory, shows locals and opens the project line',async()=>{
      const useDap=!!host.tools.tools.lldbdap;
      await evaluate(`(async()=>{forge.active.model.setValue('struct Node { int value; };\\nint main(){\\n Node item{42};\\n volatile int* ptr=nullptr;\\n *ptr=item.value;\\n return 0;\\n}\\n');await forge.saveAll();forge.debugger=${useDap?'new DapClient(forge)':'new GdbClient(forge)'};forge.debugger.breakpoints.clear();await forge.debugger.toggleBreakpoint(forge.active.model,5);const r=await native('build',{path:forge.active.path,mode:'file',options:{...forge.settings,optimization:'debug'},id:'smoke-debug-build'});if(r.code)throw Error('Debug compilation failed');await forge.debugger.start(r.executable);})()`);
      await wait('forge.debugger.paused&&forge.debugger.variablesSerial===forge.debugger.stopSerial');
      await evaluate("forge.debugger.action('continue')");await wait('forge.debugger.paused&&forge.debugger.nativeExecution?.line===5&&forge.debugger.variablesSerial===forge.debugger.stopSerial');
      assert.equal((await evaluate("forge.debugger.command('-data-evaluate-expression '+JSON.stringify('item.value'))")).value,'42');
      await evaluate("forge.debugger.action('continue')");await wait('forge.debugger.paused&&!!forge.runtimeDiagnostics.parser.fault&&forge.debugger.nativeExecution?.line===5&&forge.debugger.variablesSerial===forge.debugger.stopSerial');
      const r=await evaluate('({fault:forge.runtimeDiagnostics.parser.fault.title,line:forge.debugger.nativeExecution.line,variableTree:document.querySelector("#debugVariables").textContent})');assert.equal(r.line,5);assert.match(r.variableTree,/item/);assert.ok(r.fault);
      await evaluate("document.querySelector('[data-expression=item] .debug-value-toggle')?.click()");await wait("document.querySelector('#debugVariables').textContent.includes('42')");await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');window.webContents.invalidate();await window.webContents.capturePage(undefined,{stayHidden:true});await new Promise(r=>setTimeout(r,200));await fs.writeFile(path.join(output,'desktop-debugger.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      await evaluate('forge.debugger.stop()');
    });
    await check('runtime fault panel displays text and source links',async()=>{
      const r=await evaluate(`(()=>{const d=forge.runtimeDiagnostics;d.begin('smoke-fault');d.feed({id:'smoke-fault',stream:'stderr',text:'main.cpp:7:3: runtime error: division by zero\\n'});d.end({id:'smoke-fault'});forge.showPanel('console');return{visible:!d.banner.classList.contains('hidden'),title:d.banner.querySelector('strong').textContent,links:d.banner.querySelectorAll('.runtime-frame').length};})()`);assert.ok(r.visible);assert.match(r.title,/division by zero/);assert.equal(r.links,1);
    });
    await check('settings preserve Apply controls and hide Android-only keyboard settings',async()=>{
      const r=await evaluate(`(()=>{forge.openSettings();const form=document.querySelector('#settingsForm'),footer=document.querySelector('#settingsDialog>.dialog-buttons'),motion=!!form.elements.namedItem('motion'),keyboard=form.querySelector('[name=keyboardOverlap]').closest('section'),hidden=!forge.settingsSections.includes(keyboard),rect=footer.getBoundingClientRect();document.querySelector('#settingsDialog').close();return{motion,hidden,visible:rect.bottom<=innerHeight&&rect.top>0};})()`);assert.deepEqual(r,{motion:true,hidden:true,visible:true});
    });
    await check('first-run wizard uses available system tools without Android downloads',async()=>{
      const r=await evaluate(`(async()=>{await forge.openSetup();forge.setupDraft.mode='full';forge.setupDraft.packs=forge.toolPackState.packs.filter(p=>p.available).map(p=>p.id);forge.setupStep=1;forge.renderSetup();const missing=[...document.querySelectorAll('#setupPackList input:disabled')].every(e=>!e.checked);forge.setupStep=4;forge.renderSetup();const text=document.querySelector('#setupBody').textContent;document.querySelector('#setupDialog').close();return{missing,downloads:/MB|GCC 15\\.2/.test(text)};})()`);assert.equal(r.missing,true);assert.equal(r.downloads,false);
    });
    await check('IPC denies unexpected operations',async()=>{const r=await evaluate("native('read',{path:'C:/Windows/win.ini'}).then(()=>false,()=>true)");assert.equal(r,true);});
    await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
    window.webContents.invalidate();await window.webContents.capturePage(undefined,{stayHidden:true});await new Promise(resolve=>setTimeout(resolve,300));
    await fs.writeFile(path.join(output,'desktop-editor.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await fs.writeFile(path.join(output,'desktop-smoke.json'),JSON.stringify({platform:process.platform,electron:process.versions.electron,checks,errors,physicalInputTested:false,dom:await evaluate('({panel:forge.currentPanel,console:document.querySelector("#console").getBoundingClientRect().toJSON(),banner:forge.runtimeDiagnostics.banner.getBoundingClientRect().toJSON(),bannerText:forge.runtimeDiagnostics.banner.innerText,style:getComputedStyle(forge.runtimeDiagnostics.banner).display})')},null,2));
    console.log(JSON.stringify({checks:checks.length,output}));
  }catch(error){await fs.writeFile(path.join(output,'desktop-failure.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await fs.writeFile(path.join(output,'desktop-failure.json'),JSON.stringify({checks,error:error.stack,errors,debug:await evaluate('({active:forge?.debugger?.active,paused:forge?.debugger?.paused,frames:forge?.debugger?.frames,execution:forge?.debugger?.nativeExecution,stopSerial:forge?.debugger?.stopSerial,variablesSerial:forge?.debugger?.variablesSerial,breakpoints:[...forge.debugger.breakpoints],root:forge.state.root,log:document.querySelector("#debugLogOutput").textContent.slice(-12000)})')},null,2));throw error;}
}
module.exports={runSmoke};
