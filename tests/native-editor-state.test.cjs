'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let checks=0;
function environment(){
  const calls=[],forge={settings:{smartFormatOnClose:true},diagnosticMap:new Map()},context={console,Map,Set,Promise,setTimeout,clearTimeout,requestAnimationFrame(){},window:{forge,addEventListener(){}},document:{documentElement:{}},MutationObserver:class{observe(){}},onNative(){},safeError(){},native:async(op,data)=>{calls.push({op,data});if(op==='editorSnapshot')return[];return true;},monaco:{editor:{getModelMarkers(){return[];}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/ui/native-editor.js'),'utf8')+'\nglobalThis.editing=NativeEditing;',context);
  return{context,editing:context.editing,forge,calls};
}
function formatting(){
  const env=environment(),{editing:e}=env;let text='void f(){}',version=1,selected=false,disposed=0;
  const model={uri:{toString:()=> 'file:///fixture.cpp',fsPath:'/fixture.cpp'},isDisposed:()=>false,getVersionId:()=>version,getValue:()=>text,getDecorationRange:()=>({startLineNumber:1,endLineNumber:1,getEndPosition:()=>({lineNumber:1,column:text.length+1})}),getOffsetAt:p=>p.column-1,deltaDecorations:()=>{disposed++;return[];}};
  const pane={editor:{getModel:()=>model,getSelection:()=>({getStartPosition:()=>({lineNumber:1,column:selected?1:text.length+1}),getEndPosition:()=>({lineNumber:1,column:text.length+1})})},opening:Promise.resolve()};
  e.panes.set('primary',pane);e.revisions.set('file:///fixture.cpp',0);
  const job={uri:'file:///fixture.cpp',id:'primary',model,sequence:1,decoration:'tracked-range'};e.formatJobs.set(job.uri,job);let rescheduled=0;e.scheduleFormat=()=>rescheduled++;
  return{...env,e,model,pane,job,get disposed(){return disposed;},get rescheduled(){return rescheduled;},edit(){text+='x';version++;e.revisions.set(job.uri,1);},select(){selected=true;}};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function formatterRace(kind){
  const f=formatting(),entered=deferred(),reply=deferred();
  f.context.native=async(op,data)=>{f.calls.push({op,data});if(op==='editorSnapshot')return[];if(op==='formatterOnType'){entered.resolve();return reply.promise;}return true;};
  const running=f.e.formatBlock(f.job);await entered.promise;
  if(kind==='text')f.edit();else f.job.sequence++;
  reply.resolve({code:0,text:'void f() {\n}\n',cursor:12});await running;
  assert.equal(f.calls.some(c=>c.op==='editorFormatEdits'),false);assert.equal(f.e.formatJobs.get(f.job.uri),f.job);assert.equal(f.rescheduled,1);checks++;
}
(async()=>{
  await formatterRace('text');await formatterRace('sequence');
  {
    const f=formatting(),entered=deferred(),reply=deferred();
    f.context.native=async(op,data)=>{f.calls.push({op,data});if(op==='editorSnapshot')return[];if(op==='formatterOnType')return{code:0,text:'void f() {\n}\n',cursor:12};if(op==='editorFormatEdits'){entered.resolve();return reply.promise;}};
    const running=f.e.formatBlock(f.job);await entered.promise;f.job.sequence++;reply.resolve(true);await running;
    assert.equal(f.e.formatJobs.get(f.job.uri),f.job);assert.equal(f.disposed,0);assert.equal(f.rescheduled,1);checks++;
  }
  {
    const f=formatting();f.context.native=async(op,data)=>{f.calls.push({op,data});if(op==='editorSnapshot')return[];if(op==='formatterOnType')return{code:0,text:'void f() {\n}\n',cursor:12};return true;};
    await f.e.formatBlock(f.job);const sent=f.calls.find(c=>c.op==='editorFormatEdits').data;
    assert.equal(sent.revision,0);assert.equal(sent.expectedStart,10);assert.equal(sent.expectedEnd,10);assert.equal(sent.cursor,12);assert.equal(f.e.formatJobs.has(f.job.uri),false);checks++;
  }
  {
    const f=formatting();f.select();await f.e.formatBlock(f.job);assert.equal(f.calls.some(c=>c.op==='formatterOnType'),false);assert.equal(f.e.formatJobs.has(f.job.uri),true);assert.equal(f.rescheduled,0);checks++;
  }
  {
    const f=formatting();f.pane.editor.getModel=()=>({uri:{toString:()=> 'file:///other.cpp'}});await f.e.formatBlock(f.job);assert.equal(f.calls.some(c=>c.op==='formatterOnType'),false);assert.equal(f.e.formatJobs.has(f.job.uri),false);checks++;
  }
  {
    const f=formatting();f.context.native=async(op,data)=>{f.calls.push({op,data});if(op==='editorSnapshot')return[];if(op==='formatterOnType')return{code:0,text:'void f() {\n}\n',cursor:12};return false;};
    await f.e.formatBlock(f.job);assert.equal(f.e.lastOnTypeResult.status,'stale');assert.equal(f.e.formatJobs.has(f.job.uri),true);assert.equal(f.rescheduled,1);checks++;
  }
  {
    const f=formatting();f.context.native=async(op)=>op==='editorSnapshot'?[]:{code:0,text:'void f(){}'};
    await f.e.formatBlock(f.job);assert.equal(f.e.lastOnTypeResult.status,'unchanged');assert.equal(f.e.formatJobs.has(f.job.uri),false);checks++;
  }
  {
    const f=formatting();f.context.native=async(op)=>op==='editorSnapshot'?[]:{code:1,error:'Invalid style'};
    await f.e.formatBlock(f.job);assert.equal(f.e.lastOnTypeResult.status,'formatter-error');assert.equal(f.e.formatJobs.has(f.job.uri),false);checks++;
  }
  {
    const {editing:e,context,calls,forge}=environment(),uri='file:///fixture.cpp';let version=3;
    const model={uri:{toString:()=>uri},isDisposed:()=>false,getVersionId:()=>version,getOffsetAt:p=>p.column-1};e.revisions.set(uri,9);
    forge.diagnosticMap.set(uri,{version:3,diagnostics:[{range:{start:{line:0,character:4},end:{line:0,character:10}},severity:2,message:'unused variable',tags:[1]}]});
    await e.publishDiagnostics(model);assert.equal(calls.at(-1).data.unusedStyles.length,1);assert.equal(calls.at(-1).data.diagnostics.length,1);assert.equal(calls.at(-1).data.revision,9);checks++;
    version=4;await e.publishDiagnostics(model);assert.equal(calls.at(-1).data.unusedStyles.length,0);assert.equal(calls.at(-1).data.diagnostics.length,0);checks++;
    context.monaco.editor.getModelMarkers=()=>[{owner:'cmake',startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:2,severity:8,message:'Unknown target'}];
    await e.publishDiagnostics(model);assert.equal(calls.at(-1).data.diagnostics[0].message,'Unknown target');checks++;
    e.revisions.delete(uri);const before=calls.length;await e.publishDiagnostics(model);assert.equal(calls.length,before);checks++;
  }
  {
    const{editing:e,calls}=environment(),uri='file:///current.cpp';e.revisions.set(uri,12);e.editTasks.set(uri,Promise.resolve(true));e.editTasks.set('file:///unrelated.cpp',new Promise(()=>{}));
    await e.sync(uri);assert.equal(calls.at(-1).data.uri,uri);assert.equal(calls.at(-1).data.known[uri],12);assert.equal(e.editTasks.has('file:///unrelated.cpp'),true);checks++;
  }
  {
    const{editing:e,calls,forge}=environment(),uri='file:///pending.cpp',pending=deferred();let version=1;
    const model={uri:{toString:()=>uri},isDisposed:()=>false,getVersionId:()=>version,getOffsetAt:p=>p.column-1};
    e.revisions.set(uri,4);e.editTasks.set(uri,pending.promise);forge.diagnosticMap.set(uri,{version:1,diagnostics:[]});
    const publishing=e.publishDiagnostics(model);await Promise.resolve();assert.equal(calls.length,0);
    version=2;e.revisions.set(uri,5);forge.diagnosticMap.set(uri,{version:2,diagnostics:[{range:{start:{line:0,character:2},end:{line:0,character:4}},severity:1,message:'fresh error'}]});
    pending.resolve(true);await publishing;assert.equal(calls.at(-1).data.revision,5);assert.equal(calls.at(-1).data.diagnostics[0].message,'fresh error');checks++;
  }
  {
    const{editing:e,context,calls,forge}=environment(),entered=deferred(),reply=deferred(),uri='file:///notebook.ipynb';let text='old',version=1,current=null,changed;forge.docs=new Map();
    const model={uri:{toString:()=>uri,fsPath:'/notebook.ipynb'},getValue:()=>text,getVersionId:()=>version,getLanguageId:()=>'notebook',isDisposed:()=>false,onDidChangeContent:fn=>{changed=fn;},onWillDispose(){}};
    const editor={getModel:()=>current,onDidChangeModelLanguage(){},setModel:m=>{current=m;}};
    for(const name of ['setSelection','setPosition','focus','layout','updateOptions','dispose','onDidFocusEditorWidget','hasTextFocus','hasWidgetFocus','saveViewState','restoreViewState','getAction','trigger'])editor[name]=()=>{};
    e.layout=()=>Promise.resolve();e.typingOptions=async()=>({});e.decorations=e.publishDiagnostics=e.scheduleAnalysis=e.documentSettled=()=>{};
    context.native=async(op,data)=>{calls.push({op,data});if(op==='editorOpen'){entered.resolve();return reply.promise;}return true;};
    e.attach(editor,'primary',{style:{}});editor.setModel(model);await entered.promise;
    text='locally edited cell';version++;changed({changes:[{rangeOffset:0,rangeLength:3,text}]});reply.resolve({uri,text:'old',revision:0});await e.panes.get('primary').opening;
    assert.equal(text,'locally edited cell');assert.equal(e.revisions.get(uri),1);assert.equal(calls.find(c=>c.op==='editorEdits').data.edits[0].text,text);checks++;
  }
  console.log(checks+' editor state and asynchronous formatting checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
