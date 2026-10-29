'use strict';
// Monaco models are the LSP shadow; Android owns the visible document and IME.
const NativeEditing={
  panes:new Map(),revisions:new Map(),generations:new Map(),editTasks:new Map(),completionTasks:new Map(),viewports:new Map(),formatJobs:new Map(),incoming:false,layoutQueued:false,
  cancellation(){let cancelled=false;const listeners=new Set();return{get isCancellationRequested(){return cancelled;},onCancellationRequested(fn){listeners.add(fn);if(cancelled)fn();return{dispose:()=>listeners.delete(fn)};},cancel(){if(cancelled)return;cancelled=true;for(const fn of [...listeners])fn();listeners.clear();}};},
  attach(editor,id,container){
    container||=document.querySelector(id==='primary'?'#editor':'#secondaryEditor');
    const api={editor,id,container,opening:Promise.resolve(),nativeSelection:null,focusListeners:new Set()};this.panes.set(id,api);
    const original={};for(const name of ['setModel','setSelection','setPosition','focus','layout','updateOptions','dispose','onDidFocusEditorWidget','hasTextFocus','hasWidgetFocus','saveViewState','restoreViewState','getAction','trigger'])original[name]=editor[name].bind(editor);
    api.original=original;
    const send=(op,data={})=>api.opening.then(()=>native(op,{id,...data})).catch(safeError);
    editor.setModel=model=>{
      original.setModel(model);this.track(model);this.layout();
      api.opening=api.opening.catch(()=>{}).then(async()=>{
        if(editor.getModel()!==model)return;
        const typing=model?await this.typingOptions(model):null;
        if(editor.getModel()!==model)return;
        const initial=model&&!this.revisions.has(model.uri.toString()),version=model?.getVersionId();
        const r=await native('editorOpen',{id,uri:model?.uri.toString()||'',path:model?.uri.fsPath||'',text:initial?model.getValue():'',language:model?.getLanguageId(),readonly:window.forge?.docs.get(model?.uri.toString())?.readonly||false,typing});
        if(r?.uri&&model&&!model.isDisposed()){
          // A document view can edit before Android has acknowledged its first open.
          // Seed the native revision, then send those edits instead of restoring stale text.
          if(initial&&!this.revisions.has(r.uri)&&model.getVersionId()!==version&&model.getValue()!==r.text){
            this.revisions.set(r.uri,r.revision+1);const generation=this.generations.get(r.uri)||0;
            const task=native('editorEdits',{uri:r.uri,revision:r.revision,edits:[{start:0,end:r.text.length,text:model.getValue()}]}).then(accepted=>{if(accepted!==false&&generation===(this.generations.get(r.uri)||0))this.documentSettled(model);return accepted!==false;});this.editTasks.set(r.uri,task);await task;
          }else this.snapshot(r);
          this.decorations(model);this.publishDiagnostics(model);this.scheduleAnalysis(model);
        }
      });
    };
    editor.onDidChangeModelLanguage(()=>{if(editor.getModel())editor.setModel(editor.getModel());});
    editor.focus=async()=>{this.requestedFocus=id;window.forge?.windows?.activateEditor(id);await this.layout();return send('editorFocus');};
    editor.hasTextFocus=editor.hasWidgetFocus=()=>this.focused===id&&!document.querySelector('dialog[open]');
    editor.onDidFocusEditorWidget=fn=>{api.focusListeners.add(fn);return{dispose:()=>api.focusListeners.delete(fn)};};
    editor.setPosition=position=>{original.setPosition(position);send('editorSelection',{line:position.lineNumber,column:position.column});};
    editor.setSelection=range=>{original.setSelection(range);send('editorSelection',{line:range.startLineNumber,column:range.startColumn,endLine:range.endLineNumber,endColumn:range.endColumn});};
    for(const name of ['revealRangeInCenter','revealPositionInCenter','revealRange','revealLineInCenter','revealLine'])editor[name]=()=>{};
    editor.saveViewState=()=>({native:true});
    editor.restoreViewState=state=>{if(state?.native&&state.selection)editor.setSelection(state.selection);};
    editor.getScrolledVisiblePosition=()=>null;
    editor.layout=()=>{original.layout({width:0,height:0});this.queueLayout();};
    editor.updateOptions=options=>{original.updateOptions({...options,automaticLayout:false,readOnly:true,'semanticHighlighting.enabled':false,inlayHints:{enabled:'off'}});this.queueLayout();};
    editor.getAction=action=>({run:()=>this.action(action)});
    editor.trigger=(source,action)=>this.action(action);
    editor.dispose=()=>{this.panes.delete(id);original.dispose();this.queueLayout();};
    editor.getDomNode=()=>container;container.style.visibility='hidden';original.updateOptions({automaticLayout:false,readOnly:true,'semanticHighlighting.enabled':false,inlayHints:{enabled:'off'}});original.layout({width:0,height:0});
    this.layout();return editor;
  },
  track(model){
    if(!model||model.__nativeTracked)return;model.__nativeTracked=true;
    model.onDidChangeContent(e=>{
      if(this.incoming)return;
      const uri=model.uri.toString(),revision=this.revisions.get(uri);if(revision===undefined)return;
      const edits=e.changes.map(c=>({start:c.rangeOffset,end:c.rangeOffset+c.rangeLength,text:c.text})).sort((a,b)=>b.start-a.start);
      const generation=this.generations.get(uri)||0,previous=this.editTasks.get(uri)||Promise.resolve(true);
      this.revisions.set(uri,revision+1);
      const task=previous.catch(()=>false).then(accepted=>{if(!accepted||generation!==(this.generations.get(uri)||0))return false;return native('editorEdits',{uri,revision,edits}).then(r=>{if(r!==false)this.documentSettled(model);return r!==false;});}).catch(error=>{safeError(error);return false;});this.editTasks.set(uri,task);
    });
    model.onWillDispose(()=>{clearTimeout(model.__analysisTimer);clearTimeout(model.__viewportTimer);model.__analysisCancel?.cancel();model.__viewportCancel?.cancel();const uri=model.uri.toString(),job=this.formatJobs.get(uri);if(job)clearTimeout(job.timer);this.formatJobs.delete(uri);this.revisions.delete(uri);this.editTasks.delete(uri);this.generations.delete(uri);native('editorForget',{uri}).catch(console.warn);});
  },
  changes(event){
    const model=monaco.editor.getModel(monaco.Uri.parse(event.uri));if(!model)return;
    if(event.revision<=(this.revisions.get(event.uri)??-1))return;
    this.incoming=true;try{for(const c of event.changes){const a=model.getPositionAt(c.start),b=model.getPositionAt(c.end);model.applyEdits([{range:new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column),text:c.text}]);}this.revisions.set(event.uri,event.revision);}finally{this.incoming=false;}this.documentSettled(model);
  },
  snapshot(value,force=false){
    const model=monaco.editor.getModel(monaco.Uri.parse(value.uri));if(!model)return;
    if(!force&&value.revision<(this.revisions.get(value.uri)??-1))return;
    const changed=value.revision!==this.revisions.get(value.uri);
    this.incoming=true;try{if(model.getValue()!==value.text)model.applyEdits([{range:model.getFullModelRange(),text:value.text}]);this.revisions.set(value.uri,value.revision);}finally{this.incoming=false;}if(changed)this.documentSettled(model);
  },
  async waitEdits(uri){return await(this.editTasks.get(uri)||Promise.resolve(true));},
  async sync(uri){for(const p of this.panes.values())if(!uri||p.editor.getModel()?.uri.toString()===uri)await p.opening;const pending=[...this.editTasks].filter(([key])=>!uri||key===uri);await Promise.all(pending.map(([,task])=>task));for(const[key,task]of pending)if(this.editTasks.get(key)===task)this.editTasks.delete(key);for(const s of await native('editorSnapshot',{uri,known:Object.fromEntries(this.revisions)}))this.snapshot(s);},
  queueLayout(){if(this.layoutQueued)return;this.layoutQueued=true;requestAnimationFrame(()=>{this.layoutQueued=false;this.layout();});},
  layout(){
    const windows=window.forge?.windows,visible=(!!windows||!document.body.classList.contains('panel-maximized'))&&!document.querySelector('dialog[open]')&&(!!windows||!document.body.classList.contains('sidebar-mobile-open'));
    const overlays=[...document.querySelectorAll('.studio-choice-popover,.studio-resize-hit,#menu:not(.hidden),.studio-inline-popover,.studio-hover-tip,.dv-resize-container,.dv-drop-target-selection,.dv-drag-ghost,.studio-dock-target,.studio-dock-target-label,.studio-dock-preview')].filter(e=>e.getClientRects().length);
    const floating=[...document.querySelectorAll('.dv-resize-container')].filter(e=>e.getClientRects().length).sort((a,b)=>(Number.parseInt(getComputedStyle(a).zIndex)||0)-(Number.parseInt(getComputedStyle(b).zIndex)||0));
    const resizeRect=(handle,element)=>{const b=handle.getBoundingClientRect(),f=element.getBoundingClientRect(),direction=handle.className.replace('dv-resize-handle-','');let x=b.x,y=b.y,width=b.width,height=b.height;if(direction==='left'){x=f.left-10;width=11;}if(direction==='right'){x=f.right-1;width=11;}if(direction==='bottom'){y=f.bottom-1;height=11;}return{x,y,width,height,direction};};
    const mask=e=>{const b=e.getBoundingClientRect(),float=e.classList.contains('dv-resize-container'),compass=e.matches('.studio-dock-target,.studio-dock-target-label,.studio-dock-preview');return{x:b.x-(float?7:0),y:b.y-(float?7:0),width:b.width+(float?14:0),height:b.height+(float?14:0),paint:!e.classList.contains('studio-resize-hit'),touch:!e.classList.contains('studio-hover-tip')&&!compass,popup:!float&&!compass};};
    const panes=[...this.panes.values()].map(p=>{
      const panel=windows?.editorPanel(p.id),ownFloat=panel?.group.element.closest('.dv-resize-container'),rank=floating.indexOf(ownFloat),box=(panel?.group.element.querySelector('.dv-content-container')||p.container).getBoundingClientRect();
      const occlusions=overlays.filter(e=>!e.classList.contains('dv-resize-container')||e!==ownFloat&&floating.indexOf(e)>rank).map(mask);
      if(ownFloat)for(const handle of ownFloat.querySelectorAll('[class^="dv-resize-handle-"]')){const b=resizeRect(handle,ownFloat);occlusions.push({x:b.x,y:b.y,width:b.width,height:b.height,paint:false,touch:true,popup:false});}
      const bounds=panel?.group.element.getBoundingClientRect(),x=bounds?Math.max(box.x,bounds.x+1):box.x,y=bounds?Math.max(box.y,bounds.y+1):box.y,right=bounds?Math.min(box.right,bounds.right-1):box.right,bottom=bounds?Math.min(box.bottom,bounds.bottom-1):box.bottom;
      return{id:p.id,x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y),visible:!p.documentView&&(windows?!!panel?.api.isVisible:!!p.container.getClientRects().length),occlusions,z:rank+1};
    });
    const occlusions=overlays.filter(e=>!e.classList.contains('dv-resize-container')).map(mask);
    const windowHandles=[];for(const element of floating){const group=windows?.api.groups.find(g=>g.element.closest('.dv-resize-container')===element);if(!group)continue;for(const handle of element.querySelectorAll('[class^="dv-resize-handle-"]')){const b=resizeRect(handle,element),direction=b.direction;if(!b.width||!b.height||direction.includes('top'))continue;if(floating.slice(floating.indexOf(element)+1).some(other=>{const r=other.getBoundingClientRect();return b.x+b.width/2>=r.left&&b.x+b.width/2<=r.right&&b.y+b.height/2>=r.top&&b.y+b.height/2<=r.bottom;}))continue;windowHandles.push({id:group.id+':'+direction,group:group.id,direction,x:b.x,y:b.y,width:b.width,height:b.height});}}
    const source=window.forge?.settings||{language:StudioI18n.locale},settings={};for(const key of ['language','theme','fontSize','codeScale','wordWrap','indentGuides','smartFormatOnClose','keyboardExtraKeys','keyboardPrimary','keyboardLayout','keyboardModifiers','keyboardNumpad','keyboardPcWidth','keyboardPcHeight','keyboardAndroidWidth','keyboardAndroidHeight'])if(source[key]!==undefined)settings[key]=source[key];
    if(window.forge?.addons?.host.lastFeatures){const host=forge.addons.host;if(!host.enabled('keyboard'))settings.keyboardPrimary='system';settings.smartTyping=host.enabled('smartTyping');settings.completionEnabled=host.enabled('completion')||host.enabled('pythonIntelligence');if(!host.enabled('indentGuides'))settings.indentGuides=false;}
    StudioWebKeyboard.refresh();return native('editorLayout',{webInputFocused:StudioWebKeyboard.lastFocused===true,inputReady:!!window.forge?.startupComplete&&!forge.setupOpen,panes,visible,occlusions,windowHandles,settings,keyboardRevision:this.keyboardRevision||0}).catch(console.warn);
  },
  selection(e){
    const p=this.panes.get(e.id);if(!p||p.editor.getModel()?.uri.toString()!==e.uri)return;
    p.original.setSelection(new monaco.Selection(e.startLine,e.startColumn,e.line,e.column));
    if(e.focused&&!p.documentView&&(!this.requestedFocus||this.requestedFocus===e.id)&&(!window.forge?.windows||window.forge.windows.editorPanel(e.id)?.api.isVisible)){if(this.requestedFocus===e.id)this.requestedFocus=null;this.focused=e.id;window.forge?.windows?.activateEditor(e.id);for(const fn of p.focusListeners)fn();}
  },
  invalidate(model){model.__analysisCancel?.cancel();for(const task of this.completionTasks.values())if(task.uri===model.uri.toString())task.cancel.cancel();this.scheduleAnalysis(model);const job=this.formatJobs.get(model.uri.toString());if(job&&!job.applying)this.scheduleFormat(job);},
  async typingOptions(model){
    if(['c','cpp'].includes(model.getLanguageId())&&(!window.forge?.addons?.host.lastFeatures||forge.addons.host.enabled('formatter')))return native('formatterTypingConfig',{path:model.uri.fsPath}).catch(()=>({indent:4,tab:4,continuation:4,tabs:false}));
    const settings=window.forge?.settings||{},custom=settings.indentMode&&settings.indentMode!=='formatter',indent=custom?settings.indentWidth||4:model.getLanguageId()==='cmake'?settings.indentWidth||4:['yaml','json'].includes(model.getLanguageId())?2:4;
    return{indent,tab:custom?settings.tabWidth||4:indent,continuation:indent,tabs:settings.indentMode==='tabs'};
  },
  async refreshTypingOptions(){for(const p of this.panes.values()){const model=p.editor.getModel();if(!model)continue;const typing=await this.typingOptions(model);if(!model.isDisposed())await native('editorTypingOptions',{uri:model.uri.toString(),typing});}},
  queueFormat(event){
    const model=monaco.editor.getModel(monaco.Uri.parse(event.uri));if(!model||window.forge?.toolPackState?.packs.find(p=>p.id==='analysis')?.installed===false||window.forge?.settings.smartFormatOnClose===false||event.revision!==this.revisions.get(event.uri))return;
    let range=monaco.Range.fromPositions(model.getPositionAt(event.start),model.getPositionAt(event.end)),job=this.formatJobs.get(event.uri);
    if(job){const old=model.getDecorationRange(job.decoration);if(old)range=old.plusRange(range);model.deltaDecorations([job.decoration],[]);}
    else job={uri:event.uri,model,id:event.id,running:false};
    job.sequence=(job.sequence||0)+1;job.id=event.id;job.decoration=model.deltaDecorations([],[{range,options:{stickiness:monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges}}])[0];this.formatJobs.set(event.uri,job);this.scheduleFormat(job);
  },
  scheduleFormat(job){clearTimeout(job.timer);if(window.forge?.state?.trust?.trusted===false)return;job.timer=setTimeout(()=>this.formatBlock(job),180);},
  discardFormat(job){clearTimeout(job.timer);if(!job.model.isDisposed())job.model.deltaDecorations([job.decoration],[]);if(this.formatJobs.get(job.uri)===job)this.formatJobs.delete(job.uri);},
  async formatBlock(job){
    if(job.running){job.again=true;return;}job.running=true;job.again=false;
    try{
      const ide=window.forge,model=job.model;if(model.isDisposed()||ide.settings.smartFormatOnClose===false||ide.addons?.host.lastFeatures&&!ide.addons.host.enabled('formatter')){this.discardFormat(job);return;}
      await this.sync(job.uri);const pane=this.panes.get(job.id),range=model.getDecorationRange(job.decoration);if(!range||pane?.editor.getModel()!==model){this.discardFormat(job);return;}
      const text=model.getValue(),end=model.getOffsetAt(range.getEndPosition());if(text[end-1]!=='}'){this.discardFormat(job);return;}
      const sequence=job.sequence,revision=this.revisions.get(job.uri),version=model.getVersionId(),selection=pane.editor.getSelection(),expectedStart=model.getOffsetAt(selection.getStartPosition()),expectedEnd=model.getOffsetAt(selection.getEndPosition());
      if(expectedStart!==expectedEnd)return;
      const result=await native('formatterOnType',{path:model.uri.fsPath,text,firstLine:range.startLineNumber,lastLine:range.endLineNumber,cursor:expectedEnd});
      if(model.isDisposed()||this.formatJobs.get(job.uri)!==job)return;
      if(sequence!==job.sequence||revision!==this.revisions.get(job.uri)||version!==model.getVersionId()){job.again=true;return;}
      if(result.code){this.lastOnTypeResult={status:'formatter-error',error:result.error};this.discardFormat(job);return;}
      if(text===result.text){this.lastOnTypeResult={status:'unchanged',uri:job.uri};this.discardFormat(job);return;}
      const formatted=result.text;let start=0,oldEnd=text.length,newEnd=formatted.length;
      while(start<oldEnd&&start<newEnd&&text[start]===formatted[start])start++;
      if(start>0&&/[\uD800-\uDBFF]/.test(text[start-1]))start--;
      while(oldEnd>start&&newEnd>start&&text[oldEnd-1]===formatted[newEnd-1]){oldEnd--;newEnd--;}
      if(oldEnd<text.length&&/[\uDC00-\uDFFF]/.test(text[oldEnd])){oldEnd++;newEnd++;}
      job.applying=true;const accepted=await native('editorFormatEdits',{id:job.id,uri:job.uri,revision,expectedStart,expectedEnd,edits:[{start,end:oldEnd,text:formatted.slice(start,newEnd)}],cursor:result.cursor});job.applying=false;
      this.lastOnTypeResult={status:accepted?'applied':'stale',uri:job.uri};if(accepted&&sequence===job.sequence)this.discardFormat(job);else job.again=true;
    }catch(error){console.warn('On-type formatting',error);this.discardFormat(job);}
    finally{job.running=false;if(job.again&&this.formatJobs.get(job.uri)===job)this.scheduleFormat(job);}
  },
  scheduleAnalysis(model){clearTimeout(model.__analysisTimer);model.__analysisTimer=setTimeout(()=>this.analysis(model),60);},
  documentSettled(model){if(model.isDisposed())return;const cached=window.forge?.diagnosticMap.get(model.uri.toString());if(cached&&(cached.version===undefined||cached.version===model.getVersionId()))this.publishDiagnostics(model);this.scheduleAnalysis(model);},
  async publishDiagnostics(model){
    await this.waitEdits(model.uri.toString());
    const ide=window.forge;if(!ide||model.isDisposed())return;const uri=model.uri.toString(),revision=this.revisions.get(uri);if(revision===undefined)return;
    const diagnostics=[],unusedStyles=[];const enabled=!ide.addons?.host.lastFeatures||ide.addons.host.enabled('diagnostics');
    for(const d of (enabled?((ide.diagnosticMap.get(uri)?.version===undefined||ide.diagnosticMap.get(uri)?.version===model.getVersionId())?ide.diagnosticMap.get(uri)?.diagnostics||[]:[]):[])){const start=model.getOffsetAt({lineNumber:d.range.start.line+1,column:d.range.start.character+1}),end=model.getOffsetAt({lineNumber:d.range.end.line+1,column:d.range.end.character+1});diagnostics.push({start,end:Math.max(start+1,end),severity:d.severity,message:d.message});if(d.tags?.includes(1)||/unused|unneeded-internal|unreachable/.test(String(d.code||'')))unusedStyles.push({start,end,type:'unused'});}
    for(const marker of monaco.editor.getModelMarkers({resource:model.uri}).filter(m=>m.owner!=='clangd'&&(m.owner!=='runtime-warning'||!ide.addons?.host.lastFeatures||ide.addons.host.enabled('runtimeDiagnostics'))))diagnostics.push({start:model.getOffsetAt({lineNumber:marker.startLineNumber,column:marker.startColumn}),end:model.getOffsetAt({lineNumber:marker.endLineNumber,column:marker.endColumn}),severity:marker.severity===8?1:marker.severity===4?2:3,message:marker.message});
    return native('editorAnalysis',{uri,revision,diagnostics,unusedStyles}).catch(console.warn);
  },
  decorations(model){if(!model||model.isDisposed())return;const debug=window.forge?.debugger;if(!debug)return;native('editorDecorations',{uri:model.uri.toString(),breakpoints:[...(debug.breakpoints.get(model.uri.fsPath)?.keys()||[])],execution:debug.nativeExecution?.uri===model.uri.toString()?debug.nativeExecution.line:0}).catch(console.warn);},
  async analysis(model){
    await this.waitEdits(model.uri.toString());
    const ide=window.forge;if(!ide||model.isDisposed())return;const uri=model.uri.toString(),revision=this.revisions.get(uri);if(revision===undefined)return;
    model.__analysisCancel?.cancel();const token=model.__analysisCancel=this.cancellation(),current=()=>!token.isCancellationRequested&&!model.isDisposed()&&revision===this.revisions.get(uri);
    if(!ide.lsp.ready||!['c','cpp'].includes(model.getLanguageId()))return;
    const textDocument=ide.lsp.doc(model),tasks=[];
    if(ide.settings.semanticHighlighting&&(!ide.addons?.host.lastFeatures||ide.addons.host.enabled('semantic')))tasks.push((async()=>{try{
      const r=await ide.lsp.request('textDocument/semanticTokens/full',{textDocument},token);if(!current()||!r)return;
      const styles=[],types=ide.lsp.capabilities.semanticTokensProvider?.legend?.tokenTypes||[];let line=0,col=0;
      for(let i=0;i<(r.data?.length||0);i+=5){line+=r.data[i];col=r.data[i]===0?col+r.data[i+1]:r.data[i+1];const type=types[r.data[i+3]];if(['type','class','struct','enum','typeParameter','function','method','keyword','string','number'].includes(type)){const start=model.getOffsetAt({lineNumber:line+1,column:col+1});styles.push({start,end:start+r.data[i+2],type});}}
      await native('editorAnalysis',{uri,revision,styles});
    }catch{}})());else tasks.push(native('editorAnalysis',{uri,revision,styles:[]}));
    if(ide.settings.inlayHints&&(!ide.addons?.host.lastFeatures||ide.addons.host.enabled('inlayHints')))tasks.push(this.inlayHints(model,token,revision));else tasks.push(native('editorAnalysis',{uri,revision,hints:[]}));
    await Promise.allSettled(tasks);
  },
  async inlayHints(model,token=model.__analysisCancel,revision=this.revisions.get(model.uri.toString())){
    const ide=window.forge;if(ide?.addons?.host.lastFeatures&&!ide.addons.host.enabled('inlayHints'))return;
    if(!ide?.lsp.ready||!ide.settings.inlayHints||model.isDisposed()||!['c','cpp'].includes(model.getLanguageId()))return;
    const uri=model.uri.toString(),views=[...this.viewports.values()].filter(v=>v.uri===uri),last=model.getLineCount()-1;
    const first=Math.max(0,views.length?Math.min(...views.map(v=>v.first))-30:0),end=Math.min(last,views.length?Math.max(...views.map(v=>v.last))+30:150);
    try{const r=await ide.lsp.request('textDocument/inlayHint',{textDocument:ide.lsp.doc(model),range:{start:{line:first,character:0},end:{line:end,character:model.getLineMaxColumn(end+1)-1}}},token);
      if(model.isDisposed()||token?.isCancellationRequested||revision!==this.revisions.get(uri)||!r)return;
      const hints=r.map(h=>({line:h.position.line,column:h.position.character,text:typeof h.label==='string'?h.label:h.label.map(p=>p.value).join('')}));await native('editorAnalysis',{uri,revision,hints});
    }catch{}
  },
  async completion(e){
    const ide=window.forge,model=monaco.editor.getModel(monaco.Uri.parse(e.uri));let items=[];
    for(const task of this.completionTasks.values())if(task.uri===e.uri)task.cancel.cancel();
    const cancel=this.cancellation();this.completionTasks.set(e.request,{uri:e.uri,cancel});
    if((!ide.addons?.host.lastFeatures||ide.addons.host.enabled('completion')||ide.addons.host.enabled('pythonIntelligence'))&&model&&e.revision===this.revisions.get(e.uri))try{
      const position={lineNumber:e.line+1,column:e.column+1};let list;
      if(['c','cpp'].includes(model.getLanguageId())){const r=await ide.lsp.request('textDocument/completion',{...ide.lsp.at(model,position),context:{triggerKind:1}},cancel);list=Array.isArray(r)?r:r?.items||[];}
      else if(model.getLanguageId()==='python'){const r=await ide.pythonIntelligence.request(model,position,'complete',cancel),line=model.getLineContent(position.lineNumber);list=(r?.items||[]).map(item=>({label:item.label,detail:item.kind,textEdit:{range:{start:{line:e.line,character:[...line].slice(0,item.start).join('').length},end:{line:e.line,character:e.column}},newText:item.label}}));}
      else list=await nativeBuildCompletions(model,position);
      const word=model.getWordUntilPosition(position),prefix=word.word.toLowerCase();
      items=(list||[]).filter(i=>!prefix||(i.filterText||i.label).toLowerCase().includes(prefix)).slice(0,100).map(i=>{
        const range=i.textEdit?.range||i.textEdit?.replace||{start:{line:e.line,character:word.startColumn-1},end:{line:e.line,character:e.column}};
        const offset=p=>model.getOffsetAt({lineNumber:p.line+1,column:p.character+1});
        return{label:i.label,detail:i.detail||'',sortText:i.sortText||i.label,start:offset(range.start),end:offset(range.end),text:i.textEdit?.newText??i.insertText??i.label,snippet:i.insertTextFormat===2,additional:(i.additionalTextEdits||[]).map(x=>({start:offset(x.range.start),end:offset(x.range.end),text:x.newText})).sort((a,b)=>b.start-a.start)};
      });
      if(cancel.isCancellationRequested||e.revision!==this.revisions.get(e.uri))items=[];
    }catch(err){console.warn('Native completion',err);}
    this.completionTasks.delete(e.request);if(!cancel.isCancellationRequested)await native('editorCompletionResult',{request:e.request,items});
  },
  async input(title,description,value){return (await window.forge.prompt(title,description,value))?.value??null;},
  showInfo(title,text){let dialog=document.querySelector('#nativeInfoDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='nativeInfoDialog';dialog.className='help-dialog';dialog.innerHTML='<div class="dialog-heading"><h2></h2><button class="close-button" aria-label="Close">'+STUDIO_ICONS.x+'</button></div><pre data-no-i18n style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:65vh;overflow:auto;line-height:1.6;user-select:text"></pre>';dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);}dialog.querySelector('h2').textContent=tr(title);dialog.querySelector('pre').textContent=text;dialog.showModal();},
  async action(id){
    const ide=window.forge,editor=ide.editor,model=editor.getModel();if(!model)return;
    const key={ 'editor.action.triggerSuggest':'suggest','undo':'undo','redo':'redo','editor.action.clipboardCopyAction':'copy','editor.action.clipboardCutAction':'cut','editor.action.clipboardPasteAction':'paste','editor.action.selectAll':'selectAll','editor.action.copyLinesDownAction':'duplicate','editor.action.deleteLines':'deleteLine'}[id];
    if(key)return native('editorAction',{id:[...this.panes.values()].find(p=>p.editor===editor)?.id||'primary',action:key});
    await this.sync(model.uri.toString());const pos=editor.getPosition(),at=ide.lsp.at(model,pos);
    if(id==='editor.action.formatDocument')return ide.formatCurrentDocument();
    if(id==='editor.action.quickOutline')return ide.showSide('outline');
    if(id==='editor.action.gotoLine'){const n=await this.input('Перейти к строке','',String(pos.lineNumber));if(n){editor.setPosition({lineNumber:Math.max(1,Math.min(model.getLineCount(),Number(n)||1)),column:1});editor.focus();}return;}
    if(id==='actions.find'||id==='editor.action.startFindReplaceAction'){if(ide.addons?.host.lastFeatures&&!ide.addons.host.enabled('find')){ide.addons.open();return;}
      const query=await this.input('Найти текст','','');if(!query)return;const matches=model.findMatches(query,false,false,false,null,true);if(!matches.length){ide.toast('Совпадений нет');return;}
      if(id==='editor.action.startFindReplaceAction'){const text=await this.input('Заменить на','',query);if(text!==null){model.pushEditOperations([],matches.map(m=>({range:m.range,text})),()=>null);await ide.saveAll();}}else{ide.quickItems=matches.map(m=>({label:`${m.range.startLineNumber}: ${model.getLineContent(m.range.startLineNumber).trim()}`,noTranslate:true,run:()=>{editor.setSelection(m.range);editor.focus();}}));ide.openQuick('Найти текст');}return;
    }
    if(id==='editor.action.rename'){const word=model.getWordAtPosition(pos);if(!word)return;const name=await this.input('Переименовать символ','',word.word);if(name&&name!==word.word)await ide.applyEdit(await ide.lsp.request('textDocument/rename',{...at,newName:name}));return;}
    if(id==='editor.action.revealDefinition'||id==='editor.action.referenceSearch.trigger'){
      let r=await ide.lsp.request(id.includes('reference')?'textDocument/references':'textDocument/definition',{...at,context:{includeDeclaration:true}});r=r?(Array.isArray(r)?r:[r]):[];const locations=r.map(x=>({uri:x.targetUri||x.uri,range:x.targetSelectionRange||x.targetRange||x.range}));
      if(locations.length===1)return ide.openFile(monaco.Uri.parse(locations[0].uri).fsPath,ide.lsp.range(locations[0].range));
      ide.quickItems=locations.map(x=>({label:monaco.Uri.parse(x.uri).fsPath+':'+(x.range.start.line+1),noTranslate:true,run:()=>ide.openFile(monaco.Uri.parse(x.uri).fsPath,ide.lsp.range(x.range))}));ide.openQuick(id.includes('reference')?'Найти использования':'Перейти к определению');return;
    }
    if(id==='editor.action.quickFix'){
      const range=ide.lsp.fromRange(editor.getSelection()),diagnostics=ide.diagnosticMap.get(model.uri.toString())?.diagnostics||[];
      const actions=await ide.lsp.request('textDocument/codeAction',{textDocument:ide.lsp.doc(model),range,context:{diagnostics}})||[];
      ide.quickItems=actions.filter(a=>!a.disabled).map(a=>({label:a.title,noTranslate:true,run:async()=>{if(!a.edit&&ide.lsp.capabilities.codeActionProvider?.resolveProvider)a=await ide.lsp.request('codeAction/resolve',a);if(a.edit)await ide.applyEdit(a.edit);}}));
      if(ide.cmakeSnapshot?.included===false)ide.quickItems.push({label:'Добавить файл в CMake',run:()=>ide.offerCMakeSource()});ide.openQuick('Исправления и подсказки');return;
    }
    if(id==='editor.action.showHover'||id==='editor.action.triggerParameterHints'){
      if(model.getLanguageId()==='cmake'){const name=model.getWordAtPosition(pos)?.word;if(name){const r=await native('cmakeHelp',{name:name.toLowerCase()});this.showInfo('Документация',r.text);}return;}
      const r=await ide.lsp.request(id.includes('Parameter')?'textDocument/signatureHelp':'textDocument/hover',at);const text=r?.signatures?.map(s=>s.label).join('\n')||ide.lsp.markdown(r?.contents)?.value;
      if(text)this.showInfo('Документация',text);return;
    }
  }
};
function attachNativeEditor(editor,id,container){const result=NativeEditing.attach(editor,id,container);StudioDocumentViews.attach(result,id);return result;}
async function nativeBuildCompletions(model,pos){
  const ide=window.forge,before=model.getLineContent(pos.lineNumber).slice(0,pos.column-1);
  if(model.getLanguageId()==='cmake'){
    if(/\$\{[^}]*$/.test(before))return [...new Set([...cmakeVariables,...[...model.getValue().matchAll(/\bset\s*\(\s*([A-Za-z_]\w*)/gi)].map(m=>m[1])])].map(label=>({label}));
    return [...(ide.cmakeCommandNames||[]).map(label=>({label,insertText:cmakeSnippets[label]||label+'(${1})',insertTextFormat:2,detail:'CMake'})),...['PRIVATE','PUBLIC','INTERFACE','STATIC','SHARED','REQUIRED','CONFIG','ON','OFF','LANGUAGES','CXX'].map(label=>({label})),...(ide.cmakeSnapshot?.targets||[]).map(t=>({label:t.name})),...ide.flatFiles().map(f=>({label:relative(f.path,ide.state.root)}))];
  }
  if(model.getLanguageId()==='yaml'){
    if(/clang-format$/.test(model.uri.fsPath)&&ide.toolPackState?.packs.find(p=>p.id==='analysis')?.installed&&!ide.formatterSchemaValues)await(ide.formatterSchemaPromise??=ide.loadFormatterSchema());
    const key=before.match(/^\s*([A-Za-z_]+):/)?.[1],field=FORMATTER_FIELDS.find(f=>f.key===key);
    if(key)return(field?.values||(typeof ide.formatterSchemaValues?.[key]==='boolean'?['true','false']:[])).map(v=>({label:String(v)}));
    const names=/clang-format$/.test(model.uri.fsPath)?ide.formatterSchemaValues?Object.keys(ide.formatterSchemaValues):FORMATTER_FIELDS.map(f=>f.key):/clang-tidy$/.test(model.uri.fsPath)?['Checks','WarningsAsErrors','HeaderFilterRegex','CheckOptions','FormatStyle']:['CompileFlags','Diagnostics','InlayHints','Index','Completion','Hover'];return names.map(label=>({label,insertText:label+': '}));
  }
  return [];
}
onNative('editorChanges',e=>NativeEditing.changes(e));onNative('editorResync',e=>{NativeEditing.generations.set(e.uri,(NativeEditing.generations.get(e.uri)||0)+1);NativeEditing.snapshot(e,true);NativeEditing.editTasks.delete(e.uri);});onNative('editorSelection',e=>NativeEditing.selection(e));onNative('editorCompletion',e=>NativeEditing.completion(e));onNative('editorGutter',e=>{const p=NativeEditing.panes.get(e.id);if(p)window.forge?.debugger?.toggleBreakpoint(p.editor.getModel(),e.line);});
onNative('editorCompletionCancel',e=>{NativeEditing.completionTasks.get(e.request)?.cancel.cancel();NativeEditing.completionTasks.delete(e.request);});
onNative('editorFormatOnType',e=>NativeEditing.queueFormat(e));
onNative('editorViewport',e=>{NativeEditing.viewports.set(e.id,e);const model=monaco.editor.getModel(monaco.Uri.parse(e.uri));if(!model)return;clearTimeout(model.__viewportTimer);model.__viewportCancel?.cancel();model.__viewportTimer=setTimeout(()=>{model.__viewportCancel=NativeEditing.cancellation();NativeEditing.inlayHints(model,model.__viewportCancel);},150);});
window.addEventListener('resize',()=>NativeEditing.queueLayout());
onNative('editorScale',e=>{const ide=window.forge;if(!ide)return;ide.settings.codeScale=Math.max(50,Math.min(250,e.percent));document.querySelector('#fontStatus').textContent=Math.round(ide.settings.codeScale)+'%';ide.saveWorkspaceSettings();});
new MutationObserver(records=>{if(records.some(r=>r.target instanceof Element&&!r.target.closest('.monaco-editor')&&(r.type==='attributes'||r.target.tagName==='BODY')))NativeEditing.queueLayout();}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['open','class','style']});
