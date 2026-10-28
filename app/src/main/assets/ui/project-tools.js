'use strict';
function cmakeCalls(text){
  const clean=text.replace(/#\[(=*)\[[\s\S]*?\]\1\]/g,'').replace(/(^|\n)[ \t]*#[^\n]*/g,'$1');
  const calls=[];let match;const pattern=/\b([A-Za-z_][\w]*)\s*\(/g;
  while((match=pattern.exec(clean))){let end=pattern.lastIndex,depth=1,quote=false,escape=false;
    for(;end<clean.length&&depth;end++){const c=clean[end];if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c==='"')quote=!quote;if(!quote){if(c==='#'){while(end<clean.length&&clean[end]!=='\n')end++;}else if(c==='(')depth++;else if(c===')')depth--;}}
    const body=clean.slice(pattern.lastIndex,end-1),args=[];body.replace(/"((?:\\.|[^"\\])*)"|([^\s;()]+)/g,(_,a,b)=>{if(b?.startsWith('#'))return '';args.push((a??b).replace(/\\(["\\])/g,'$1'));return '';});
    calls.push({name:match[1].toLowerCase(),args});pattern.lastIndex=end;
  }return calls;
}
const projectToolsMethods={
  initProjectTools(){
    registerBuildLanguages(this);
    const banner=document.createElement('button');banner.id='cmakeFileStatus';banner.className='cmake-file-status hidden';banner.onclick=()=>this.offerCMakeSource();$('#breadcrumb').after(banner);
    const picker=document.createElement('dialog');picker.id='folderDialog';picker.className='folder-dialog';picker.innerHTML=`<div class="dialog-heading"><h2>Открыть папку проекта</h2><button class="close-button" id="closeFolder" data-icon="x"></button></div><p>Файлы остаются в исходной папке. Рабочая папка запуска — корень проекта.</p><div class="folder-navigation"><button id="folderUp" title="На уровень выше" data-icon="arrow-up"></button><input id="folderPath" spellcheck="false" aria-label="Путь к папке"><button id="folderGo">Перейти</button></div><div id="folderRoots" class="folder-roots"></div><div id="folderEntries" class="folder-entries"></div><div class="dialog-buttons"><button id="folderPermission" class="hidden">Разрешить доступ к файлам</button><button id="selectFolder" class="primary">Открыть эту папку</button></div>`;document.body.append(picker);
    $('#closeFolder').onclick=()=>picker.close();$('#folderGo').onclick=()=>this.browseFolder($('#folderPath').value);$('#folderPath').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.browseFolder(e.target.value);}};$('#folderPermission').onclick=()=>native('storagePermission');$('#selectFolder').onclick=()=>this.selectDeviceFolder();
    onNative('storageAccess',()=>{if(picker.open)this.browseFolder($('#folderPath').value||undefined).catch(safeError);});
    native('formatterConfig').then(()=>this.refreshTree()).catch(console.warn);
    this.initFormatter();
    monaco.editor.onDidChangeMarkers(uris=>{for(const uri of uris){const model=monaco.editor.getModel(uri);if(model)NativeEditing.publishDiagnostics(model);}});
  },
  async showInFiles(path){await this.saveAll();await native('showInFiles',{path});},
  async openDeviceFolder(){await this.saveAll();$('#folderDialog').showModal();await this.browseFolder(this.state.external?this.state.root:undefined);},
  async browseFolder(path){
    const result=await native('browseFilesystem',path?{path}:{});const list=$('#folderEntries');list.replaceChildren();$('#folderPermission').classList.toggle('hidden',result.permission);$('#selectFolder').disabled=!result.permission;
    $('#folderRoots').replaceChildren();for(const root of result.roots){const b=document.createElement('button');b.textContent=root;b.dataset.noI18n='';b.onclick=()=>this.browseFolder(root);$('#folderRoots').append(b);}
    if(!result.permission){const p=document.createElement('p');p.textContent=tr('Разрешите доступ, чтобы открывать и сохранять проекты в общей памяти.');list.append(p);return;}
    this.folderLocation=result.path;$('#folderPath').value=result.path;$('#folderUp').disabled=!result.parent;$('#folderUp').onclick=()=>result.parent&&this.browseFolder(result.parent);
    for(const item of result.entries){const b=document.createElement('button');b.className='folder-entry';b.dataset.noI18n='';b.innerHTML=svg(item.dir?'folder':'file-text')+'<span>'+escapeHtml(item.name)+'</span>';b.disabled=!item.dir;b.onclick=()=>this.browseFolder(item.path);list.append(b);}
  },
  async selectDeviceFolder(){const result=await native('openFolder',{path:this.folderLocation});$('#folderDialog').close();await this.switchProject(result.project);await native('formatterConfig');await this.refreshTree();this.toast('Папка открыта без копирования');},
  async newFolder(directory){directory??=this.treeDirectory();const answer=await this.prompt('Новая папка','Путь относительно проекта',directory?directory+'/new_folder':'src');if(!answer)return;const path=this.state.root+'/'+answer.value.trim();await native('newFolder',{path});await this.refreshTree();this.selectTreeItem({path,dir:true});},
  async inspectCmake(model=this.active?.model){
    if(!model||this.docs.get(model.uri.toString())?.readonly||!['cpp','c'].includes(model.getLanguageId()))return null;
    const project=this.state.project,root=this.state.root,source=model.uri.fsPath;const files=this.flatFiles().filter(f=>f.name==='CMakeLists.txt'||f.name.endsWith('.cmake')).slice(0,100);
    if(!files.some(f=>f.path===root+'/CMakeLists.txt'))return null;
    const targets=[],listed=new Set(),vars={CMAKE_SOURCE_DIR:root,PROJECT_SOURCE_DIR:root};let dynamic=false;
    const absolute=(value,dir)=>{const parts=(value.startsWith('/')?value:dir+'/'+value).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return '/'+out.join('/');};
    for(const file of files){const doc=this.docs.get(monaco.Uri.file(file.path).toString()),text=doc?doc.model.getValue():(await native('read',{path:file.path})).text,dir=file.path.slice(0,file.path.lastIndexOf('/'));vars.CMAKE_CURRENT_SOURCE_DIR=dir;
      const expand=value=>value.replace(/\$\{([^}]+)\}/g,(all,key)=>vars[key]??all).split(';');
      for(const call of cmakeCalls(text)){const a=call.args;if(call.name==='set'&&a.length>1){vars[a[0]]=a.slice(1).flatMap(expand).join(';');continue;}
        if(call.name==='file'&&/^GLOB/.test(a[0]||'')){for(const pattern of a.slice(2).flatMap(expand)){if(!pattern.includes('*'))continue;const regex=new RegExp('^'+absolute(pattern,dir).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,a[0]==='GLOB_RECURSE'?'.*':'[^/]*')+'$');if(regex.test(source))listed.add(source);}continue;}
        if(!['add_executable','add_library','target_sources'].includes(call.name))continue;
        if(a.some(x=>x==='IMPORTED'||x==='ALIAS'))continue;
        if(call.name!=='target_sources'&&/^[\w.+-]+$/.test(a[0]||''))targets.push({name:a[0],file:file.path});
        for(const token of a.slice(1).flatMap(expand)){if(token.includes('${')||token.includes('$<')){dynamic=true;continue;}if(/\.(c|cc|cpp|cxx|C|h|hh|hpp|hxx)$/i.test(token))listed.add(absolute(token,dir));}
      }
    }
    const database=await native('cmakeSources');if(project!==this.state.project)return null;
    const included=listed.has(source)||database.files.includes(source),result={source,targets:[...new Map(targets.map(t=>[t.name,t])).values()],included,dynamic,configured:database.configured};this.cmakeSnapshot=result;return result;
  },
  scheduleCMakeInspection(){clearTimeout(this.cmakeInspectTimer);this.cmakeInspectTimer=setTimeout(()=>this.refreshCMakeStatus().catch(console.warn),250);},
  async refreshCMakeStatus(){const doc=this.active,status=await this.inspectCmake(doc?.model);if(doc!==this.active)return;const button=$('#cmakeFileStatus');button.classList.toggle('hidden',!status||status.included||status.dynamic||!status.targets?.length);if(!doc)return;monaco.editor.setModelMarkers(doc.model,'cmake-project',!status||status.included||status.dynamic||!status.targets?.length?[]:[{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:Math.max(2,doc.model.getLineMaxColumn(1)),severity:monaco.MarkerSeverity.Info,message:tr('Файл не включён в цель CMake. Можно добавить его через быстрое исправление.'),source:'CMake',code:'cmake-unlisted-source'}]);NativeEditing.publishDiagnostics(doc.model);if(status&&!status.included&&status.targets?.length){button.textContent=tr('Не входит в CMake · Добавить');button.title=tr('Добавить исходный файл в цель CMake');}},
  async offerCMakeSource(path=this.active?.path){const model=await this.ensureModel(path),status=await this.inspectCmake(model);if(!status||status.included){this.toast('Файл уже включён в CMake');return;}if(!status.targets.length){this.toast('В CMake не найдена обычная цель add_executable/add_library');return;}if(status.targets.length===1)return this.addCMakeSource(path,status.targets[0]);this.quickItems=status.targets.map(target=>({label:target.name,detail:relative(target.file,this.state.root),run:()=>this.addCMakeSource(path,target)}));this.openQuick('Выберите цель CMake');},
  async addCMakeSource(path,target){
    const file=target.file,model=await this.ensureModel(file),dir=file.slice(0,file.lastIndexOf('/'));const from=dir.split('/'),to=path.split('/');while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}const name=[...from.map(()=>'..'),...to].join('/');const quoted='"'+name.replace(/\\/g,'/').replace(/\$/g,'\\$').replace(/"/g,'\\"').replace(/;/g,'\\;')+'"';
    const edit=`\n# Added by DevForge\ntarget_sources(${target.name} PRIVATE\n    ${quoted}\n)\n`;model.pushEditOperations([],[{range:new monaco.Range(model.getLineCount(),model.getLineMaxColumn(model.getLineCount()),model.getLineCount(),model.getLineMaxColumn(model.getLineCount())),text:edit}],()=>null);await this.saveAll();await this.refreshCMakeStatus();await this.configureCMake();
  },
  async configureCMake(){if(this.busy||this.running)return;await this.saveAll();this.busy=true;this.updateRunButtons();this.showPanel('build');this.buildId='cmake-config-'+(++this.sequence);try{const result=await native('cmakeConfigure',{options:this.configurations?.current()?.options||this.settings,id:this.buildId});if(result.code!==0)throw new Error(tr('CMake не настроен. Подробности в панели сборки.'));await this.lsp.start();await this.refreshCMakeStatus();this.toast('CMake обновлён');}finally{this.busy=false;this.updateRunButtons();}},
  projectCommands(){return[{label:'Открыть папку устройства',key:'Ctrl+Alt+O',run:()=>this.openDeviceFolder()},{label:'Создать папку',run:()=>this.newFolder()},{label:'Обновить CMake',run:()=>this.configureCMake()},{label:'Добавить файл в CMake',run:()=>this.offerCMakeSource()},{label:'Настроить форматтер',key:'Ctrl+Alt+Shift+L',run:()=>this.openFormatter()},{label:'Открыть .clang-format',run:async()=>{const config=await native('formatterConfig');await this.refreshTree();await this.openFile(config.path);}}];}
};
