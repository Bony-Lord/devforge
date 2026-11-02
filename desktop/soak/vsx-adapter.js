(()=>{
 'use strict';
 let fixture;const a=()=>window.forge.addons,api=()=>StudioCodeOSS.api,ide=()=>window.forge;
 const need=(value,label)=>{if(!value){const error=Error('Missing VSX adapter binding: '+label);error.name='AdapterMismatch';throw error;}return value;};
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const entry=id=>need(a().marketplaceEntries().find(e=>e.manifest.id===id&&e.manifest.version===(a().manager.active.get(id)?.manifest.version||e.manifest.version)),'extension '+id);
 async function wait(test,label){const deadline=Date.now()+15000;while(Date.now()<deadline){if(await test())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('VSX assertion timed out: '+label);}
 async function install(key){const pkg=fixture.packages[key];await a().review(pkg,false,{dependenciesPrepared:true,dependencyPackages:[fixture.packages.library]});assert(!a().pendingReview?.prepareError,'VSIX review failed: '+a().pendingReview?.prepareError);a().pendingReview.accepted=true;await a().install(pkg,true);}
 async function enable(key='probe'){
  const id=fixture.ids[key];if(!a().library.packages.some(e=>e.package.manifest.id===id))await install(key);
  if(!a().manager.active.has(id))await a().marketToggle(entry(id),true,true,true);
  if(key==='probe'){const result=await api().execute('df.vsx.probe');assert(result.dependency===42,'VSX dependency did not activate before its dependent');return result;}
 }
 const commands=()=>api().vscode.commands.getCommands(true);
 async function openSample(){await enable();await ide().openFile(ide().state.root+'/sample.dfpipe');ide().editor.focus();return ide().active.model;}
 async function perform(action){
  need(fixture,'initialize');const p=action.params||{},ids=fixture.ids;let model;
  switch(action.type){
   case 'vsx-command':case 'vsx-reload':await enable();break;
   case 'vsx-language-resources':{
    model=await openSample();assert(model.getLanguageId()==='df pipe (finder)','VSX language ID was changed or its file association is missing');await api().prepareLanguage('df pipe (finder)');
    model.setValue('BAD example\n');need(model.tokenization?.forceTokenization,'model tokenization');await wait(()=>{model.tokenization.forceTokenization(1);return model.tokenization.getLineTokens(1).getStandardTokenType(0)===1;},'contributed TextMate grammar');
    const bundle=await native('vscodeBundle',{id:ids.probe,dataOnly:true}),file=bundle.folder+'/language.json',response=await fetch(api().resourceUrl(file));assert(response.ok,'VSX language resource fetch returned '+response.status);assert((await response.json()).brackets.length===1,'VSX resource bytes changed');break;
   }
   case 'vsx-providers':{
    model=await openSample();model.setValue('BAD example\n');const uri=model.uri,pos=new (api().vscode.Position)(0,1);
    await wait(async()=>{const r=await api().execute('vscode.executeCompletionItemProvider',uri,pos);return r.items.some(i=>(typeof i.label==='string'?i.label:i.label.label)==='finderCompletion');},'extension completion');
    assert((await api().execute('vscode.executeHoverProvider',uri,pos)).length>0,'VSX hover provider returned no result');
    assert((await api().execute('vscode.executeDocumentSymbolProvider',uri)).some(s=>s.name==='finderSymbol'),'VSX document symbol provider is missing');
    await wait(()=>monaco.editor.getModelMarkers({resource:uri}).some(m=>m.message==='VSX Finder BAD token'),'extension diagnostics');
    await api().execute('editor.action.formatDocument');assert(model.getValue()==='BAD EXAMPLE\n','VSX formatter did not modify the actual active model');await ide().saveDoc();break;
   }
   case 'vsx-settings':{
    await enable();const values=structuredClone(ide().settings.extensionSettings||{});values[ids.probe]={...values[ids.probe],'df.vsx.mode':p.mode};await ide().changeSettings({extensionSettings:values});
    await wait(async()=>(await api().execute('df.vsx.probe')).mode===p.mode,'IDE setting did not reach the extension host');const opposite=p.mode==='one'?'two':'one';await api().execute('df.vsx.update',opposite);
    await wait(()=>ide().settings.extensionSettings[ids.probe]?.['df.vsx.mode']===opposite,'extension configuration did not synchronize back');break;
   }
   case 'vsx-settings-ui':await enable();await a().openExtensionSettings(ids.probe);await frame();assert(document.querySelector('.extension-settings-page [name="df.vsx.mode"]'),'VSX configuration UI did not add its choice field');break;
   case 'vsx-lifecycle':{
    await openSample();await a().marketToggle(entry(ids.probe),false,true,true);
    assert(!a().manager.active.has(ids.probe),'Disabled extension remains active');assert(!(await commands()).includes('df.vsx.probe'),'Disabled extension left a command behind');
    assert(!a().registry.list('languages').some(e=>e.owner===ids.probe),'Disabled extension left a language contribution behind');assert(!monaco.editor.getModelMarkers({}).some(m=>m.message==='VSX Finder BAD token'),'Disabled extension left diagnostics behind');
    await enable();break;
   }
   case 'vsx-dependency-review':{
    await enable();const result=a().dependencyInfo(entry(ids.library));assert(result.dependents.some(m=>m.id===ids.probe),'Reverse VSX dependency is missing');
    a().reviewDependencyChange(entry(ids.library),'disable');await frame();const form=need(document.querySelector('.addon-dependency-review'),'dependency dialog');assert(form.textContent.includes(ids.probe),'Dependency warning omits the dependent extension');assert(a().manager.active.has(ids.probe),'Opening dependency review disabled an extension');break;
   }
   case 'vsx-uninstall-reinstall':{
    if(action.phase==='install'){await install('probe');await enable();break;}
    await enable();await a().marketToggle(entry(ids.probe),false,true,true);await a().marketRemove(entry(ids.probe),true);
    assert(!a().library.packages.some(e=>e.package.manifest.id===ids.probe),'Uninstalled VSIX remains installed');assert(!(await commands()).includes('df.vsx.probe'),'Uninstalled VSIX left a command behind');
    break;
   }
   case 'vsx-update-roundtrip':await install(action.phase);await wait(async()=>{const result=await api().execute('df.vsx.probe');globalThis.__vsxObservation={expectedVersion:fixture.packages[action.phase].manifest.version,actualVersion:result.version,phase:action.phase};return result.version===fixture.packages[action.phase].manifest.version;},'wrong extension version after switching versions');break;
   case 'vsx-sidebar':{
    await enable();const button=await (async()=>{await wait(()=>document.querySelector('.activitybar [data-vsx-container="workbench.view.extension.df-vsx"]'),'VSX container in native rail');return document.querySelector('.activitybar [data-vsx-container="workbench.view.extension.df-vsx"]');})();button.click();
    await wait(()=>ide().windows.contents.get('extensionViews')?.textContent.includes('VSX Finder tree ready'),'VSX tree in sidebar');const content=ide().windows.contents.get('extensionViews');assert(!content.querySelector('[id="workbench.parts.activitybar"]'),'VSX sidebar duplicated the activity rail');
    const panel=ide().windows.panel('extensionViews'),width=panel.group.element.clientWidth;for(const size of [180,380,width]){ide().windows.setGroupSize(panel.group,{width:size});await frame();await frame();const part=content.querySelector('[id="workbench.parts.sidebar"]'),box=part?.getBoundingClientRect(),available=content.getBoundingClientRect();assert(box&&box.width<=available.width+2,'VSX sidebar keeps a stale/minimum width after dock resize: '+box?.width+'/'+available.width);}
    break;
   }
   case 'vsx-context-menu':{
    model=await openSample();ide().fileMenu({path:ide().active.path},300,200);await frame();const button=[...document.querySelectorAll('#menu button')].find(b=>b.textContent.includes('VSX Finder Inspect'));assert(button,'VSX explorer/context command is absent');button.click();break;
   }
   case 'vsx-keybinding':await openSample();ide().editor.focus();break;
   case 'vsx-webview':await enable();await api().execute('df.vsx.webview');await wait(()=>ide().tabs.some(d=>d.virtual==='extension'||String(d.path).includes('codeoss')),'VSX webview editor');break;
   case 'vsx-browser':{
    await enable('browser');let result=await api().execute('df.vsx.browser');assert(result.worker&&result.answer===42,'Browser VSX did not run in a worker');await a().marketToggle(entry(ids.browser),false,true,true);assert(!(await commands()).includes('df.vsx.browser'),'Browser extension command remained after disable');await enable('browser');result=await api().execute('df.vsx.browser');assert(result.answer===42,'Browser extension did not recover after enable');break;
   }
   case 'vsx-gallery-search':{
    await enable();const original=window.native,queries=[];
    // Network responses are controlled here; search input/debounce/rendering are real.
    window.native=(op,data)=>op==='extensionGallerySearch'?(queries.push(data.query),new Promise(resolve=>setTimeout(()=>resolve({total:data.query==='latest'?2:1,extensions:[]}),data.query==='old'?500:20))):op==='extensionGalleryIcon'?Promise.resolve(null):original(op,data);
    try{a().openExternalGallery();await frame();const input=need(document.querySelector('.market-filters input[type=search]'),'gallery search');for(const query of ['old','latest']){input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,300));}await wait(()=>document.querySelector('.market-filters small')?.textContent==='Найдено: 2','latest gallery search');assert(queries.includes('latest'),'Gallery search did not run on input');}finally{window.native=original;}break;
   }
   case 'vsx-resize':await enable();await a().openExtensionSettings(ids.probe);await frame();break;
   default:{const error=Error('Unknown VSX scenario: '+action.type);error.name='AdapterMismatch';throw error;}
  }
  assert(!a().errors.length,'VSX addon errors: '+JSON.stringify(a().errors));await frame();return{ok:true};
 }
 const context=__devforgeSoak.context.bind(__devforgeSoak);__devforgeSoak.context=()=>({...context(),vsx:{ids:fixture?.ids,observation:globalThis.__vsxObservation,profile:a().profile,active:[...a().manager.active.keys()].filter(id=>id.startsWith('vscode.')),installed:a().library.packages.filter(e=>e.package.manifest.vscode).map(e=>({id:e.package.manifest.id,version:e.package.manifest.version})),errors:a().errors}});
 globalThis.__devforgeVSX={schema:1,initialize(value){assert(value?.schema===1,'VSX fixture schema mismatch');fixture=value;},refreshPackage(key,value){assert(fixture.packages[key]&&value.manifest.id===fixture.packages[key].manifest.id,'VSX fixture identity changed');fixture.packages[key]=value;},perform};
 return{schema:1,ready:__devforgeSoak.ready()};
})()
