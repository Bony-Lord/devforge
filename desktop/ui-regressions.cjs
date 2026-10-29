'use strict';
// Real Electron UI regressions. All projects and settings belong to this fixture.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const reportFile=path.resolve(process.env.DEVFORGE_UI_REPORT||path.join(__dirname,'test-results/ui-regressions.json')),directory=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-ui-')),target=path.resolve(process.argv.find(a=>a.startsWith('--app='))?.slice(6)||__dirname),checks=[],exceptions=[],consoleErrors=[],pending=new Map();let sequence=0,ws,child,output='',failed,failureState;
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(require('electron'),[target,'--isolated','--headless-check','--cdp-port='+port,'--data-dir='+directory],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
 async function check(name,expression){const actual=await evaluate(expression);checks.push({test:name,passed:actual===true});console.log((actual===true?'PASS ':'FAIL ')+name);assert.equal(actual,true,name);}
 async function until(expression,seconds=30){const end=Date.now()+seconds*1000;while(true){try{if(await evaluate(expression))return;}catch(error){if(!/context.*destroy|Cannot find context|execution context/i.test(error.message))throw error;}if(Date.now()>end)throw Error('Timed out: '+expression);await delay(80);}}
 try{
  const deadline=Date.now()+30000;let page;
  while(!page){if(child.exitCode!==null)throw Error('Editor exited during startup: '+output);try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page');}catch{}if(Date.now()>deadline)throw Error('Editor CDP unavailable: '+output);if(!page)await delay(100);}
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')consoleErrors.push(message.params.args.map(a=>a.description||a.value||'').join(' '));const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(message.error.message)):request.resolve(message.result||{});}});
  await command("Runtime.enable");
  await until("window.forge?.startupComplete");
  await evaluate("(async()=>{localStorage.setItem('gccStudioLanguage','ru');forge.settings.language='ru';await native('settingsCommit',forge.settings);})()");
  await command("Page.reload");
  await until("window.forge?.startupComplete");
  await evaluate("forge.sessionReady");
  await evaluate("forge.templates.ready");
  await evaluate("forge.skipSetup()");
  await evaluate("StudioPopover.close();forge.newProject()");
  await check("Create is enabled before requesting a preview","!document.querySelector('[data-template-apply]').disabled");
  await evaluate("(()=>{const f=document.querySelector('.studio-template-form');f.elements.template.value='studio.template.empty';f.elements.template.dispatchEvent(new Event('change'));f.elements.projectName.value='direct-create';f.elements.projectName.dispatchEvent(new Event('input'));f.querySelector('[data-template-apply]').click();})()");
  await until("forge.state.projectLabels?.[forge.state.project]==='direct-create'&&!StudioPopover.current",30);
  await check("One Create click creates and opens the selected project","forge.configurations.document.projectType==='empty'&&!!forge.state.root");
  await evaluate("forge.newProject()");
  await evaluate("document.querySelector('[name=projectName]').value='';document.querySelector('[name=projectName]').dispatchEvent(new Event('input'))");
  await check("An empty project name blocks creation","document.querySelector('[data-template-apply]').disabled");
  await evaluate("StudioPopover.close();document.querySelector(\"#extensionsButton\").click()");
  await until("forge.active?.virtual==='addons'&&!!document.querySelector('#addonsDialog')",15);
  await check("Extensions open as a normal editor tab without a modal or backdrop","forge.active.virtual==='addons'&&document.querySelector('#addonsDialog').tagName==='SECTION'&&!document.querySelector('dialog[open]')&&document.querySelector('#tabs .tab.active').textContent.includes('Дополнения')");
  await check('Utility tabs do not show a file-only read-only badge or internal URI',"getComputedStyle(document.querySelector('#readonlyBadge')).display==='none'&&document.querySelector('#breadcrumb').textContent==='Дополнения'");
  await check("Extensions page stays within its editor pane","(()=>{const r=document.querySelector('#addonsDialog').getBoundingClientRect(),p=document.querySelector('#editor').getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.width>500;})()");
  await evaluate("(()=>{const input=document.querySelector('.market-filters input[type=search]');input.value='@pack notebook';input.dispatchEvent(new Event('input'));})()");
  await check('Marketplace search filters packs without rebuilding its focused search field',"document.querySelectorAll('.market-item').length>0&&[...document.querySelectorAll('.market-item')].every(r=>r.textContent.toLowerCase().includes('notebook')||r.textContent.toLowerCase().includes('ноутбук'))");
  await evaluate("document.querySelector('.market-title').click()");
  await until("!!document.querySelector('.market-detail')");await check('Marketplace details stay in the editor and list dependencies',"!!document.querySelector('.market-detail code')&&!!document.querySelector('.market-detail h3')&&!document.querySelector('dialog[open]')");
  await evaluate("document.querySelector('.studio-marketplace>button').click()");await until("!!document.querySelector('.market-filters')");
  await check('Marketplace retains its search after returning from extension details',"document.querySelector('.market-filters input').value==='@pack notebook'");
  await evaluate("(()=>{const input=document.querySelector('.market-filters input');input.value='';input.dispatchEvent(new Event('input'));})()");
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(120);
  const preview=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:0,y:0,width:1360,height:640,scale:1}});await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile.replace(/\.json$/,'.png'),Buffer.from(preview.data,'base64'));

  await evaluate("forge.projectLibrary.settings(document.querySelector('#projectSettingsButton'))");
  await check("Project settings have a dedicated entry point and distinct run/global icons","StudioPopover.current.element.textContent.includes('Настройки проекта')&&document.querySelector('#projectSettingsButton').innerHTML!==document.querySelector('#editRunConfigurations').innerHTML&&document.querySelector('#editRunConfigurations').innerHTML!==document.querySelector('#settingsButton').innerHTML");
  await evaluate("StudioPopover.close();forge.templates.open('attachment')");await until("!!document.querySelector('.studio-template-form')");
  await check('Attach is available without requesting a preview',"!document.querySelector('[data-template-apply]').disabled");
  await evaluate("document.querySelector('[data-template-apply]').click()");await until('!StudioPopover.current');
  await check('A single Attach click writes the selected EditorConfig template',"forge.treeData.some(f=>f.name==='.editorconfig')");
  await evaluate("(async()=>{await native('write',{path:forge.state.root+'/.editorconfig',text:'# existing custom settings\\n'});await forge.templates.open('attachment');document.querySelector('[data-template-apply]').click();})()");
  await until("!!document.querySelector('.template-conflict input')");
  await check('Conflicting attachments keep a usable explicit replacement review',"!!document.querySelector('.template-conflict input')&&!document.querySelector('[data-template-apply]').disabled");
  await evaluate("document.querySelector('.template-conflict input').click();document.querySelector('[data-template-apply]').click()");await until('!StudioPopover.current');
  await check('Confirmed template replacement completes without a mandatory Preview click',"forge.treeData.some(f=>f.name==='.editorconfig')");
  await evaluate("(async()=>{StudioPopover.close();const roots=['studio.run-configurations','studio.pack.essentials','studio.console','studio.terminal','studio.debugger','studio.diagnostics'];await forge.addons.host.prepare(StudioAddonCore.resolve(forge.addons.catalog,roots));forge.addons.projectScoped=false;await forge.addons.apply(roots);})()");
  await check('Run configuration icon fits entirely in its header button',"(()=>{const b=document.querySelector('#editRunConfigurations'),r=b.getBoundingClientRect(),s=b.querySelector('svg').getBoundingClientRect(),p=b.parentElement.getBoundingClientRect();return r.width>=28&&s.left>=r.left&&s.right<=r.right&&r.right<=p.right+1;})()");
  await evaluate("forge.showPanel(\"console\")");
  await check("Simple interface opens console pane","(()=>{const r=document.querySelector('#console').getBoundingClientRect();return forge.currentPanel==='console'&&!document.body.classList.contains('panel-hidden')&&r.width>100&&r.height>30;})()");
  await evaluate("forge.showPanel(\"terminal\")");
  await check("Simple interface opens terminal pane","(()=>{const r=document.querySelector('#terminal').getBoundingClientRect();return forge.currentPanel==='terminal'&&!document.body.classList.contains('panel-hidden')&&r.width>100&&r.height>30;})()");
  await evaluate("forge.showPanel(\"problems\")");
  await check("Simple interface opens problems pane","(()=>{const r=document.querySelector('#problems').getBoundingClientRect();return forge.currentPanel==='problems'&&!document.body.classList.contains('panel-hidden')&&r.width>100&&r.height>30;})()");
  await evaluate("forge.showPanel(\"debug\")");
  await check("Simple interface opens debug pane","(()=>{const r=document.querySelector('#debug').getBoundingClientRect();return forge.currentPanel==='debug'&&!document.body.classList.contains('panel-hidden')&&r.width>100&&r.height>30;})()");
  await evaluate("(async()=>{await forge.addons.host.prepare(StudioAddonCore.resolve(forge.addons.catalog,[...forge.addons.baseProfile,'studio.window-manager']));forge.addons.projectScoped=false;await forge.addons.apply([...forge.addons.baseProfile,'studio.window-manager']);forge.configurations.document.interface={mode:'windows'};await forge.configurations.save();await forge.configurations.applyProjectContext();})()");
  await until("window.forge?.startupComplete&&!!forge.windows",30);
  await evaluate("forge.sessionReady");
  await evaluate("(async()=>{await native('newFile',{path:'example.cpp',text:'int main() { return 0; }\\n'});await forge.refreshTree();await forge.openFile(forge.state.root+'/example.cpp');})()");
  await check("Explorer and code start in separate groups","forge.windows.api.getPanel('navigator').group!==forge.windows.editorPanel('primary').group");
  await evaluate('forge.windows.reset()');await delay(350);
  await check('Initial horizontal editor to project ratio is between four and six',"(()=>{const n=forge.windows.api.getPanel('navigator').group.element.getBoundingClientRect(),e=forge.windows.editorPanel('primary').group.element.getBoundingClientRect();return e.width/n.width>=4&&e.width/n.width<=6;})()");
  await evaluate("forge.windows.clearCodeWindows();void forge.windows.show('project')");
  await evaluate("(async()=>{await forge.openFile(forge.state.root+'/example.cpp');})()");
  await check("Opening code after clearing the previous project cannot join the explorer group","forge.windows.api.getPanel('navigator').group!==forge.windows.editorPanel('primary').group");
  await evaluate("document.querySelector('#extensionsButton').click()");await until("forge.active?.virtual==='addons'");
  await check('Extensions tab does not become the current-file build source',"(()=>{const c=forge.configurations.document.configurations[0],type=c.type,source=c.source;c.type='file';c.source='';const selected=forge.configurations.current().path;c.type=type;c.source=source;return selected===forge.state.root+'/example.cpp';})()");

  await evaluate("forge.newProject()");
  await evaluate("(()=>{const f=document.querySelector('.studio-template-form');f.elements.template.value='studio.template.notebook';f.elements.template.dispatchEvent(new Event('change'));f.elements.projectName.value='notebook-context';f.elements.projectName.dispatchEvent(new Event('input'));f.querySelector('[data-template-apply]').click();})()");
  await until("window.forge?.startupComplete&&forge.state.projectLabels?.[forge.state.project]==='notebook-context'&&forge.active?.path.endsWith('.ipynb')",60);
  await check("Notebook project retains the application window manager","!!forge.windows&&forge.addons.host.enabled('windows')&&forge.addons.baseProfile.some(r=>(typeof r==='string'?r:r.id)==='studio.window-manager')");
  await check('Notebook projects also begin with four to six times more editor width than navigator',"(()=>{const n=forge.windows.api.getPanel('navigator').group.element.getBoundingClientRect(),e=forge.windows.editorPanel('primary').group.element.getBoundingClientRect();return e.width/n.width>=4&&e.width/n.width<=6;})()");
  await check("Ordinary application extensions remain active across project specialization","forge.addons.host.enabled('windows')&&forge.addons.host.enabled('keyboard')&&forge.addons.host.enabled('notebooks')");
  await evaluate("window.bookView=StudioDocumentViews.pane(forge.editor).documentView;window.cell=bookView.body.querySelector('textarea');cell.focus();cell.select()");
  await command('Input.insertText',{text:'import math\nmath.'});await until("!!forge.pythonIntelligence.popup?.items?.some(i=>i.label==='sqrt')",30);
  await check('Notebook typing produces real Python completions without a hotkey',"forge.pythonIntelligence.popup.items.some(i=>i.label==='sqrt')&&forge.addons.host.intelligenceState.installed");
  const completionPreview=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:0,y:0,width:1360,height:640,scale:1}});await fs.writeFile(reportFile.replace(/\.json$/,'-notebook-completion.png'),Buffer.from(completionPreview.data,'base64'));
  await evaluate("forge.pythonIntelligence.hide();cell.select()");await command('Input.insertText',{text:'if True:'});await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await check('Notebook Enter indents Python blocks through actual input events',"cell.value==='if True:\\n    '");
  await command('Input.insertText',{text:'print'});await command('Input.insertText',{text:'('});
  await check('Notebook automatically pairs an opening parenthesis',"cell.value.endsWith('print()')&&cell.selectionStart===cell.value.length-1");
  await command('Input.insertText',{text:')'});await check('Typing the matching closing parenthesis skips it without duplicating',"cell.value.endsWith('print()')&&cell.selectionStart===cell.value.length");
  await evaluate("forge.pythonIntelligence.hide();void bookView.resourceSettings(bookView.interpreterButton)");await until("!!StudioPopover.current?.element.querySelector('input[type=number]')");
  await evaluate("(()=>{const form=StudioPopover.current.element,inputs=form.querySelectorAll('input');inputs[0].value='256';inputs[1].value='5';form.requestSubmit();})()");await until('!StudioPopover.current');
  await check('Notebook resource limits persist in its standard metadata',"bookView.value.metadata.devforge.resources.notebookMemoryMb===256&&bookView.value.metadata.devforge.resources.notebookTimeoutSeconds===5");
  await evaluate("(async()=>{await native('newFile',{path:'smart.py',text:''});await forge.refreshTree();await forge.openFile(forge.state.root+'/smart.py');})()");await delay(200);
  await evaluate("forge.editor.focus();forge.editor.trigger('keyboard','type',{text:'if True:'});forge.editor.trigger('keyboard','type',{text:'\\n'});forge.editor.trigger('keyboard','type',{text:'print'});forge.editor.trigger('keyboard','type',{text:'('})");
  await check('Python source files use indentation and paired brackets in the real editor',"forge.active.model.getLanguageId()==='python'&&forge.active.model.getValue(monaco.editor.EndOfLinePreference.LF)==='if True:\\n    print()'");
  const routes=await evaluate("(()=>{const action=forge.action,focus=forge.toggleFocusMode,debug=forge.debugBuild,calls=[];forge.debugBuild=()=>calls.push('debug');forge.action=id=>calls.push(id);forge.toggleFocusMode=()=>calls.push('focus');try{for(const [key,ctrl,alt,shift]of [['F12',true,false,false],['F12',true,true,false],['F12',true,false,true],['y',true,false,false],['p',true,true,false],['d',true,true,false]])forge.editor.getDomNode().dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:ctrl,altKey:alt,shiftKey:shift,bubbles:true,cancelable:true}));return calls;}finally{forge.action=action;forge.toggleFocusMode=focus;forge.debugBuild=debug;}})()");assert.deepEqual(routes,['editor.action.quickOutline','focus','editor.action.triggerParameterHints','debug']);checks.push({test:'Exact shortcut modifiers separate outline/focus/completion and preserve Ctrl+Y redo',passed:true});
  await command('Emulation.setDeviceMetricsOverride',{width:800,height:880,deviceScaleFactor:1,mobile:false});await delay(120);
  await check('Run settings remain accessible in a narrower desktop header',"(()=>{const r=document.querySelector('#editRunConfigurations').getBoundingClientRect(),s=document.querySelector('#editRunConfigurations svg').getBoundingClientRect();return r.width>=28&&s.right<=innerWidth&&s.left>=r.left&&s.right<=r.right;})()");await command('Emulation.clearDeviceMetricsOverride');await delay(120);
  await evaluate("(async()=>{await native('newFolder',{path:forge.state.root+'/build'});await native('newFile',{path:'build/result.txt',text:'artifact'});await native('newFile',{path:'.hidden-example/value.txt',text:'config'});await forge.refreshTree();})()");
  await check('Build is visible and large generated folders load on demand',"forge.treeData.some(f=>f.name==='build'&&f.dir&&f.unloaded)&&[...document.querySelectorAll('.tree-row')].some(r=>r.textContent.includes('build'))");
  await evaluate("[...document.querySelectorAll('.tree-row')].find(r=>r.textContent.includes('build')).click()");await until("!![...document.querySelectorAll('.tree-row')].find(r=>r.textContent.includes('result.txt'))");
  await check('Hidden directory descendants inherit their yellow marker',"[...document.querySelectorAll('.tree-row')].find(r=>r.textContent.includes('value.txt')).classList.contains('tree-hidden')");
  await evaluate("forge.projectLibrary.openProject(Object.keys(forge.state.projectLabels).find(id=>forge.state.projectLabels[id]==='direct-create'))");await until("!!StudioPopover.current?.element.textContent.includes('В новом окне')");
  await check('Opening another desktop project offers this window or a new window',"StudioPopover.current.element.textContent.includes('В этом окне')&&StudioPopover.current.element.textContent.includes('В новом окне')");
  const primaryProject=await evaluate('forge.state.project');await evaluate("[...StudioPopover.current.element.querySelectorAll('button')].find(b=>b.textContent.includes('В новом окне')).click()");
  let peer;const peersDeadline=Date.now()+30000;while(!peer){peer=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page'&&p.id!==page.id);if(Date.now()>peersDeadline)throw Error('Second project window did not open');if(!peer)await delay(100);}
  const peerSocket=new WebSocket(peer.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{peerSocket.addEventListener('open',resolve,{once:true});peerSocket.addEventListener('error',reject,{once:true});});let peerSequence=0;
  const peerEval=expression=>new Promise((resolve,reject)=>{const id=++peerSequence,timer=setTimeout(()=>{peerSocket.removeEventListener('message',onMessage);reject(Error('Second window timed out'));},30000);const onMessage=event=>{const result=JSON.parse(event.data);if(result.id!==id)return;clearTimeout(timer);peerSocket.removeEventListener('message',onMessage);result.error||result.result.exceptionDetails?reject(Error(JSON.stringify(result))):resolve(result.result.result.value);};peerSocket.addEventListener('message',onMessage);peerSocket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
  while(!await peerEval('!!window.forge?.startupComplete'))await delay(150);const peerState=await peerEval("({label:forge.state.projectLabels[forge.state.project],windows:forge.addons.host.enabled('windows'),root:forge.state.root})");assert.equal(peerState.label,'direct-create');assert(peerState.windows);await check('Second project opens independently and inherits application extensions','forge.state.project==='+JSON.stringify(primaryProject));checks.push({test:'The new window opens the selected project with the same global extensions',passed:true});
  await peerEval("(async()=>{await native('newFile',{path:'peer-only.txt',text:'second window'});await forge.refreshTree();})()");await check('Files created in the other project do not appear in the first project',"!forge.treeData.some(f=>f.name==='peer-only.txt')");await command('Target.closeTarget',{targetId:peer.id});peerSocket.close();const closeDeadline=Date.now()+10000;while((await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).some(p=>p.id===peer.id)){if(Date.now()>closeDeadline)throw Error('Second project window did not close');await delay(100);}await delay(150);
  await evaluate("(async()=>{await forge.openFile(forge.state.root+'/notebook.ipynb');return true;})()");
  await evaluate("document.querySelector('#extensionsButton').click()");
  await until("forge.active?.virtual==='addons'&&document.querySelector('#addonsDialog')");
  await check("Extensions tab works in windowed mode too","forge.windows.api.activePanel.title.includes('Дополнения')&&!document.querySelector('dialog[open]')");
  for(const name of ['console','terminal','problems','debug']){await evaluate('void forge.showPanel('+JSON.stringify(name)+')');await check('Windowed interface opens '+name+' pane',"(()=>{const r=document.querySelector('#"+name+"').getBoundingClientRect();return r.width>100&&r.height>30&&forge.currentPanel==='"+name+"';})()");}
  await evaluate("void forge.windows.show('project');window.treeRow=[...document.querySelectorAll('.tree-row')].find(r=>r.textContent.includes('notebook.ipynb'))");
  let point=await evaluate("(()=>{const r=treeRow.getBoundingClientRect();return{x:r.left+80,y:r.top+r.height/2};})()");
  await command("Emulation.setTouchEmulationEnabled",{"enabled":true,"maxTouchPoints":5});
  await command("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"id":1,...point}]});
  await delay(650);
  await command("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]});
  await check("Touch hold opens the existing file context menu","!document.querySelector('#menu').classList.contains('hidden')");
  await evaluate("document.querySelector('#menu').classList.add('hidden')");
  await command("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"id":2,...point}]});
  await command("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"id":2,"x":point["x"],"y":(point["y"]+30)}]});
  await delay(650);
  await command("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]});
  await check("Scrolling motion cancels the context-menu hold","document.querySelector('#menu').classList.contains('hidden')");
  point=await evaluate("(()=>{const r=treeRow.getBoundingClientRect();return{x:r.left+80,y:r.top+r.height/2};})()");
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,...point}]});await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,...point},{id:4,x:point.x+25,y:point.y}]});await delay(650);await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await check('A second finger cancels a pending long press',"document.querySelector('#menu').classList.contains('hidden')");
  await command("Emulation.setTouchEmulationEnabled",{"enabled":false});
  await evaluate("StudioChoices.open(document.querySelector('#projectSelect'));window.projectRow=[...document.querySelectorAll('.studio-project-row')].find(r=>r.textContent.includes('direct-create'));projectRow.querySelector('.studio-project-more').click()");
  await until("!!StudioPopover.current?.element.textContent.includes('Убрать из списка')");
  await check("Project list exposes visible actions without first opening that project","!!StudioPopover.current.element.textContent.includes('Переместить проект в корзину')");
  await check('Project actions keep the project selector open behind the child menu',"!!StudioChoices.active&&StudioChoices.active.popover.isConnected&&StudioPopover.current.parentChoice===true");
  await evaluate("[...StudioPopover.current.element.querySelectorAll('button')].find(b=>b.textContent.includes('Переместить')).click()");
  await check("Moving project files requires an explicit confirmation showing the exact path","StudioPopover.current.element.textContent.includes('Папка и все файлы')&&StudioPopover.current.element.querySelector('code').textContent.endsWith('/direct-create')");
  await evaluate("[...StudioPopover.current.element.querySelectorAll('button')].find(b=>b.textContent.includes('Отмена')).click()");
  await check("Cancel keeps the project registered","Object.values(forge.state.projectLabels).includes('direct-create')");
  await evaluate("StudioChoices.open(document.querySelector('#projectSelect'));window.projectRow=[...document.querySelectorAll('.studio-project-row')].find(r=>r.textContent.includes('direct-create'));projectRow.querySelector('.studio-project-more').click()");
  await until("!!StudioPopover.current?.element.textContent.includes('Убрать из списка')");
  await evaluate("[...StudioPopover.current.element.querySelectorAll('button')].find(b=>b.textContent.includes('Убрать из списка')).click()");
  await until("!Object.values(forge.state.projectLabels).includes('direct-create')");
  await evaluate("forge.projectLibrary.archive(StudioChoices.buttons.get(document.querySelector('#projectSelect')))");
  await check("Removed projects have a discoverable restore action","StudioPopover.current.element.textContent.includes('direct-create')&&StudioPopover.current.element.textContent.includes('Восстановить в списке')");
  await evaluate("(async()=>{StudioPopover.close();await forge.saveAll();await native('newFile',{path:'keep-exact.txt',text:'unique project data\\n'});})()");
  const fixtureRoot=await evaluate('forge.state.root');const relative=path.relative(directory,fixtureRoot);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Only the fresh fixture project may be moved');
  await evaluate("forge.projectLibrary.menu(forge.state.project,StudioChoices.buttons.get(document.querySelector('#projectSelect')))");
  await evaluate("[...StudioPopover.current.element.querySelectorAll('button')].find(b=>b.textContent.includes('Переместить проект')).click()");
  await until("!!StudioPopover.current?.element.querySelector('.studio-danger')");
  await evaluate("StudioPopover.current.element.querySelector('.studio-danger').click()");
  await until('window.forge?.startupComplete&&!forge.state.project',30);
  await check('Trashing the active project opens the empty workspace',"!forge.state.root&&forge.tabs.length===0&&!document.querySelector('#welcome').classList.contains('hidden')");
  assert.equal(await fs.stat(fixtureRoot).then(()=>true,()=>false),false);
  await evaluate("forge.projectLibrary.archive(StudioChoices.buttons.get(document.querySelector('#projectSelect')))");
  await evaluate("[...StudioPopover.current.element.querySelectorAll('.studio-project-archive-entry')].find(r=>r.textContent.includes('notebook-context')).querySelector('button').click()");
  await until("Object.values(forge.state.projectLabels).includes('notebook-context')");
  assert.equal(await fs.readFile(path.join(fixtureRoot,'keep-exact.txt'),'utf8'),'unique project data\n');checks.push({test:'Restoring a trashed project preserves its exact saved bytes',passed:true});
  checks.push({test:'No renderer exceptions or console errors',passed:!exceptions.length&&!consoleErrors.length});assert.deepEqual(exceptions,[]);assert.deepEqual(consoleErrors,[]);
 }catch(error){failed=error;console.error(error.stack||error);try{failureState=await evaluate("({root:window.forge?.state.root,projects:window.forge?.state.projects,lang:window.forge?.settings.language,cellState:typeof cell!=='undefined'?{value:cell.value,start:cell.selectionStart,focus:document.activeElement===cell}:null,runGeometry:[...document.querySelectorAll('#editRunConfigurations,#editRunConfigurations svg,.studio-run-selectors')].map(e=>({tag:e.tagName,hidden:e.hidden,display:getComputedStyle(e).display,rect:e.getBoundingClientRect().toJSON()})),popup:typeof StudioPopover!=='undefined'?StudioPopover.current?.element.outerHTML.slice(0,5000):null,toast:document.querySelector('#toast')?.textContent})");}catch{}}
 finally{
  for(const request of pending.values())clearTimeout(request.timer);
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++sequence,method:'Browser.close'}));}catch{}ws.close();}
  const deadline=Date.now()+15000;while(child.exitCode===null&&Date.now()<deadline)await delay(100);
  if(child.exitCode===null){if(process.platform==='win32')await new Promise(resolve=>spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).once('exit',resolve));else child.kill('SIGTERM');}
  await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify({checks,exceptions,consoleErrors,error:failed?.message||null,failureState,fixture:directory,editorLog:output},null,2));
  // Delete only the fresh fixture directory owned by this invocation.
  const resolved=await fs.realpath(directory),temporary=await fs.realpath(os.tmpdir());if(path.dirname(resolved)!==temporary||!path.basename(resolved).startsWith('devforge-ui-'))throw Error('Unexpected test fixture path');await fs.rm(resolved,{recursive:true,force:true,maxRetries:20,retryDelay:150});
 }
 if(failed)throw failed;
}
main().catch(()=>{process.exitCode=1;});
