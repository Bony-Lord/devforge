'use strict';
// A real Node extension host, fresh VSIX and disposable project. Kept separate
// from unattended suites so it can evolve while an installed soak run continues.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Application}=require('./soak/cdp.cjs');
async function main(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-columns-')),
  reportFile=path.resolve(process.env.DEVFORGE_COLUMN_REPORT||'work/view-columns/report.json'),
  app=new Application(path.resolve(process.argv.find(a=>a.startsWith('--app='))?.slice(6)||__dirname),directory),checks=[];
 const fixture=path.join(directory,'vsix-source','extension');await fs.mkdir(fixture,{recursive:true});
 await fs.writeFile(path.join(fixture,'package.json'),JSON.stringify({name:'columns',publisher:'fixture',version:'1.0.0',engines:{vscode:'^1.100.0'},main:'main.js',activationEvents:['onCommand:columns.show'],license:'MIT',contributes:{commands:[{command:'columns.show',title:'Column fixture'}]}}));
 await fs.writeFile(path.join(fixture,'main.js'),String.raw`
const v=require('vscode');exports.activate=ctx=>{
 const snapshot=e=>({uri:e.document.uri.toString(),column:e.viewColumn,selection:[e.selection.start.line,e.selection.start.character,e.selection.end.line,e.selection.end.character]});
 const events=[];ctx.subscriptions.push(v.window.onDidChangeTextEditorViewColumn(e=>events.push(snapshot(e.textEditor))));
 ctx.subscriptions.push(v.commands.registerCommand('columns.show',async(name,column,keep=false)=>{
  const uri=v.Uri.joinPath(v.workspace.workspaceFolders[0].uri,name),editor=await v.window.showTextDocument(uri,{viewColumn:column,preserveFocus:keep,preview:false,selection:new v.Range(0,1,0,4)});
  return snapshot(editor);
 }));
 ctx.subscriptions.push(v.commands.registerCommand('columns.state',()=>({active:v.window.activeTextEditor&&snapshot(v.window.activeTextEditor),visible:v.window.visibleTextEditors.map(snapshot),events})));
 ctx.subscriptions.push(v.commands.registerCommand('columns.clearEvents',()=>{events.length=0;return true;}));
 ctx.subscriptions.push(v.commands.registerCommand('columns.command',async(name,column,withEditor=false)=>{const uri=v.Uri.joinPath(v.workspace.workspaceFolders[0].uri,name);if(withEditor)await v.commands.executeCommand('vscode.openWith',uri,'default',{viewColumn:column,preview:false});else await v.commands.executeCommand('vscode.open',uri,{viewColumn:column,preview:false});return true;}));
 ctx.subscriptions.push(v.commands.registerCommand('columns.reshow',async(name,column)=>{const e=v.window.visibleTextEditors.find(e=>e.document.uri.path.endsWith('/'+name));if(!e)throw Error('Source editor not visible');e.show(column);return true;}));
 ctx.subscriptions.push(v.workspace.registerTextDocumentContentProvider('columns-memory',{provideTextDocumentContent:()=> 'int virtual_column;'}));
 ctx.subscriptions.push(v.commands.registerCommand('columns.virtual',async(column)=>{const e=await v.window.showTextDocument(v.Uri.parse('columns-memory:/virtual.cpp'),{viewColumn:column,preview:false});return snapshot(e);}));
};`);
 const zip=path.join(directory,'columns.vsix');await require('./archive.cjs').zipDirectory(path.dirname(fixture),zip);
 const pkg=await new(require('./vscode-runtime.cjs').VSCodeRuntime)({ws:{data:directory}}).prepare(await fs.readFile(zip));
 const base=['studio.pack.essentials','studio.console','studio.run-configurations'];
 await fs.writeFile(path.join(directory,'settings.json'),JSON.stringify({settings:{language:'ru',setupDismissed:true,interfaceMode:'simple'},session:{},projects:{},current:'',projectSelectionCleared:true}));
 await fs.writeFile(path.join(directory,'addons.json'),JSON.stringify({schemaVersion:1,revision:0,packages:[],profile:{schemaVersion:1,modulesVersion:2,defaultRequested:base,requested:base,resolved:[],activating:false,safeMode:false}}));
 await fs.mkdir(path.dirname(reportFile),{recursive:true});let failure;
 try{
  await app.launch();const c=app.cdp,evaluate=expression=>c.evaluate(expression,45000);
  await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await c.until('window.forge?.startupComplete');await evaluate('forge.sessionReady');await evaluate('forge.templates.ready');
  await evaluate("forge.templates.open('project')");
  await evaluate("(()=>{const f=document.querySelector('.studio-template-form');f.elements.template.value='studio.template.empty';f.elements.template.dispatchEvent(new Event('change'));f.elements.projectName.value='column-fixture';f.elements.projectName.dispatchEvent(new Event('input'));f.querySelector('[data-template-apply]').click();})()");
  await c.until("window.forge?.startupComplete&&forge.state.projectLabels?.[forge.state.project]==='column-fixture'&&!StudioPopover.current");
  await evaluate("(async()=>{for(const name of ['first.cpp','second.cpp','third.cpp','fourth.cpp'])await native('newFile',{path:forge.state.root+'/'+name,text:'int '+name.split('.')[0]+';'});await forge.openFile(forge.state.root+'/first.cpp');})()");
  await evaluate('forge.addons.review('+JSON.stringify(pkg)+',false)');
  await evaluate("(async()=>{const p=forge.addons.pendingReview;p.accepted=true;await forge.addons.install(p.pkg,true);await forge.openFile(forge.state.root+'/first.cpp');})()");
  async function check(name,expression){let actual;try{actual=await evaluate(expression);}catch(error){actual=error.stack;}checks.push({name,passed:actual===true,...actual===true?{}:{actual}});console.log((actual===true?'PASS ':'FAIL ')+name);}
  await evaluate("globalThis.columnGroups=()=>{const ids=[],walk=n=>{if(n.type==='leaf')ids.push(n.data.id);else n.data.forEach(walk);};walk(forge.windows.api.toJSON().grid.root);return forge.windows.api.groups.filter(g=>!g.panels.length||g.panels.some(p=>forge.windows.isCode(p.id))).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));};globalThis.columnOf=editor=>columnGroups().indexOf(forge.windows.editorPanel(StudioDocumentViews.pane(editor)?.id)?.group)+1;");
  await check('One targets the first physical source group',"(async()=>{const r=await StudioCodeOSS.api.execute('columns.show','first.cpp',1);return columnOf(forge.editor)===1&&r.column===1&&r.selection.join()==='0,1,0,4'||{r,column:columnOf(forge.editor)};})()");
  await check('Two creates a source group without moving the first document',"(async()=>{const first=forge.editor,r=await StudioCodeOSS.api.execute('columns.show','second.cpp',2);return columnOf(forge.editor)===2&&columnOf(first)===1&&first.getValue()==='int first;'&&r.column===2||{r,column:columnOf(forge.editor),first:columnOf(first)};})()");
  await check('A cached source can have independent views in One and Two',"(async()=>{await StudioCodeOSS.api.execute('columns.show','first.cpp',2);const right=forge.editor;await StudioCodeOSS.api.execute('columns.show','first.cpp',1);return columnOf(right)===2&&columnOf(forge.editor)===1&&right!==forge.editor&&right.getModel()===forge.editor.getModel();})()");
  await check('preserveFocus returns Three while keeping the first source focused',"(async()=>{const old=forge.editor,r=await StudioCodeOSS.api.execute('columns.show','third.cpp',3,true);return r.column===3&&forge.editor===old&&old.hasTextFocus()&&columnOf(old)===1||{r,column:columnOf(forge.editor),focused:old.hasTextFocus()};})()");
  await check('Active stays in the selected physical group',"(async()=>{await StudioCodeOSS.api.execute('columns.show','second.cpp',2);const r=await StudioCodeOSS.api.execute('columns.show','fourth.cpp',-1);return r.column===2&&columnOf(forge.editor)===2||{r,column:columnOf(forge.editor)};})()");
  await check('Beside reuses the neighboring physical group',"(async()=>{await StudioCodeOSS.api.execute('columns.show','first.cpp',1);const r=await StudioCodeOSS.api.execute('columns.show','fourth.cpp',-2);return r.column===2&&columnOf(forge.editor)===2&&columnGroups().length===3||{r,column:columnOf(forge.editor),groups:columnGroups().length};})()");
  await check('Visible editor columns describe groups rather than tab creation order',"(async()=>{const s=await StudioCodeOSS.api.execute('columns.state');return s.visible.length===3&&s.visible.every(e=>e.column>=1&&e.column<=3)&&new Set(s.visible.map(e=>e.column)).size===3||s;})()");
  await check('Virtual source still opens in the genuine workbench editor',"(async()=>{const r=await StudioCodeOSS.api.execute('columns.virtual',2),g=await StudioCodeOSS.api.getService(StudioCodeOSS.api.IEditorGroupsService);return r.uri.startsWith('columns-memory:')&&g.mainPart.getGroups(2).length===2&&forge.active.path==='devforge://extensions/studio.codeoss/editor'||{r,groups:g.mainPart.getGroups(2).length,active:forge.active.path};})()");
  await check('Native opening after a virtual editor still honors One',"(async()=>{const r=await StudioCodeOSS.api.execute('columns.show','first.cpp',1);return r.column===1&&columnOf(forge.editor)===1&&forge.editor.getValue()==='int first;';})()");
  await check('vscode.open uses the requested source group',"(async()=>{await StudioCodeOSS.api.execute('columns.command','second.cpp',3);return columnOf(forge.editor)===3&&forge.editor.getValue()==='int second;';})()");
  await check('vscode.openWith default uses the requested source group',"(async()=>{await StudioCodeOSS.api.execute('columns.command','third.cpp',1,true);return columnOf(forge.editor)===1&&forge.editor.getValue()==='int third;';})()");
  await evaluate("(async()=>{await StudioCodeOSS.api.execute('columns.reshow','second.cpp',2);})()");
  await c.until("forge.active?.path.endsWith('/second.cpp')&&columnOf(forge.editor)===2");
  await check('TextEditor.show shares the same native column routing',"columnOf(forge.editor)===2");
  await evaluate("(async()=>{await StudioCodeOSS.api.execute('columns.clearEvents');const groups=columnGroups(),panels=[...groups[2].panels],active=groups[2].activePanel;globalThis.columnMovedPath=forge.windows.codeWindows.get(active.id).path;panels[0].api.moveTo({group:groups[0],position:'left'});const destination=panels[0].group;for(const panel of panels.slice(1))panel.api.moveTo({group:destination,position:'center'});active.api.setActive();})()");
  await check('Moving a source group updates extension column events',"(async()=>{for(let n=0;n<30;n++){const s=await StudioCodeOSS.api.execute('columns.state');if(s.events.some(e=>e.column===1&&e.uri.endsWith('/'+columnMovedPath.split('/').at(-1))))return true;await new Promise(r=>setTimeout(r,40));}return await StudioCodeOSS.api.execute('columns.state');})()");
  await check('Explicit One follows the new layout order',"(async()=>{const r=await StudioCodeOSS.api.execute('columns.show','first.cpp',1);return r.column===1&&columnOf(forge.editor)===1;})()");
  await check('Closing a physical group renumbers the remaining editors',"(async()=>{const group=columnGroups()[1];for(const panel of [...group.panels])await forge.windows.closeDocumentWindow(panel.id);for(let n=0;n<30;n++){const s=await StudioCodeOSS.api.execute('columns.state');if(columnGroups().length===2&&s.visible.every(e=>e.column<=2))return true;await new Promise(r=>setTimeout(r,40));}return await StudioCodeOSS.api.execute('columns.state');})()");
  await check('An empty editor in another group cannot consume an explicit target',"(async()=>{const w=forge.windows,id='code-'+(++w.codeSequence),empty=w.ensureCode(id);w.api.addPanel({id,component:'studio',title:'Empty fixture',params:{},position:{referenceGroup:columnGroups()[1],direction:'within'}});const r=await StudioCodeOSS.api.execute('columns.show','fourth.cpp',3),ok=r.column===3&&columnOf(forge.editor)===3&&empty.editor.getModel()===null;w.removeCode(id);return ok||{r,column:columnOf(forge.editor)};})()");
  await check('Nine creates intervening empty groups without stealing existing views',"(async()=>{const old=forge.editor,r=await StudioCodeOSS.api.execute('columns.show','fourth.cpp',9);return r.column===9&&columnOf(forge.editor)===9&&columnGroups().length===9&&old.getModel()&&columnOf(old)<9||{r,column:columnOf(forge.editor),groups:columnGroups().length};})()");
  await check('Reopening Nine reuses its tab and leaves empty groups stable',"(async()=>{const old=forge.editor,count=forge.windows.api.panels.length;await StudioCodeOSS.api.execute('columns.show','fourth.cpp',9);return forge.editor===old&&forge.windows.api.panels.length===count&&columnGroups().length===9;})()");
  await check('No unexpected renderer exceptions',JSON.stringify(c.events.length===0));
  await fs.writeFile(reportFile.replace(/\.json$/,'.png'),await c.screenshot());
 }catch(error){failure=error.stack;console.error(failure);}finally{
  await app.close();await fs.writeFile(reportFile,JSON.stringify({directory,checks,failure,exceptions:app.cdp?.events,output:app.output},null,2));
 }
 if(failure||checks.some(c=>!c.passed))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
