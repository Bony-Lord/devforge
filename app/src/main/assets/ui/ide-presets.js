'use strict';
const StudioIDEPresets={
 uri:'devforge://presets/ide',
 register(ide){
  StudioExtensionAPI.views.set(this.uri,{owner:'studio.core.ide-presets',title:ide.settings.language==='en'?'IDE packs':'IDE-паки',render:container=>this.render(ide,container)});
 },
 async open(ide){
  this.register(ide);
  return ide.openFile(this.uri);
 },
 render(ide,container){
  const addons=ide.addons,page=addons.element('section',undefined,'ide-presets-page'),heading=addons.element('header'),grid=addons.element('div',undefined,'ide-presets-grid');heading.append(addons.element('h2',addons.text('IDE-паки','IDE packs')));page.append(heading,grid);container.append(page);
  for(const pkg of addons.available.filter(p=>p.manifest.idePreset)){
   const m=pkg.manifest,card=addons.element('article',undefined,'ide-preset-card');card.dataset.idePreset=m.idePreset.id;card.append(addons.element('h3',addons.local(m.name)),addons.element('p',addons.local(m.description)));if(m.idePreset.tools!=='DevForge')card.append(addons.element('small',m.idePreset.tools));
   const contents=addons.element('details'),list=addons.element('ul');contents.append(addons.element('summary',addons.text('Состав','Components')),list);for(const id of Object.keys(m.includes||{})){const manifest=addons.catalog.find(m=>m.id===id)||addons.available.find(p=>p.manifest.id===id)?.manifest;list.append(addons.element('li',manifest?addons.local(manifest.name):id));}card.append(contents);
   if(Object.keys(m.idePreset.settings).length){const settings=addons.element('details');settings.append(addons.element('summary',addons.text('Настройки пресета','Preset settings')));const code=addons.element('pre',JSON.stringify(m.idePreset.settings,null,2));settings.append(code);card.append(settings);}
   const install=addons.element('button',addons.text('Выбрать и настроить…','Select and configure…'),'primary');install.onclick=()=>addons.review(pkg,true);if(m.platforms&&!m.platforms.includes(StudioAddonCore.currentPlatform())){install.disabled=true;install.textContent=addons.text('Для Android','For Android');}card.append(install);grid.append(card);
  }
  return()=>page.remove();
 },
 async activate(api,key){
  const ide=api.raw.application,definition=ide.addons.available.find(p=>p.manifest.ideIntegration?.id===key)?.manifest;if(!definition)return;
  const analysis=async()=>{
   if(key!=='cpp'||!ide.state.trust?.trusted||ide.state.capabilities.projectReadOnly)return null;
   const tools=await native('idePresetTools');if(!tools.clangd||!(ide.settings.compiler==='clang'?tools.clangxx:tools.gxx))return null;
   return native('idePresetAnalysis',ide.configurations?.current()?.options||ide.settings);
  };
  const apply=async(force=false)=>{
   const settings=structuredClone(ide.settings.extensionSettings||{}),own=settings[definition.id]||{},presets=api.configuration.get('devforge.ide.recommendedSettings',definition.ideIntegration.settings);
   for(const[name,value]of Object.entries(presets)){
    const owners={'clangd.':'vscode.llvm-vs-code-extensions.vscode-clangd','python.analysis.':'vscode.ms-pyright.pyright','eslint.':'vscode.dbaeumer.vscode-eslint','rust-analyzer.':'vscode.rust-lang.rust-analyzer','go.':'vscode.golang.go','java.':'vscode.redhat.java'};
    const target=Object.entries(owners).find(([prefix])=>name.startsWith(prefix))?.[1]||definition.id;
    settings[target]??={};if(force||!Object.hasOwn(settings[target],name))settings[target][name]=structuredClone(value);
   }
   const tools=api.configuration.get('devforge.ide.detectTools',true)?await native('idePresetTools'):{};
   if(key==='cpp'&&tools.clangd){settings['vscode.llvm-vs-code-extensions.vscode-clangd']??={};settings['vscode.llvm-vs-code-extensions.vscode-clangd']['clangd.path']??=tools.clangd;}
   if(key==='cpp'&&tools.clangd){const prepared=await analysis();if(prepared){const values=settings['vscode.llvm-vs-code-extensions.vscode-clangd'],args=values['clangd.arguments']||[];values['clangd.arguments']=[...args.filter(arg=>!/^--(?:compile-commands-dir|query-driver)=/.test(arg)),...prepared.args.filter(arg=>/^--(?:compile-commands-dir|query-driver)=/.test(arg))];}}
   if(['python','notebook'].includes(key)&&tools.python){settings[definition.id]??={};settings[definition.id]['python.defaultInterpreterPath']??=tools.python;settings['vscode.ms-pyright.pyright']??={};settings['vscode.ms-pyright.pyright']['python.pythonPath']??=tools.python;for(const name of ['autopep8','flake8']){settings['vscode.ms-python.'+name]??={};settings['vscode.ms-python.'+name][name+'.interpreter']??=[tools.python];}}
   settings[definition.id]={...own,...settings[definition.id],'devforge.ide.appliedVersion':definition.version};
   await ide.changeSettings({extensionSettings:settings});
  };
  api.commands.register('apply-preset',ide.settings.language==='en'?'Apply '+key+' defaults':'Применить настройки '+key,()=>apply(true));
  if(api.configuration.get('devforge.ide.applyRecommendedSettings',true)&&api.configuration.get('devforge.ide.appliedVersion')!==definition.version)await apply();
  if(key==='cpp'){
   let timer;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>analysis().catch(error=>ide.toast(error.message)),350);};api.use(()=>clearTimeout(timer));
   api.host.on('treeChanged',refresh);api.host.on('workspaceStructureChanged',refresh);
   api.hook(ide,'changeSettings',async(next,data)=>{const value=await next(data);if(['compiler','cppStandard','cStandard','flags','buildMode','target','toolPaths'].some(name=>name in data))await analysis();return value;});
  }
 }
};
