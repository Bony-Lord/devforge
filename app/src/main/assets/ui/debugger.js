'use strict';
// GNU MI grammar: quoted C strings, result tuples and lists, including repeated
// frame= entries. No debugger output is evaluated as JavaScript.
function parseMI(text){
  let i=0;
  function string(){i++;let out='';while(i<text.length){let c=text[i++];if(c==='"')return out;if(c==='\\'){c=text[i++];const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07',e:'\x1b'};if(c in simple)out+=simple[c];else if(/[0-7]/.test(c)){let oct=c;while(oct.length<3&&/[0-7]/.test(text[i]||'x'))oct+=text[i++];let bytes=[parseInt(oct,8)];while(bytes[0]>=128&&text[i]==='\\'&&/[0-7]/.test(text[i+1]||'x')){let at=i+1,part='';while(part.length<3&&/[0-7]/.test(text[at]||'x'))part+=text[at++];const byte=parseInt(part,8);if(byte<128)break;bytes.push(byte);i=at;}try{out+=bytes[0]>=128?decodeURIComponent(bytes.map(b=>'%'+b.toString(16).padStart(2,'0')).join('')):String.fromCharCode(bytes[0]);}catch{out+=String.fromCharCode(...bytes);}}else out+=c||'';}else out+=c;}return out;}
  function value(){if(text[i]==='"')return string();if(text[i]==='{'){i++;const o=results('}');i++;return o;}if(text[i]==='['){i++;const a=[];while(i<text.length&&text[i]!==']'){if(text[i]===','){i++;continue;}const start=i;while(/[\w-]/.test(text[i]||'!'))i++;if(text[i]==='='){const key=text.slice(start,i++);a.push({[key]:value()});}else{i=start;a.push(value());}}i++;return a;}const start=i;while(i<text.length&&!['}',']',','].includes(text[i]))i++;return text.slice(start,i);}
  function results(end){const o={};while(i<text.length&&text[i]!==end){if(text[i]===','){i++;continue;}const start=i;while(i<text.length&&text[i]!=='='&&text[i]!==end&&text[i]!==',')i++;const key=text.slice(start,i);if(text[i]!=='=')break;i++;const v=value();if(key in o)o[key]=Array.isArray(o[key])?[...o[key],v]:[o[key],v];else o[key]=v;}return o;}
  return results('\0');
}
// MinGW GDB can return an ANSI-expanded fullname alongside a correct UTF-8
// absolute file from DWARF. Prefer that project path before opening the source.
function gdbSourceFrame(frame,root){
  if(!frame)return frame;
  const file=String(frame.file||'').replaceAll('\\','/');
  if(/^(?:[A-Za-z]:\/|\/)/.test(file)&&pathWithin(file,root))return {...frame,fullname:file};
  return frame;
}
class GdbClient{
  constructor(ide){this.ide=ide;this.pending=new Map();this.seq=0;this.active=false;this.paused=false;this.breakpoints=new Map();this.chain=Promise.resolve();this.watches=[];this.stopSerial=0;
    for(const[path,lines]of Object.entries(ide.settings.breakpoints||{}))this.breakpoints.set(path,new Map(lines.map(line=>[line,null])));
    onNative('gdb',e=>{if(e.session===this.session)this.receive(e.line);});onNative('gdbExit',e=>{if(e.session===this.session)this.finish();});
  }
  async command(command){if(!this.active)throw new Error('Отладчик не запущен');const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('GDB: '+command+' timeout'));},20000);this.pending.set(id,{resolve,reject,timer});this.chain=this.chain.catch(()=>{}).then(()=>native('gdbSend',{command:id+command})).catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e);});});}
  receive(line){const match=/^(\d*)([\^*+=~@&])(.*)$/.exec(line);if(!match)return;
    const[,token,kind,body]=match;
    if(['~','@','&'].includes(kind)){const value=parseMI('text='+body).text||'';if(kind==='@'){this.ide.runtimeDiagnostics.feed({id:this.session,stream:'stdout',text:value});this.ide.appendOutput('console',value);}else this.ide.appendOutput('debugLog',value,kind==='&'?'stderr':'');return;}
    const comma=body.indexOf(','),state=comma<0?body:body.slice(0,comma),data=comma<0?{}:parseMI(body.slice(comma+1));
    if(kind==='^'){const p=this.pending.get(Number(token));if(p){clearTimeout(p.timer);this.pending.delete(Number(token));state==='error'?p.reject(new Error(data.msg||'GDB error')):p.resolve({...data,state});}}
    if(kind==='*'&&state==='running'){this.ide.runtimeDiagnostics.banner.classList.add('hidden');this.paused=false;this.stopSerial++;this.variablesSerial=-1;$('#debugVariables').replaceChildren();$('#debugWatches').replaceChildren();this.renderControls();this.clearExecutionLine();$('#debugStatus').textContent='Программа выполняется';}
    if(kind==='*'&&state==='stopped'){if(this.starting)return;if(data.reason==='breakpoint-hit'&&this.runtimeBreakpoints?.has(String(data.bkptno).split('.')[0])){data['signal-name']='SIGABRT';data['signal-meaning']=tr('Вызван abort() или std::terminate()');data.runtimeFault=true;}if(['exited-normally','exited','exited-signalled'].includes(data.reason)){this.ide.appendOutput('console',`\nОтладка завершена · ${data.reason}${data['exit-code']?' · '+data['exit-code']:''}\n`,'meta');this.stop().catch(safeError);}else{this.paused=true;this.renderControls();$('#debugStatus').textContent=data.reason==='breakpoint-hit'?'Точка останова':data.reason==='end-stepping-range'?'Шаг выполнен':data['signal-name']||data.reason||'Пауза';this.refresh(data.frame,(data.runtimeFault||data.reason==='signal-received'&&['SIGSEGV','SIGABRT','SIGFPE','SIGBUS','SIGILL'].includes(data['signal-name']))?data:null).catch(safeError);}}
  }
  async start(executable,args=[]){
    this.session='debug-'+Date.now();this.ide.runtimeDiagnostics.begin(this.session,true);this.starting=true;this.runtimeBreakpoints=new Set();this.active=true;this.paused=false;this.ide.consoleId=this.session;this.ide.running=true;
    $('#consoleOutput').textContent='';$('#debugLogOutput').textContent='';
    try{
      const info=await native('gdbStart',{executable,args,id:this.session});
      for(const cmd of ['-gdb-set mi-async on','-gdb-set pagination off','-gdb-set host-charset UTF-8','-gdb-set target-charset UTF-8','-gdb-set confirm off','-gdb-set disable-randomization off','-enable-pretty-printing','-gdb-set print elements 80','-gdb-set print max-depth 4'])try{await this.command(cmd);}catch(e){this.ide.appendOutput('debugLog',e.message+'\n','meta');}
      for(const [name,value] of Object.entries(info.environment||{}))await this.command('-gdb-set environment '+JSON.stringify(name+'='+value));
      for(const signal of ['SIGSEGV','SIGABRT','SIGFPE','SIGBUS','SIGILL'])try{await this.command('-interpreter-exec console '+JSON.stringify('handle '+signal+' stop print pass'));}catch{}
      for(const fn of ['abort','std::terminate()'])try{const r=await this.command('-break-insert -f '+JSON.stringify(fn));if(r.bkpt?.number)this.runtimeBreakpoints.add(r.bkpt.number);}catch{}
      if(this.ide.settings.breakOnThrow)try{await this.command('-interpreter-exec console '+JSON.stringify('catch throw'));}catch(error){this.ide.appendOutput('debugLog',error.message+'\n','stderr');}
      if(info.printers)try{await this.command('-interpreter-exec console '+JSON.stringify('source '+info.printers));}catch(error){this.ide.appendOutput('debugLog',error.message+'\n','stderr');}
      for(const skip of ['skip -rfu ^std::.*','skip -rfu ^__gnu_cxx::.*','skip -gfi */include/c++/*'])try{await this.command('-interpreter-exec console '+JSON.stringify(skip));}catch{}
      if(info.tty)await this.command('-inferior-tty-set '+JSON.stringify(info.tty));await this.command('-gdb-set breakpoint pending on');await this.command('-file-exec-and-symbols '+JSON.stringify(info.executable||executable));
      const programArgs=[...(info.arguments||[]),...args];if(programArgs.length&&!info.argumentsApplied)await this.command('-exec-arguments '+programArgs.map(s=>JSON.stringify(s)).join(' '));
      for(const[path,lines]of [...this.breakpoints].filter(([path])=>pathWithin(path,this.ide.state.root)))for(const line of lines.keys())try{const r=await this.command('-break-insert -f '+JSON.stringify(path+':'+line));lines.set(line,r.bkpt?.number);}catch(e){this.ide.appendOutput('debugLog',e.message+'\n','stderr');}
      await this.command('-break-insert -f -t main');this.ide.showPanel('debug');this.renderControls();if(info.remote)await this.command('-target-select remote '+info.remote);this.starting=false;await this.command(info.remote?'-exec-continue':'-exec-run');
    }catch(e){await this.stop();throw e;}
  }
  async refresh(frame,fault=null){
    const serial=++this.stopSerial;
    const stack=await this.command('-stack-list-frames 0 40');if(serial!==this.stopSerial||!this.paused)return;
    this.frames=(stack.stack||[]).map(x=>gdbSourceFrame(x.frame||x,this.ide.state.root));frame=gdbSourceFrame(frame,this.ide.state.root);this.renderStack();
    if(fault){this.ide.runtimeDiagnostics.stopped(fault,this.frames);const root=this.ide.state.root.replaceAll('\\','/').replace(/\/$/,'');const projectFrame=this.frames.find(f=>f.fullname&&pathWithin(f.fullname,root)&&f.line);if(projectFrame){frame=projectFrame;await this.command('-stack-select-frame '+Number(frame.level));}}
    if(!frame)frame=this.frames[0];if(frame?.fullname&&frame.line){try{await this.ide.openFile(frame.fullname,{lineNumber:Number(frame.line),column:1});this.markExecutionLine(frame.fullname,Number(frame.line));}catch(error){this.ide.appendOutput('debugLog',error.message+'\n','meta');}}
    const vars=await this.command('-stack-list-variables --no-values');if(serial!==this.stopSerial)return;this.variables=vars.variables||[];await this.renderVariableTree();this.renderBreakpoints();
  }
  renderControls(){for(const b of $$('[data-debug-action]')){const action=b.dataset.debugAction;b.disabled=!this.active||(action!=='stop'&&action!=='pause'&&!this.paused)||(action==='pause'&&this.paused);}this.ide.updateRunButtons();}
  renderStack(){const el=$('#debugStack');el.replaceChildren();for(const frame of this.frames||[]){const b=document.createElement('button');b.className='debug-stack-row';b.innerHTML=`<span>${escapeHtml(frame.func||'??')}</span><small>${escapeHtml(basename(frame.file||frame.fullname||''))}:${frame.line||'?'}</small>`;b.onclick=async()=>{try{await this.command('-stack-select-frame '+Number(frame.level));await this.refresh(frame);}catch(e){safeError(e);}};el.append(b);}}
  renderVariables(){const el=$('#debugVariables');el.replaceChildren();for(const v of this.variables||[]){const row=document.createElement('div');row.className='debug-variable';row.innerHTML=`<span>${escapeHtml(v.name)}</span><code>${escapeHtml(v.value??'<оптимизировано>')}</code>`;row.ondblclick=()=>this.addWatch(v.name);el.append(row);}}
  async addWatch(expression){if(!expression){const r=await this.ide.prompt('Наблюдать выражение','Выражение C/C++ в текущем кадре стека','');if(!r)return;expression=r.value.trim();}if(!expression)return;this.watches.push(expression);await this.refreshWatches();}
  async refreshWatches(){const el=$('#debugWatches');el.replaceChildren();for(const expression of this.watches){const row=document.createElement('div');row.className='debug-variable';let value='Программа выполняется';if(this.active&&this.paused)try{value=(await this.command('-data-evaluate-expression '+JSON.stringify(expression))).value;}catch(e){value=e.message;}row.innerHTML=`<span>${escapeHtml(expression)}</span><code>${escapeHtml(value||'')}</code><button title="Удалить" data-icon="x"></button>`;row.querySelector('button').onclick=()=>{this.watches=this.watches.filter(e=>e!==expression);this.refreshWatches();};el.append(row);}}
  async action(action){const commands={continue:'-exec-continue',pause:'-exec-interrupt --all',next:'-exec-next',step:'-exec-step',finish:'-exec-finish'};if(action==='stop')return this.stop();if(action==='breakpoint')return this.breakpointAtCaret();if(action==='cursor')return this.runToCursor();if(commands[action])try{await this.command(commands[action]);}catch(e){safeError(e);}}
  async stop(){if(!this.active)return;this.active=false;try{await native('gdbStop');}finally{this.finish();}}
  finish(){this.ide.runtimeDiagnostics.finishDebug(this.session);this.active=false;this.paused=false;this.stopSerial++;this.ide.running=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Отладка завершена'));}this.pending.clear();this.clearExecutionLine();this.renderControls();$('#debugStatus').textContent='Отладчик остановлен';}
  async toggleBreakpoint(model,line){if(!model)return;const path=model.uri.fsPath;if(!pathWithin(path,this.ide.state.root))return;let map=this.breakpoints.get(path);if(!map){map=new Map();this.breakpoints.set(path,map);}if(map.has(line)){const number=map.get(line);map.delete(line);if(number&&this.active)await this.command('-break-delete '+number);}else{let number=null;if(this.active){const r=await this.command('-break-insert -f '+JSON.stringify(path+':'+line));number=r.bkpt?.number;}map.set(line,number);}this.decorateBreakpoints(model);this.renderBreakpoints();this.ide.settings.breakpoints=Object.fromEntries([...this.breakpoints].map(([p,m])=>[p,[...m.keys()]]));this.ide.saveWorkspaceSettings();}
  decorateBreakpoints(model){const doc=this.ide.docs.get(model.uri.toString());if(!doc)return;doc.breakpointDecorations=model.deltaDecorations(doc.breakpointDecorations||[],[...(this.breakpoints.get(model.uri.fsPath)?.keys()||[])].map(line=>({range:new monaco.Range(line,1,line,1),options:{isWholeLine:true,glyphMarginClassName:'forge-breakpoint',className:'forge-breakpoint-line',glyphMarginHoverMessage:{value:'Точка останова · нажмите, чтобы удалить'}}})));NativeEditing.decorations(model);}
  markExecutionLine(path,line){this.clearExecutionLine();const model=monaco.editor.getModel(monaco.Uri.file(path));if(model){this.executionModel=model;this.nativeExecution={uri:model.uri.toString(),line};NativeEditing.decorations(model);this.executionDecoration=model.deltaDecorations([],[{range:new monaco.Range(line,1,line,1),options:{isWholeLine:true,className:'forge-execution-line',glyphMarginClassName:'forge-execution-glyph'}}]);}}
  clearExecutionLine(){const previous=this.nativeExecution;this.nativeExecution=null;if(previous){const model=monaco.editor.getModel(monaco.Uri.parse(previous.uri));if(model)NativeEditing.decorations(model);}if(this.executionModel&&!this.executionModel.isDisposed())this.executionModel.deltaDecorations(this.executionDecoration||[],[]);this.executionModel=null;this.executionDecoration=[];}
}
