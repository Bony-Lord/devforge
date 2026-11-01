(()=>{
 'use strict';
 // This is the only file that knows DevForge's internal names and UI fallbacks.
 // A future stable automation contract can replace this implementation without
 // changing scenarios, journals, replay, visual analysis or the report format.
 const bindings={
  settings:{names:/^(Настройки|Settings)(?:$| ·)/i,fallback:'#settingsButton'},
  addons:{names:/^(Дополнения|Расширения|Extensions|Addons|Пакеты)$/i,fallback:'#extensionsButton'},
  search:{names:/Поиск в DevForge|Search DevForge|Перейти к файлу|Go to file/i,fallback:'#workspaceSearchButton'},
  palette:{names:/Палитра команд|Все команды|Command palette|All commands/i,fallback:'#paletteButton'},
  project:{fallback:'#projectSelect'},
  menu:{fallback:'#mainMenuToggle,#menuButton'},
  quickInput:{fallback:'#quickInput'},
  settingsSearch:{fallback:'.studio-settings-search input,input[type=search][aria-label*="настро"],#settingsSearch'},
  addonSearch:{fallback:'.market-filters input[type=search],.market-filters input,.market-sidebar input[type=search]'},
  settingsDialog:{fallback:'#settingsDialog'},
  fileMenu:{fallback:'#tree .tree-file-menu'},
 };
 class AdapterMismatch extends Error{constructor(message){super(message);this.name='AdapterMismatch';}}
 const need=(value,name)=>{if(!value)throw new AdapterMismatch('Missing binding: '+name);return value;};
 const app=()=>need(window.forge,'window.forge'),nativeCall=(op,args)=>need(window.native,'native bridge')(op,args);
 const visible=node=>{if(!node?.isConnected||!node.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}))return false;const r=node.getBoundingClientRect();return r.width>1&&r.height>1;};
 const label=node=>(node.getAttribute('aria-label')||node.title||node.textContent||'').trim().replace(/\s+/g,' ');
 function target(name){const binding=need(bindings[name],'target '+name);let node;if(binding.names)node=[...document.querySelectorAll('button,[role=button],input')].find(n=>visible(n)&&binding.names.test(label(n)));node||=[...document.querySelectorAll(binding.fallback||':not(*)')].find(visible);return need(node,name);}
 const point=node=>{const r=node.getBoundingClientRect();return{x:Math.max(1,Math.min(innerWidth-1,r.x+r.width/2)),y:Math.max(1,Math.min(innerHeight-1,r.y+r.height/2))};};
 async function settle(){await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
 function own(relative){if(typeof relative!=='string'||relative.startsWith('/')||relative.includes('..')||relative.includes('\\')||relative.includes(':'))throw Error('Unsafe scenario path');const root=app().state.root;if(!root||!window.__soakExpectedRoots?.includes(root.toLowerCase()))throw Error('Scenario escaped its synthetic project');return root+'/'+relative;}
 const views=()=>typeof StudioDocumentViews==='undefined'?null:StudioDocumentViews;
 async function closeTransient(){if(typeof StudioChoices!=='undefined')StudioChoices.close?.();if(typeof StudioPopover!=='undefined')StudioPopover.closeAll?.();for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();await settle();}
 function notebook(){return need(views()?.pane(app().editor)?.documentView?.value?.cells,'notebook view');}
 async function perform(action){
  const ide=app(),p=action.params||{};
  switch(action.type){
   case 'target':return{point:point(target(p.name)),label:label(target(p.name))};
   case 'closeTransient':await closeTransient();break;
   case 'open':need(ide.openFile,'openFile');await ide.openFile(own(p.file));break;
   case 'assertOpen':{const active=ide.active,expected=own(p.file);if(active?.path.toLowerCase()!==expected.toLowerCase()||ide.editor.getModel()!==active.model)throw Error('Selected tab and editor model disagree for '+p.file);break;}
   case 'prepareEdit':{const doc=ide.active;if(!doc||doc.virtual||!['code.cpp','notes.md','data.json','scratch.txt'].some(n=>doc.path.endsWith('/'+n)))throw new AdapterMismatch('editable fixture source');need(ide.editor.getDomNode,'editor DOM');ide.editor.focus();await settle();return{point:point(ide.editor.getDomNode()),before:doc.model.getValue(),uri:doc.model.uri.toString(),file:doc.path.split('/').pop()};}
   case 'assertEdit':{const doc=ide.active;if(!doc?.model.getValue().includes(p.text))throw Error('Text input did not reach the selected document');break;}
   case 'save':await need(ide.saveAll,'saveAll').call(ide);break;
   case 'tab':{const doc=ide.tabs.find(d=>d.path.endsWith('/'+p.file));if(!doc)throw new AdapterMismatch('fixture tab '+p.file);const button=[...document.querySelectorAll('[role=tab],.studio-tool-tab,.tab')].find(n=>visible(n)&&(n.textContent||'').includes(p.file));return{point:point(need(button,'visible tab '+p.file))};}
   case 'closeTab':{const doc=ide.tabs.find(d=>d.path.endsWith('/'+p.file));if(doc)await ide.closeTab(doc);break;}
   case 'split':need(ide.splitEditor,'splitEditor').call(ide,p.direction);break;
   case 'panel':{const feature={terminal:'terminal',debug:'debugger',console:'console',problems:'diagnostics'}[p.name];if(feature&&!ide.addons.host.enabled(feature))throw new AdapterMismatch('Feature is disabled: '+feature);need(ide.showPanel,'showPanel').call(ide,p.name);break;}
   case 'side':{const feature={outline:'outline',search:'projectSearch',git:'git'}[p.name];if(feature&&!ide.addons.host.enabled(feature))throw new AdapterMismatch('Feature is disabled: '+feature);need(ide.showSide,'showSide').call(ide,p.name);break;}
   case 'settings':await need(ide.changeSettings,'changeSettings').call(ide,p.values);for(const[key,value]of Object.entries(p.values))if(ide.settings[key]!==value)throw Error('Setting was not applied: '+key);break;
   case 'project':{const id=Object.keys(ide.state.projectLabels||{}).find(id=>ide.state.projectLabels[id]===p.name);need(id,'synthetic project '+p.name);await ide.switchProject(id);break;}
   case 'create':await nativeCall('newFile',{path:own(p.file),text:p.text});await ide.refreshTree();break;
   case 'rename':await need(ide.relocateTreeItem,'relocateTreeItem').call(ide,own(p.from),own(p.to),false);break;
   case 'trashRestore':{await ide.saveAll();const file=own(p.file),records=await nativeCall('projectTrashItems',{paths:[file]});if(!Array.isArray(records)||records.length!==1)throw Error('Project trash returned inconsistent entries');await nativeCall('projectTrashRestore',{ids:records.map(r=>r.id)});await ide.refreshTree();break;}
   case 'copy':{const result=await nativeCall('projectTransferItems',{paths:[own(p.file)],destination:own('').replace(/\/$/,''),mode:'copy'});if(result.length!==1)throw Error('Copy did not return its destination');await ide.refreshTree();return{path:result[0].path};}
   case 'popup':need(typeof StudioChoices==='undefined'?null:StudioChoices,'select popovers').open(need(document.querySelector('#projectSelect'),'project select'));break;
   case 'addonSearch':{const input=target('addonSearch');input.focus();input.value=p.query;input.dispatchEvent(new Event('input',{bubbles:true}));break;}
   case 'quick':{const button=[...document.querySelectorAll(bindings.search.fallback)].find(visible);if(button)button.click();else await need(ide.quick,'universal search').call(ide,'files');await settle();const input=target('quickInput');input.focus();break;}
   case 'addonToggle':{const addons=need(ide.addons,'addons'),entry=addons.marketplaceEntries().find(e=>e.manifest.id===p.id);need(entry,'local addon '+p.id);if(!entry.installed)throw new AdapterMismatch('addon is not already installed: '+p.id);await addons.marketToggle(entry,!entry.enabled,{reviewed:true});break;}
   case 'notebook':await ide.openFile(own('notebook.ipynb'));await settle();notebook();break;
   case 'notebookAdd':{const view=views()?.pane(ide.editor)?.documentView;need(view?.add,'notebook add');view.add(p.kind);break;}
   case 'notebookFocus':{const cells=notebook(),view=views().pane(ide.editor).documentView,input=view.rows.get(cells.at(-1))?.source?.input;need(input,'new notebook cell input').focus();return{point:point(input)};}
   case 'assertNotebook':{const cells=notebook(),cell=cells.at(-1);if(cell.cell_type!==p.kind||(Array.isArray(cell.source)?cell.source.join(''):cell.source)!==p.text)throw Error('Notebook input did not reach its new '+p.kind+' cell');break;}
   case 'assertScope':own('scratch.txt');break;
   case 'invalidPath':{let rejected=false;try{await nativeCall('newFile',{path:ide.state.root+'/../soak-escape.txt',text:'must be rejected'});}catch{rejected=true;}if(!rejected)throw Error('Parent-directory traversal was accepted');break;}
   case 'externalReady':{await closeTransient();await ide.openFile(own('external.txt'));await ide.saveDoc();return{path:ide.active.path,text:ide.active.model.getValue()};}
   case 'assertExternal':{if(!ide.active?.path.endsWith('/external.txt'))throw Error('External refresh changed the selected document');if(ide.active.model.getValue()!==p.text||ide.active.saved!==p.text||ide.active.externalConflict)throw Error('Clean external update is not synchronized');break;}
   case 'waitExternal':{const end=Date.now()+10000;while(Date.now()<end&&ide.active?.model.getValue()!==p.text)await new Promise(resolve=>setTimeout(resolve,100));return perform({type:'assertExternal',params:p});}
   case 'checkpoint':await closeTransient();await ide.openFile(own('visual-reference.cpp'));if(p.view==='settings')ide.openSettings();else if(p.view==='addons')await ide.addons.open();await settle();return{view:p.view,theme:ide.settings.theme,font:ide.settings.fontSize,language:ide.settings.language};
   case 'selfCheck':{const div=document.createElement('div');div.id='soak-visual-self-check';div.style.cssText='position:fixed;top:100px;left:100px;width:90px;height:20px;overflow:hidden;background:#20252c;z-index:999999';div.innerHTML='<button style="width:240px;height:36px;white-space:nowrap">Intentional clipping self-check fixture</button>';document.body.append(div);break;}
   case 'selfCheckRemove':document.querySelector('#soak-visual-self-check')?.remove();break;
   default:throw new AdapterMismatch('unknown action '+action.type);
  }
  await settle();return{ok:true};
 }
 const api={schema:1,name:'devforge-current-adapter',
  ready(){return !!window.forge?.startupComplete;},
  probe(){const ide=app();return{schema:1,version:ide.state.version,root:ide.state.root,features:{files:!!ide.openFile,settings:!!ide.changeSettings,panels:!!ide.showPanel,notebook:!!globalThis.StudioNotebook,addons:!!ide.addons?.marketplaceEntries,windows:!!ide.windows,vsx:!!globalThis.StudioCodeOSS?.api},bindings:Object.keys(bindings)};},
  async initialize(roots){await app().sessionReady;window.__soakExpectedRoots=roots.map(root=>root.replaceAll('\\','/').toLowerCase());return perform({type:'assertScope'});},
  async perform(action){try{return{ok:true,value:await perform(action)};}catch(error){return{ok:false,adapter:error instanceof AdapterMismatch,error:error.stack||String(error)};}},
  context(){const ide=window.forge;return{version:ide?.state.version,root:ide?.state.root,project:ide?.state.project,active:ide?.active?.path,tabs:ide?.tabs?.map(d=>({path:d.path,virtual:d.virtual,dirty:!d.model.isDisposed()&&d.model.getValue()!==d.saved,disposed:d.model.isDisposed(),readonly:d.readonly,externalRefreshing:d.externalRefreshing,pendingFileOperation:d.pendingFileOperation,fileMoved:d.fileMoved,fileDeleted:d.fileDeleted,externalConflict:d.externalConflict,savedLength:d.saved?.length,modelLength:d.model.isDisposed()?null:d.model.getValueLength()})),settings:ide?{theme:ide.settings.theme,fontSize:ide.settings.fontSize,wordWrap:ide.settings.wordWrap,language:ide.settings.language}:null,focus:{tag:document.activeElement?.tagName,label:label(document.activeElement||document.body)},popups:[...document.querySelectorAll('dialog[open],[popover]:popover-open,.monaco-dialog-modal-block')].filter(visible).map(n=>({label:label(n).slice(0,200),rect:n.getBoundingClientRect().toJSON()})),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},models:globalThis.monaco?.editor?.getModels().length,heap:performance.memory?.usedJSHeapSize,pending:globalThis.StudioNativeActivity?[...StudioNativeActivity.pending.values()]:[],addonErrors:ide?.addons?.errors?.slice(-5)};},
  invariant(){const ide=app(),problems=[];if(ide.startupComplete&&ide.active&&!ide.active.virtual&&ide.editor.getModel()!==ide.active.model)problems.push('active document and editor have different models');const paths=ide.tabs.map(d=>d.path.toLowerCase());if(new Set(paths).size!==paths.length)problems.push('duplicate source tabs');if(ide.tabs.some(d=>d.model.isDisposed()))problems.push('a live tab owns a disposed model');if(ide.state.capabilities?.projectReadOnly&&ide.tabs.some(d=>!d.virtual&&!d.readonly))problems.push('a read-only window has writable source tabs');return problems;},
 };
 globalThis.__devforgeSoak=api;return{schema:api.schema,ready:api.ready()};
})()
