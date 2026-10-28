'use strict';
// GNU MI grammar: quoted C strings, result tuples and lists, including repeated
// frame= entries. No debugger output is evaluated as JavaScript.
function parseMI(text){
  let i=0;
  function string(){i++;let out='';while(i<text.length){let c=text[i++];if(c==='"')return out;if(c==='\\'){c=text[i++];const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07',e:'\x1b'};if(c in simple)out+=simple[c];else if(/[0-7]/.test(c)){let oct=c;while(oct.length<3&&/[0-7]/.test(text[i]||'x'))oct+=text[i++];out+=String.fromCharCode(parseInt(oct,8));}else out+=c||'';}else out+=c;}return out;}
  function value(){if(text[i]==='"')return string();if(text[i]==='{'){i++;const o=results('}');i++;return o;}if(text[i]==='['){i++;const a=[];while(i<text.length&&text[i]!==']'){if(text[i]===','){i++;continue;}const start=i;while(/[\w-]/.test(text[i]||'!'))i++;if(text[i]==='='){const key=text.slice(start,i++);a.push({[key]:value()});}else{i=start;a.push(value());}}i++;return a;}const start=i;while(i<text.length&&!['}',']',','].includes(text[i]))i++;return text.slice(start,i);}
  function results(end){const o={};while(i<text.length&&text[i]!==end){if(text[i]===','){i++;continue;}const start=i;while(i<text.length&&text[i]!=='='&&text[i]!==end&&text[i]!==',')i++;const key=text.slice(start,i);if(text[i]!=='=')break;i++;const v=value();if(key in o)o[key]=Array.isArray(o[key])?[...o[key],v]:[o[key],v];else o[key]=v;}return o;}
  return results('\0');
}
class GdbClient{
  constructor(ide){this.ide=ide;this.pending=new Map();this.seq=0;this.active=false;this.paused=false;this.breakpoints=new Map();this.chain=Promise.resolve();this.watches=[];this.stopSerial=0;
    for(const[path,lines]of Object.entries(ide.settings.breakpoints||{}))this.breakpoints.set(path,new Map(lines.map(line=>[line,null])));
    onNative('gdb',e=>{if(e.session===this.session)this.receive(e.line);});onNative('gdbExit',e=>{if(e.session===this.session)this.finish();});
  }
  async command(command){if(!this.active)throw new Error('Отладчик не запущен');const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('GDB: '+command+' timeout'));},20000);this.pending.set(id,{resolve,reject,timer});this.chain=this.chain.catch(()=>{}).then(()=>native('gdbSend',{command:id+command})).catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e);});});}
  receive(line){const match=/^(\d*)([\^*+=~@&])(.*)$/.exec(line);if(!match)return;
    const[,token,kind,body]=match;
    if(['~','@','&'].includes(kind)){const value=parseMI('text='+body).text||'';if(kind==='@')this.ide.appendOutput('console',value);else this.ide.appendOutput('debugLog',value,kind==='&'?'stderr':'');return;}
    const comma=body.indexOf(','),state=comma<0?body:body.slice(0,comma),data=comma<0?{}:parseMI(body.slice(comma+1));
    if(kind==='^'){const p=this.pending.get(Number(token));if(p){clearTimeout(p.timer);this.pending.delete(Number(token));state==='error'?p.reject(new Error(data.msg||'GDB error')):p.resolve({...data,state});}}
    if(kind==='*'&&state==='running'){this.paused=false;this.stopSerial++;this.variablesSerial=-1;$('#debugVariables').replaceChildren();$('#debugWatches').replaceChildren();this.renderControls();this.clearExecutionLine();$('#debugStatus').textContent='Программа выполняется';}
    if(kind==='*'&&state==='stopped'){if(['exited-normally','exited','exited-signalled'].includes(data.reason)){this.ide.appendOutput('console',`\nОтладка завершена · ${data.reason}${data['exit-code']?' · '+data['exit-code']:''}\n`,'meta');this.stop().catch(safeError);}else{this.paused=true;this.renderControls();$('#debugStatus').textContent=data.reason==='breakpoint-hit'?'Точка останова':data.reason==='end-stepping-range'?'Шаг выполнен':data['signal-name']||data.reason||'Пауза';this.refresh(data.frame).catch(safeError);}}
  }
  async start(executable,args=[],options=this.ide.settings){
    this.session='debug-'+Date.now();this.active=true;this.paused=false;this.ide.consoleId=this.session;this.ide.running=true;RuntimeWarnings.begin(this.ide,this.session);
    this.ide.clearOutput('console');$('#debugLogOutput').textContent='';
    try{
      const info=await native('gdbStart',{executable,options,id:this.session});
      for(const cmd of ['-gdb-set mi-async on','-gdb-set pagination off','-gdb-set confirm off','-gdb-set disable-randomization off','-enable-pretty-printing'])try{await this.command(cmd);}catch(e){this.ide.appendOutput('debugLog',e.message+'\n','meta');}
      if(info.printers)try{await this.command('-interpreter-exec console '+JSON.stringify('source '+info.printers));}catch(error){this.ide.appendOutput('debugLog',error.message+'\n','stderr');}
      for(const skip of ['skip -rfu ^std::.*','skip -rfu ^__gnu_cxx::.*','skip -gfi */include/c++/*'])try{await this.command('-interpreter-exec console '+JSON.stringify(skip));}catch{}
      await this.command('-inferior-tty-set '+JSON.stringify(info.tty));await this.command('-file-exec-and-symbols '+JSON.stringify(executable));
      if(args.length)await this.command('-exec-arguments '+args.map(s=>JSON.stringify(s)).join(' '));
      for(const[path,lines]of [...this.breakpoints].filter(([path])=>path.startsWith(this.ide.state.root+'/')))for(const line of lines.keys())try{const r=await this.command('-break-insert '+JSON.stringify(path+':'+line));lines.set(line,r.bkpt?.number);}catch(e){this.ide.appendOutput('debugLog',e.message+'\n','stderr');}
      await this.command('-break-insert -t main');this.ide.showPanel('debug');this.renderControls();await this.command('-exec-run');
    }catch(e){await this.stop();throw e;}
  }
  async refresh(frame){
    const serial=++this.stopSerial;
    const stack=await this.command('-stack-list-frames 0 40');if(serial!==this.stopSerial||!this.paused)return;
    this.frames=(stack.stack||[]).map(x=>x.frame||x);this.renderStack();
    if(!frame)frame=this.frames[0];if(frame?.fullname&&frame.line){await this.ide.openFile(frame.fullname,{lineNumber:Number(frame.line),column:1});this.markExecutionLine(frame.fullname,Number(frame.line));}
    const vars=await this.command('-stack-list-variables --all-values');if(serial!==this.stopSerial)return;this.variables=vars.variables||[];await this.renderVariableTree();this.renderBreakpoints();
  }
  renderControls(){for(const b of $$('[data-debug-action]')){const action=b.dataset.debugAction;b.disabled=!this.active||(action!=='stop'&&action!=='pause'&&!this.paused)||(action==='pause'&&this.paused);}this.ide.updateRunButtons();}
  renderStack(){const el=$('#debugStack');el.replaceChildren();for(const frame of this.frames||[]){const b=document.createElement('button');b.className='debug-stack-row';b.innerHTML=`<span>${escapeHtml(frame.func||'??')}</span><small>${escapeHtml(basename(frame.file||frame.fullname||''))}:${frame.line||'?'}</small>`;b.onclick=async()=>{try{await this.command('-stack-select-frame '+Number(frame.level));await this.refresh(frame);}catch(e){safeError(e);}};el.append(b);}}
  renderVariables(){const el=$('#debugVariables');el.replaceChildren();for(const v of this.variables||[]){const row=document.createElement('div');row.className='debug-variable';row.innerHTML=`<span>${escapeHtml(v.name)}</span><code>${escapeHtml(v.value??'<оптимизировано>')}</code>`;row.ondblclick=()=>this.addWatch(v.name);el.append(row);}}
  async addWatch(expression){if(!expression){const r=await this.ide.prompt('Наблюдать выражение','Выражение C/C++ в текущем кадре стека','');if(!r)return;expression=r.value.trim();}if(!expression)return;this.watches.push(expression);await this.refreshWatches();}
  async refreshWatches(){const el=$('#debugWatches');el.replaceChildren();for(const expression of this.watches){const row=document.createElement('div');row.className='debug-variable';let value='Программа выполняется';if(this.active&&this.paused)try{value=(await this.command('-data-evaluate-expression '+JSON.stringify(expression))).value;}catch(e){value=e.message;}row.innerHTML=`<span>${escapeHtml(expression)}</span><code>${escapeHtml(value||'')}</code><button title="Удалить" data-icon="x"></button>`;row.querySelector('button').onclick=()=>{this.watches=this.watches.filter(e=>e!==expression);this.refreshWatches();};el.append(row);}}
  async action(action){const commands={continue:'-exec-continue',pause:'-exec-interrupt --all',next:'-exec-next',step:'-exec-step',finish:'-exec-finish'};if(action==='stop')return this.stop();if(action==='breakpoint')return this.breakpointAtCaret();if(action==='cursor')return this.runToCursor();if(commands[action])try{await this.command(commands[action]);}catch(e){safeError(e);}}
  async stop(){if(!this.active)return;this.active=false;try{await native('gdbStop');}finally{this.finish();}}
  finish(){this.active=false;this.paused=false;this.stopSerial++;this.ide.running=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Отладка завершена'));}this.pending.clear();this.frames=[];this.variables=[];this.variableObjects=[];this.variablesSerial=-1;this.renderStack();$('#debugVariables').replaceChildren();$('#debugWatches').replaceChildren();this.refreshWatches().catch(console.warn);this.clearExecutionLine();this.renderControls();$('#debugStatus').textContent='Отладчик остановлен';}
  async toggleBreakpoint(model,line){if(!model)return;const path=model.uri.fsPath;if(!path.startsWith(this.ide.state.root+'/'))return;let map=this.breakpoints.get(path);if(!map){map=new Map();this.breakpoints.set(path,map);}if(map.has(line)){const number=map.get(line);map.delete(line);if(number&&this.active)await this.command('-break-delete '+number);}else{let number=null;if(this.active){const r=await this.command('-break-insert '+JSON.stringify(path+':'+line));number=r.bkpt?.number;}map.set(line,number);}this.decorateBreakpoints(model);this.renderBreakpoints();this.ide.settings.breakpoints=Object.fromEntries([...this.breakpoints].map(([p,m])=>[p,[...m.keys()]]));this.ide.saveWorkspaceSettings();}
  decorateBreakpoints(model){const doc=this.ide.docs.get(model.uri.toString());if(!doc)return;doc.breakpointDecorations=model.deltaDecorations(doc.breakpointDecorations||[],[...(this.breakpoints.get(model.uri.fsPath)?.keys()||[])].map(line=>({range:new monaco.Range(line,1,line,1),options:{isWholeLine:true,glyphMarginClassName:'forge-breakpoint',className:'forge-breakpoint-line',glyphMarginHoverMessage:{value:'Точка останова · нажмите, чтобы удалить'}}})));NativeEditing.decorations(model);}
  markExecutionLine(path,line){this.clearExecutionLine();const model=monaco.editor.getModel(monaco.Uri.file(path));if(model){this.executionModel=model;this.nativeExecution={uri:model.uri.toString(),line};NativeEditing.decorations(model);this.executionDecoration=model.deltaDecorations([],[{range:new monaco.Range(line,1,line,1),options:{isWholeLine:true,className:'forge-execution-line',glyphMarginClassName:'forge-execution-glyph'}}]);}}
  clearExecutionLine(){const previous=this.nativeExecution;this.nativeExecution=null;if(previous){const model=monaco.editor.getModel(monaco.Uri.parse(previous.uri));if(model)NativeEditing.decorations(model);}if(this.executionModel&&!this.executionModel.isDisposed())this.executionModel.deltaDecorations(this.executionDecoration||[],[]);this.executionModel=null;this.executionDecoration=[];}
}
