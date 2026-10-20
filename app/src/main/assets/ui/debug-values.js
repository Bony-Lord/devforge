'use strict';
Object.assign(GdbClient.prototype,{
  async clearVariableObjects(){const names=this.variableObjects||[];this.variableObjects=[];for(const name of names)if(this.active)try{await this.command('-var-delete '+JSON.stringify(name));}catch{}},
  async variableObject(expression,serial){
    try{const value=await this.command('-var-create - * '+JSON.stringify(expression));this.variableObjects??=[];this.variableObjects.push(value.name);if(serial!==this.stopSerial||!this.paused)return null;return{...value,expression,label:expression};}
    catch(error){return{label:expression,expression,value:error.message,type:'',numchild:0,error:true};}
  },
  async renderVariableTree(){
    const serial=this.stopSerial,root=$('#debugVariables');root.replaceChildren();await this.clearVariableObjects();
    const variables=(this.variables||[]).filter(v=>this.ide.settings.showCompilerVariables||!/^__for_/.test(v.name));let loaded=0;
    const load=async()=>{if(serial!==this.stopSerial||!this.paused)return;root.querySelector('.debug-root-more')?.remove();const batch=variables.slice(loaded,loaded+80),values=await Promise.all(batch.map(v=>this.variableObject(v.name,serial)));if(serial!==this.stopSerial||!this.paused)return;
      for(const value of values)if(value)this.appendVariable(root,value,0,serial);loaded+=batch.length;
      if(loaded<variables.length){const more=document.createElement('button');more.className='debug-load-more debug-root-more';more.textContent=tr('Ещё 80 переменных');more.onclick=()=>load().catch(safeError);root.append(more);}this.variablesSerial=serial;
    };await load();if(serial===this.stopSerial)await this.refreshWatches();
  },
  appendVariable(parent,value,depth,serial){
    const container=document.createElement('div');container.className='debug-value-node';container.dataset.expression=value.expression||value.exp||value.name||'';container.setAttribute('role','treeitem');container.setAttribute('aria-level',String(depth+1));
    const row=document.createElement('div');row.className='debug-variable debug-value-row';
    const toggle=document.createElement('button');toggle.className='debug-value-toggle';toggle.type='button';toggle.innerHTML=svg('chevron-right');toggle.setAttribute('aria-label',tr('Раскрыть значение'));
    const expandable=Number(value.numchild)>0||value.has_more==='1'||value.dynamic==='1'&&value.displayhint!=='string';toggle.disabled=!expandable;toggle.style.visibility=expandable?'visible':'hidden';toggle.setAttribute('aria-expanded','false');row.append(toggle);
    const label=document.createElement('span');label.className='debug-value-name';label.textContent=value.label||value.exp||value.name;row.append(label);
    const type=document.createElement('small');type.textContent=value.type||'';type.title=value.type||'';row.append(type);
    const code=document.createElement('code');code.textContent=value.value??(expandable?'{…}':tr('<оптимизировано>'));code.title=code.textContent;code.classList.toggle('debug-value-error',!!value.error);code.onclick=()=>row.classList.toggle('debug-value-wrap');row.append(code);
    const children=document.createElement('div');children.className='debug-value-children';children.setAttribute('role','group');children.hidden=true;container.append(row,children);parent.append(container);
    let loaded=0,busy=false;
    const load=async()=>{if(busy||serial!==this.stopSerial||!this.paused)return;busy=true;toggle.disabled=true;try{
      const result=await this.command('-var-list-children --all-values '+JSON.stringify(value.name)+' '+loaded+' '+(loaded+50));
      if(serial!==this.stopSerial||!this.paused)return;children.querySelector('.debug-load-more')?.remove();
      const entries=(result.children||[]).map(x=>x.child||x);
      for(const child of entries){
        if(['public','protected','private'].includes(child.exp)&&!child.type&&Number(child.numchild)<=50){const group=await this.command('-var-list-children --all-values '+JSON.stringify(child.name)+' 0 50');if(serial!==this.stopSerial||!this.paused)return;for(const entry of group.children||[]){const member=entry.child||entry;this.appendVariable(children,{...member,expression:member.exp,label:member.exp},depth+1,serial);}}
        else this.appendVariable(children,{...child,expression:child.exp,label:child.exp},depth+1,serial);
      }
      loaded+=entries.length;
      if(result.has_more==='1'||loaded<Number(value.numchild)){const more=document.createElement('button');more.className='debug-load-more';more.textContent=tr('Ещё 50 элементов');more.onclick=()=>load().catch(safeError);children.append(more);}
    }catch(error){const message=document.createElement('code');message.textContent=error.message;children.append(message);}finally{busy=false;toggle.disabled=false;}};
    toggle.onclick=async()=>{children.hidden=!children.hidden;toggle.setAttribute('aria-expanded',String(!children.hidden));if(!children.hidden&&!loaded)await load();};
    if(value.expression)row.ondblclick=async()=>{try{const path=value.name?(await this.command('-var-info-path-expression '+JSON.stringify(value.name))).path_expr:value.expression;if(path)await this.addWatch(path);}catch(error){safeError(error);}};
    return container;
  },
  async refreshWatches(){
    const serial=this.stopSerial,root=$('#debugWatches');root.replaceChildren();
    for(const expression of this.watches){let value={label:expression,value:tr(this.active?'Программа выполняется':'Отладчик остановлен'),numchild:0};if(this.active&&this.paused)value=await this.variableObject(expression,serial)||value;if(serial!==this.stopSerial)return;
      const node=this.appendVariable(root,value,0,serial),remove=document.createElement('button');remove.type='button';remove.title=tr('Удалить');remove.innerHTML=svg('x');remove.onclick=()=>{this.watches=this.watches.filter(x=>x!==expression);this.refreshWatches().catch(safeError);};node.querySelector('.debug-value-row').append(remove);
    }
  },
  renderBreakpoints(){
    const root=$('#debugBreakpoints');if(!root)return;root.replaceChildren();
    for(const[path,lines]of [...this.breakpoints].filter(([path])=>pathWithin(path,this.ide.state.root)))for(const[line,number]of lines){const row=document.createElement('div');row.className='debug-breakpoint-row';const open=document.createElement('button');open.textContent=relative(path,this.ide.state.root)+':'+line;open.title=path;open.onclick=()=>this.ide.openFile(path,{lineNumber:line,column:1});
      const remove=document.createElement('button');remove.title=tr('Удалить точку останова');remove.innerHTML=svg('x');remove.onclick=async()=>{const model=await this.ide.ensureModel(path);await this.toggleBreakpoint(model,line);};row.append(open,remove);root.append(row);}
  },
  async breakpointAtCaret(){const model=this.ide.editor.getModel(),position=this.ide.editor.getPosition();if(model&&position)await this.toggleBreakpoint(model,position.lineNumber);},
  async runToCursor(){const model=this.ide.editor.getModel(),position=this.ide.editor.getPosition();if(!model||!position||!this.paused)return;await this.command('-break-insert -f -t '+JSON.stringify(model.uri.fsPath+':'+position.lineNumber));await this.command('-exec-continue');}
});
