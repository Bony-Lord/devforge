'use strict';
/** LLDB uses DAP; the UI shares breakpoint, stack and variable-tree components. */
class DapClient extends GdbClient {
  constructor(ide){super(ide);this.objects=new Map();this.objectSeq=0;onNative('dap',event=>{if(event.session===this.session)this.receiveDap(event.message);});}
  async request(command,args={}){if(!this.active)throw Error(tr('Отладчик не запущен'));const seq=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(seq);reject(Error('LLDB: '+command+' timeout'));},25000);this.pending.set(seq,{resolve,reject,timer});native('dapSend',{message:{seq,type:'request',command,arguments:args}}).catch(error=>{clearTimeout(timer);this.pending.delete(seq);reject(error);});});}
  receiveDap(message){
    if(message.type==='response'){const p=this.pending.get(message.request_seq);if(p){clearTimeout(p.timer);this.pending.delete(message.request_seq);message.success?p.resolve(message.body||{}):p.reject(Error(message.message||'LLDB error'));}return;}
    if(message.type!=='event')return;const data=message.body||{};
    if(message.event==='initialized'){this.initialized?.();return;}
    if(message.event==='output'){const stream=data.category==='stderr'?'stderr':'stdout';this.ide.runtimeDiagnostics.feed({id:this.session,stream,text:data.output||''});this.ide.appendOutput(data.category==='console'?'debugLog':'console',data.output||'',stream==='stderr'?'stderr':'');return;}
    if(message.event==='continued'){this.paused=false;this.stopSerial++;this.objects.clear();this.ide.runtimeDiagnostics.banner.classList.add('hidden');this.clearExecutionLine();this.renderControls();$('#debugStatus').textContent=tr('Программа выполняется');return;}
    if(message.event==='stopped'){this.threadId=data.threadId;this.paused=true;this.renderControls();$('#debugStatus').textContent=data.description||tr(data.reason==='breakpoint'?'Точка останова':'Пауза');this.refreshDap(data).catch(safeError);return;}
    if(message.event==='terminated'){this.finish();return;}
    if(message.event==='exited')this.ide.appendOutput('console','\n'+tr('Процесс завершён · код')+' '+data.exitCode+'\n',data.exitCode?'failure':'success');
  }
  async start(executable,args=[],launchOptions={}){
    this.session='debug-'+Date.now();this.active=true;this.paused=false;this.ide.consoleId=this.session;this.ide.running=true;this.ide.runtimeDiagnostics.begin(this.session,true);$('#consoleOutput').textContent='';$('#debugLogOutput').textContent='';
    try{
      const context=await native('dapStart',{executable,id:this.session,...launchOptions});
      this.capabilities=await this.request('initialize',{clientID:'cpp-studio',clientName:'C++ Studio',adapterID:'lldb',pathFormat:'path',linesStartAt1:true,columnsStartAt1:true,supportsVariableType:true,supportsVariablePaging:true,supportsRunInTerminalRequest:true,supportsProgressReporting:false,locale:StudioI18n.locale});
      let ready;const initialized=new Promise(r=>ready=r);this.initialized=ready;
      const launch=this.request('launch',{program:executable,args,cwd:context.cwd||this.ide.state.root,env:context.environment||{},stopOnEntry:true,runInTerminal:true,terminalKind:'integrated',enableAutoVariableSummaries:true,enableSyntheticChildDebugging:true,initCommands:['settings set target.process.thread.step-avoid-regexp "^(std::|__gnu_cxx::)"']});
      launch.catch(()=>ready());await initialized;
      for(const[path]of this.breakpoints)if(pathWithin(path,this.ide.state.root))await this.syncBreakpoints(path);
      if(this.capabilities.supportsFunctionBreakpoints)await this.request('setFunctionBreakpoints',{breakpoints:[{name:'abort'},{name:'std::terminate'}]});
      const filters=this.ide.settings.breakOnThrow?(this.capabilities.exceptionBreakpointFilters||[]).filter(f=>/cpp_throw|c\+\+.*throw/i.test(f.filter+' '+f.label)).map(f=>f.filter):[];
      await this.request('setExceptionBreakpoints',{filters});await this.request('configurationDone');await launch;this.ide.showPanel('debug');this.renderControls();
    }catch(error){await this.stop();throw error;}
  }
  async refreshDap(stop){
    if(this.runUntil){const {path}=this.runUntil;this.runUntil=null;await this.syncBreakpoints(path);}
    const serial=++this.stopSerial,stack=await this.request('stackTrace',{threadId:this.threadId,startFrame:0,levels:60});if(serial!==this.stopSerial||!this.paused)return;
    this.frames=(stack.stackFrames||[]).map((f,index)=>({...f,level:String(index),func:f.name,fullname:f.source?.path,file:f.source?.name||f.source?.path,line:String(f.line)}));this.selectedFrameId=this.frames[0]?.id;
    const text=[stop.reason,stop.description,stop.text].filter(Boolean).join(' '),signal=text.match(/SIG(?:SEGV|ABRT|BUS|FPE|ILL)/)?.[0];
    if(stop.reason==='exception'||signal||this.frames.some(f=>/^(abort|std::terminate)(?:\(|$)/.test(f.func||''))){let detail=text;
      if(this.capabilities.supportsExceptionInfoRequest)try{const info=await this.request('exceptionInfo',{threadId:this.threadId});detail=info.description||info.exceptionId||text;}catch{}
      this.ide.runtimeDiagnostics.stopped({'signal-name':signal||tr('Ошибка выполнения'),'signal-meaning':detail},this.frames);
      const project=this.frames.find(f=>f.fullname&&pathWithin(f.fullname,this.ide.state.root));if(project)this.selectedFrameId=project.id;
    }
    this.renderStack();await this.refresh(this.frames.find(f=>f.id===this.selectedFrameId));
  }
  async refresh(frame){
    if(!this.paused)return;if(frame?.id!==undefined)this.selectedFrameId=frame.id;frame||=this.frames.find(f=>f.id===this.selectedFrameId)||this.frames[0];
    if(frame?.fullname&&frame.line){try{await this.ide.openFile(frame.fullname,{lineNumber:Number(frame.line),column:1});this.markExecutionLine(frame.fullname,Number(frame.line));}catch(error){this.ide.appendOutput('debugLog',error.message+'\n','meta');}}
    const serial=this.stopSerial,scopes=await this.request('scopes',{frameId:this.selectedFrameId});const variables=[];
    for(const scope of scopes.scopes||[])if(!scope.expensive){const r=await this.request('variables',{variablesReference:scope.variablesReference});variables.push(...r.variables||[]);}
    if(serial!==this.stopSerial||!this.paused)return;this.variables=variables;await this.renderVariableTree();this.renderBreakpoints();
  }
  renderStack(){const root=$('#debugStack');root.replaceChildren();for(const frame of this.frames||[]){const button=document.createElement('button');button.className='debug-stack-row';button.innerHTML='<span>'+escapeHtml(frame.func||'??')+'</span><small>'+escapeHtml(basename(frame.fullname||''))+':'+frame.line+'</small>';button.onclick=()=>this.refresh(frame).catch(safeError);root.append(button);}}
  async syncBreakpoints(path){const lines=this.breakpoints.get(path)||new Map(),requested=[...lines.keys()];if(this.runUntil?.path===path&&!requested.includes(this.runUntil.line))requested.push(this.runUntil.line);const result=await this.request('setBreakpoints',{source:{path},breakpoints:requested.map(line=>({line}))});let index=0;for(const line of lines.keys())lines.set(line,result.breakpoints?.[index++]?.id||null);}
  async toggleBreakpoint(model,line){if(!model||!pathWithin(model.uri.fsPath,this.ide.state.root))return;const path=model.uri.fsPath,map=this.breakpoints.get(path)||new Map();map.has(line)?map.delete(line):map.set(line,null);this.breakpoints.set(path,map);if(this.active)await this.syncBreakpoints(path);this.decorateBreakpoints(model);this.renderBreakpoints();this.ide.settings.breakpoints=Object.fromEntries([...this.breakpoints].map(([p,m])=>[p,[...m.keys()]]));this.ide.saveWorkspaceSettings();}
  async action(action){if(action==='stop')return this.stop();if(action==='breakpoint')return this.breakpointAtCaret();if(action==='cursor')return this.runToCursor();const commands={continue:'continue',pause:'pause',next:'next',step:'stepIn',finish:'stepOut'};if(commands[action])try{await this.request(commands[action],{threadId:this.threadId,granularity:'line'});}catch(error){safeError(error);}}
  async runToCursor(){const model=this.ide.editor.getModel(),position=this.ide.editor.getPosition();if(!model||!position||!this.paused)return;this.runUntil={path:model.uri.fsPath,line:position.lineNumber};await this.syncBreakpoints(this.runUntil.path);await this.request('continue',{threadId:this.threadId});}

  variable(v,expression){const name='dapvar-'+(++this.objectSeq),count=(v.namedVariables||0)+(v.indexedVariables||0);this.objects.set(name,{ref:v.variablesReference||0,expression:v.evaluateName||expression||v.name,count});return{name,exp:v.name,label:v.name,value:v.result??v.value??'',type:v.type||'',numchild:count||v.variablesReference?String(count||1):'0'};}
  async command(command){
    if(command.startsWith('-stack-select-frame ')){const level=Number(command.slice('-stack-select-frame '.length));this.selectedFrameId=this.frames[level]?.id;return{};}
    if(command.startsWith('-var-create - * ')){const expression=JSON.parse(command.slice('-var-create - * '.length)),r=await this.request('evaluate',{expression,frameId:this.selectedFrameId,context:'watch'});return this.variable(r,expression);}
    if(command.startsWith('-var-delete ')){this.objects.delete(JSON.parse(command.slice('-var-delete '.length)));return{};}
    if(command.startsWith('-var-info-path-expression '))return{path_expr:this.objects.get(JSON.parse(command.slice('-var-info-path-expression '.length)))?.expression||''};
    if(command.startsWith('-var-list-children --all-values ')){
      const match=/^(-var-list-children --all-values) ("(?:\\.|[^"\\])*") (\d+) (\d+)$/.exec(command);if(!match)throw Error('Invalid variable request');const parent=this.objects.get(JSON.parse(match[2]));if(!parent)return{children:[]};const from=Number(match[3]),count=Number(match[4])-from,r=await this.request('variables',{variablesReference:parent.ref,start:from,count});return{children:(r.variables||[]).map(v=>({child:this.variable(v,v.evaluateName)})),has_more:parent.count?String(Number(from+(r.variables||[]).length<parent.count)):String(Number((r.variables||[]).length===count))};
    }
    if(command.startsWith('-data-evaluate-expression ')){const r=await this.request('evaluate',{expression:JSON.parse(command.slice('-data-evaluate-expression '.length)),frameId:this.selectedFrameId,context:'watch'});return{value:r.result};}
    throw Error('Unsupported LLDB UI operation');
  }
  async stop(){if(!this.active)return;try{await this.request('disconnect',{terminateDebuggee:true});}catch{}finally{await native('dapStop');this.finish();}}
}
