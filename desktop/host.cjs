'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace,portable,canonical,inside,exists,atomic,encode}=require('./workspace.cjs');
const {Tooling,capture}=require('./tooling.cjs');
const {ProjectConfigurations}=require('./project-config.cjs');
const {AddonLibrary}=require('./addons.cjs');
const {PythonHost}=require('./python.cjs');
const {PythonStyleHost}=require('./python-style.cjs');
const {PythonIntelligenceHost}=require('./python-intelligence.cjs');
const {OptionalAssets}=require('./optional-assets.cjs');
const {ProjectTemplateFiles}=require('./project-templates.cjs');
const {ProjectLibrary}=require('./project-library.cjs');
const {PythonRuntimes}=require('./python-runtimes.cjs');
const STYLE='BasedOnStyle: LLVM\nIndentWidth: 4\nTabWidth: 4\nUseTab: Never\nColumnLimit: 120\nBreakBeforeBraces: Attach\nAccessModifierOffset: -4\nNamespaceIndentation: None\nAllowShortFunctionsOnASingleLine: Empty\nAllowShortIfStatementsOnASingleLine: Never\nAllowShortLoopsOnASingleLine: false\nDerivePointerAlignment: false\nPointerAlignment: Right\nReferenceAlignment: Left\nSpaceBeforeParens: ControlStatements\nSpaceBeforeRangeBasedForLoopColon: true\n';
const CLION_STYLE=STYLE.replace('ReferenceAlignment: Left','ReferenceAlignment: Right').replace('SpaceBeforeRangeBasedForLoopColon: true','SpaceBeforeRangeBasedForLoopColon: false');
class DesktopHost {
  constructor(data,event=()=>{},system={}){this.ws=system.workspace||new Workspace(data,system.projectsDirectory);this.event=event;this.system=system;this.tools=new Tooling(this.ws,event);this.configurations=new ProjectConfigurations(this);this.operations=new Map();this.settingsQueue=Promise.resolve();this.addons=new AddonLibrary(this);this.python=new PythonHost(this);this.pythonStyle=new PythonStyleHost(this);this.pythonIntelligence=new PythonIntelligenceHost(this);this.templates=new ProjectTemplateFiles(this.ws);this.optionalAssets=new OptionalAssets(this);this.projects=new ProjectLibrary(this);this.pythonRuntimes=new PythonRuntimes(this);}
  async init(){await this.ws.init();await this.addons.init();await this.tools.discover();if(!this.ws.prefs.settings.compiler&&!this.tools.tools.gxx&&this.tools.tools.clangxx){this.ws.prefs.settings.compiler='clang';await this.ws.persist();}return this;}
  async state(){this.clientSettings=structuredClone(this.ws.prefs.settings);const hasProject=!!this.ws.prefs.projects[this.ws.prefs.current];return{project:this.ws.prefs.current,projectPaths:Object.fromEntries(Object.entries(this.ws.prefs.projects).map(([id,p])=>[id,p.path])),projectLabels:Object.fromEntries(Object.entries(this.ws.prefs.projects).map(([id,p])=>[id,p.label])),projects:Object.keys(this.ws.prefs.projects),root:hasProject?this.ws.root:'',external:hasProject,cache:portable(this.ws.cache),usr:portable(path.dirname(this.tools.tools.gxx||this.tools.tools.clangxx||process.execPath)),tree:hasProject?await this.ws.tree():[],settings:{keepAwake:false,...this.ws.prefs.settings},session:this.ws.prefs.session,abi:os.arch(),version:require('./package.json').version,trust:this.trust(),capabilities:{multiProjectWindows:!!this.system.openProjectWindow,protocol:1,platform:process.platform,editor:'monaco',toolDelivery:'system',localExecution:'native-process',debugger:(!!this.tools.tools.gdb&&!!this.tools.tools.gdbserver)||!!this.tools.tools.lldbdap,debugProtocol:this.tools.tools.gdb&&this.tools.tools.gdbserver?'mi':'dap',systemAnimations:!this.system.reducedMotion?.()}};}
  async handle(op,d={}){
    if(typeof op!=='string'||!d||typeof d!=='object'||Array.isArray(d))throw Error('Invalid request');
    const executes=['pythonCheck','pythonRun','notebookStart','notebookExecute','build','run','runCommand','shell','git','lspStart','lspSend','cmakeConfigure','formatDocument','formatterOnType','formatterRange','dapStart','dapSend','gdbStart','gdbSend'].includes(op);
    if(executes&&!this.trust().trusted)throw Error('WORKSPACE_UNTRUSTED: Trust this folder before executing project tools');
    if(op==='addonStateCommit'&&!d.resolved?.includes('studio.python-intelligence'))this.pythonIntelligence.stop();
    if(op==='addonStateCommit'&&!d.resolved?.some(id=>['studio.python-formatting','studio.python-diagnostics'].includes(id)))this.pythonStyle.stop();
    if(op.startsWith('addon')&&['addonLibrary','addonState','addonCatalog','addonStateCommit','addonBegin','addonFinish'].includes(op))return this.addons.handle(op,d);
    if(op==='pythonRuntimeCancel')return this.pythonRuntimes.cancel();if(op==='pythonRuntimes')return this.pythonRuntimes.info();if(op==='pythonRuntimeInstall'){const result=await this.pythonRuntimes.install(d.id);await this.tools.discover();return result;}if(op==='pythonRuntimeRemove')return this.pythonRuntimes.remove(d.id);
    if(op==='pythonInfo')return this.python.info(this.trust().trusted?d.options:undefined);if(op==='pythonEnvironments')return this.python.environment.list();if(op==='pythonRun')return this.python.run(d);if(op==='pythonCheck')return this.python.check(d);
    if(op==='optionalAssets')return this.optionalAssets.info();if(op==='optionalAssetInstall')return this.optionalAssets.install(d.id);if(op==='optionalAssetRemove')return this.optionalAssets.remove(d.id);
    if(op==='pythonIntelligenceInfo')return this.pythonIntelligence.info();
    if(op==='pythonIntelligenceInstall'||op==='pythonIntelligenceRemove')return this.pythonIntelligence.manage(op.endsWith('Install')?'install':'remove',d);
    if(op==='pythonIntelligence')return this.pythonIntelligence.request(d);
    if(op==='pythonIntelligenceStop'){this.pythonIntelligence.stop();return true;}
    if(op==='pythonStyleInfo')return this.pythonStyle.info();
    if(op==='pythonStyleInstall'||op==='pythonStyleRemove')return this.pythonStyle.manage(op==='pythonStyleInstall'?'install':'remove',d);
    if(op==='pythonStyleAnalyze'||op==='pythonStyleFormat')return this.pythonStyle.request(op==='pythonStyleAnalyze'?'analyze':'format',d);
    if(op==='pythonStyleCancel'){this.pythonStyle.stop();return true;}
    if(['notebookStart','notebookExecute'].includes(op)){if(!this.addons.enabled('studio.notebooks'))throw Error('Enable the notebook addon');return op==='notebookStart'?this.python.start(d):this.python.execute(d);}if(op==='notebookStop'){if(d.session!==undefined&&d.session!==this.python.generation)return false;await this.python.stop();return true;}
    if(op==='workspaceTrust')return this.trust();if(op==='workspaceTrustSet'){this.ws.prefs.trustedRoots={...this.ws.prefs.trustedRoots,[this.ws.root]:!!d.trusted};await this.ws.persist();if(!d.trusted){this.python.stop();this.pythonStyle.stop();this.pythonIntelligence.stop();await this.tools.close();}return this.trust();}
    if(['projectTemplateSnapshot','projectTemplateApply'].includes(op))return this.templates.handle(op,d);
    if(op.startsWith('editor'))return op==='editorSnapshot'?[]:op==='editorReset'?{}:true;
    switch(op){
      case 'state':return this.state();
      case 'projectConfigurations':return this.configurations.state();
      case 'saveConfigurations':return this.configurations.save(d);
      case 'selectConfiguration':return this.configurations.select(d);
      case 'resolveConfiguration':return this.configurations.resolve(d);
      case 'settingsCommit':case 'settings':{let settings=structuredClone(d);if(this.system.workspace&&this.clientSettings){settings={...this.ws.prefs.settings};for(const [key,value]of Object.entries(d)){if(JSON.stringify(value)===JSON.stringify(this.clientSettings[key]))continue;if(key==='projectInterfaces'&&value&&typeof value==='object'){const merged={...settings[key]};for(const [project,ui]of Object.entries(value))if(JSON.stringify(ui)!==JSON.stringify(this.clientSettings[key]?.[project]))merged[project]=ui;settings[key]=merged;}else settings[key]=structuredClone(value);}}this.clientSettings=structuredClone(d);this.ws.prefs.settings=settings;await this.ws.persist();await this.tools.discover();return settings;}
      case 'sessionCommit':case 'session':this.ws.prefs.session=structuredClone(d);await this.ws.persist();return true;
      case 'project':this.python.stop();this.pythonStyle.stop();this.pythonIntelligence.stop();if(!this.ws.prefs.projects[d.name]||!await exists(this.ws.prefs.projects[d.name].path))throw Error('Project unavailable');this.tools.stopLsp();this.ws.prefs.current=d.name;this.ws.prefs.projectSelectionCleared=false;await this.ws.persist();return this.state();
      case 'projectOpenWindow':if(!this.ws.prefs.projects[d.id]||!await exists(this.ws.prefs.projects[d.id].path))throw Error('Project unavailable');if(!this.system.openProjectWindow)throw Error('Multiple project windows are unavailable on this platform');return this.system.openProjectWindow(d.id);
      case 'projectDescribe':return this.projects.describe(d.id);
      case 'projectRemove':return this.projects.handle('remove',d);
      case 'projectDelete':return this.projects.handle('delete',d);
      case 'projectArchive':return this.projects.list();
      case 'projectRestore':return this.projects.handle('restore',d);
      case 'newProject':{const created=await this.ws.newProject(d.name,d.language,false);this.ws.prefs.trustedRoots={...this.ws.prefs.trustedRoots,[created.path]:true};await this.ws.persist();if(!['empty','template'].includes(d.language))await atomic(path.join(created.path,'.clang-format'),STYLE);return{...await this.state(),createdProject:created.project};}
      case 'tree':return this.ws.prefs.current?this.ws.tree(d.path?await this.ws.writable(d.path):this.ws.root):[];
      case 'read':return this.ws.read(d.path,d.encoding);
      case 'write':case 'convertEncoding':return this.serializeWrite(d.path,()=>this.ws.write(d.path,d.text,d.encoding));
      case 'newFile':{const file=await this.ws.writable(d.path);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,encode(d.text||'',d.encoding||this.ws.prefs.settings.defaultEncoding||'UTF-8'),{flag:'wx'});return file;}
      case 'newFolder':await fs.mkdir(await this.ws.writable(d.path));return true;
      case 'createTreeItem':return this.ws.createItem(d);
      case 'templatePreview':case 'createTemplate':return this.ws.createTemplate(d,op==='templatePreview');
      case 'moveProjectItem':return this.ws.move(d.path,d.to);
      case 'renameFile':await this.ws.move(d.path,d.to);return true;
      case 'deleteFile':{const file=await this.ws.writable(d.path);if(!(await fs.stat(file)).isFile())throw Error('Folder deletion is disabled');const trash=path.join(this.ws.root,'.forge','trash',Date.now()+'-'+path.basename(file));await fs.mkdir(path.dirname(trash),{recursive:true});await fs.rename(file,trash);return true;}
      case 'history':return this.ws.history(d.path);
      case 'browseFilesystem':return this.ws.browse(d.path);
      case 'storagePermission':return true;
      case 'openFolder':return this.ws.open(d.path);
      case 'import':{const folder=await this.system.chooseFolder?.();if(folder){const result=await this.ws.open(folder);this.event('imported',result);}return true;}
      case 'importFile':{const source=await this.system.chooseFile?.();if(!source)return true;const file=await this.ws.writable(path.basename(source));await fs.copyFile(source,file,require('node:fs').constants.COPYFILE_EXCL);this.event('fileImported',{path:file});return true;}
      case 'export':return this.system.exportProject?.(this.ws.root)||false;
      case 'showInFiles':{const file=await canonical(d.path||this.ws.root);if(!inside(file,await canonical(this.ws.root)))throw Error('Path outside project');await this.system.showInFiles?.(file);return true;}
      case 'reportBug':{const url=new URL('https://github.com/Bony-Lord/devforge/issues/new');url.searchParams.set('template','bug_report.yml');url.searchParams.set('version','1.0.0-rc.2');url.searchParams.set('device',process.platform+' '+os.arch());await this.system.openExternal?.(url.href);return url.href;}
      case 'chooseToolExecutable':return this.system.chooseFile?.()||null;
      case 'screen':case 'keyboard':return true;
      case 'desktopNotices':return this.system.showNotices?.();
      case 'desktopSources':return this.system.openExternal?.('https://github.com/Bony-Lord/devforge/releases');
      case 'clipboardWrite':if(typeof d.text!=='string'||d.text.length>256*1024)throw Error('Invalid clipboard text');this.system.writeClipboard?.(d.text);return true;
      case 'addonImport':{const file=await this.system.chooseFile?.();if(!file)return false;if((await fs.stat(file)).size>262144)throw Error('Template/addon exceeds 256 KiB');this.event('addonImported',{text:await fs.readFile(file,'utf8')});return true;}
      case 'addonExport':{const pkg=require(require('./assets.cjs').ui+'/addon-packages.js').parse(d.package);return this.system.saveData?.(JSON.stringify(pkg,null,2)+'\n','workspace.studio-addon')||false;}
      case 'performanceEvent':return true;
      case 'performanceReport':return {platform:process.platform,events:[]};
      case 'toolPacks':return this.toolPacks();
      case 'toolPackInstall':throw Error('Desktop tools are installed by your system package manager. Select existing executable paths in Settings → Tools.');
      case 'toolPackRemove':this.ws.prefs.settings.disabledTools={...this.ws.prefs.settings.disabledTools,[d.id]:true};await this.ws.persist();if(d.id==='analysis')this.tools.stopLsp();return this.toolPacks();
      case 'toolEnable':this.ws.prefs.settings.disabledTools={...this.ws.prefs.settings.disabledTools,[d.id]:false};await this.ws.persist();return this.toolPacks();
      case 'probe':{const result={};for(const key of ['gxx','gcc','clangxx','clangd','format','cmake','ninja','gdb','git'])try{const r=await capture(this.tools.tool(key),['--version'],{env:this.tools.env(),timeout:6000});result[key]=(r.text||r.error).split('\n')[0];}catch{result[key]='Not installed';}return result;}
      case 'build':return d.mode==='custom'?this.buildCustom(d):this.tools.build(d);
      case 'cmakeConfigure':return this.tools.build({...d,mode:'cmake',configureOnly:true});
      case 'runCommand':return this.runCommand(d);
      case 'run':return this.tools.run({...d,cwd:d.options?path.resolve(this.ws.root,d.options.workingDirectory||'.'):d.cwd,environment:d.options?.environment||d.environment});
      case 'shell':return this.tools.run(d,true);
      case 'stdin':if(this.tools.dap)this.tools.dap.input(d.text);else if(this.tools.gdb)this.tools.debugInput(d.text);else {if(!this.tools.execution)throw Error('Program is not running');this.tools.execution.stdin.write(d.text);}return true;
      case 'eof':if(this.tools.dap)this.tools.dap.terminal?.stdin.end();else if(this.tools.gdb)this.tools.server.stdin.end();else this.tools.execution?.stdin.end();return true;
      case 'stop':this.python.stop();await this.tools.stop();return true;
      case 'lspStart':return this.tools.startLsp(d);
      case 'lspSend':this.tools.sendLsp(d.message);return true;
      case 'lspStop':this.tools.stopLsp();return true;
      case 'dapStart':{if(this.tools.dap||this.tools.gdb||this.tools.execution)throw Error('Stop current process first');const {DebugAdapter}=require('./debug-adapter.cjs');const adapter=new DebugAdapter(this.tools,d.id,await this.tools.executable(d.executable),await this.tools.executionContext(d));this.tools.dap=adapter;try{return await adapter.start();}catch(e){adapter.stop();throw e;}}
      case 'dapSend':if(!this.tools.dap)throw Error('LLDB stopped');this.tools.dap.send(d.message);return true;
      case 'dapStop':this.tools.dap?.stop();return true;
      case 'runtimeSymbolize':return this.symbolize(d.addresses);
      case 'gdbStart':return this.tools.startDebug({...d,cwd:path.resolve(this.ws.root,d.options?.workingDirectory||'.'),environment:d.options?.environment||{}});
      case 'gdbSend':this.tools.sendDebug(d.command);return true;
      case 'gdbStop':await this.tools.stopDebug();return true;
      case 'gdbStdin':this.tools.debugInput(d.text);return true;
      case 'git':return this.git(d);
      case 'formatterConfig':return this.formatConfig();
      case 'formatterPresets':return{studio:STYLE,clion:CLION_STYLE};
      case 'formatterSchema':return this.format(['--style=LLVM','--dump-config'],'');
      case 'formatterTypingConfig':return this.typingConfig(d.path);
      case 'formatterPreview':{
        if(d.style.length>256*1024||d.text.length>2*1024*1024)throw Error('Formatter preview input too large');await fs.mkdir(this.ws.cache,{recursive:true});const file=path.join(this.ws.cache,'format-preview-'+require('node:crypto').randomUUID()+'.yaml');
        try{await fs.writeFile(file,d.style);return await this.format(['--style=file:'+portable(file),'--assume-filename=preview.cpp'],d.text);}finally{await fs.rm(file,{force:true});}
      }
      case 'formatDocument':await this.ws.read(d.path);await this.formatConfig();return this.format([this.formatStyle(),'--assume-filename='+d.path],d.text);
      case 'formatterOnType':{
        await this.ws.read(d.path);const byteCursor=Buffer.byteLength(d.text.slice(0,d.cursor)),r=await this.format([this.formatStyle(),'--assume-filename='+d.path,'--lines='+Math.max(1,d.firstLine||1)+':'+Math.max(1,d.lastLine||1),'--cursor='+byteCursor],d.text);
        if(!r.code){const at=r.text.indexOf('\n'),header=JSON.parse(r.text.slice(0,at));r.text=r.text.slice(at+1);r.cursor=Buffer.from(r.text).subarray(0,header.Cursor??byteCursor).toString().length;}return r;
      }
      case 'cmakeCommands':return capture(this.tools.tool('cmake'),['--help-command-list'],{env:this.tools.env()});
      case 'cmakeHelp':if(!/^[A-Za-z_]\w*$/.test(d.name))throw Error('Invalid CMake command');return capture(this.tools.tool('cmake'),['--help-command',d.name],{env:this.tools.env()});
      case 'cmakeSources':return this.tools.cmakeModel(this.ws.prefs.settings);
      case 'cmakeTargets':return(await this.tools.cmakeModel(d.options||this.ws.prefs.settings)).targets;
      default:throw Error('Unsupported operation: '+op);
    }
  }
  async serializeWrite(key,fn){const previous=this.operations.get(key)||Promise.resolve();const next=previous.catch(()=>{}).then(fn);this.operations.set(key,next);try{return await next;}finally{if(this.operations.get(key)===next)this.operations.delete(key);}}
  trust(){const root=this.ws.prefs.projects[this.ws.prefs.current]?.path||'';return{root,trusted:!!root&&!!this.ws.prefs.trustedRoots?.[root]};}
  toolPacks(){const t=this.tools.tools,disabled=this.ws.prefs.settings.disabledTools||{};return{delivery:'system',base:{},packs:[
    {id:'platform',name:'System C/C++ libraries',description:'System platform libraries',available:true},
    {id:'cmake',name:'CMake + Ninja',description:'System CMake and Ninja',available:!!t.cmake&&!!t.ninja,path:t.cmake},
    {id:'python',name:'Python 3',description:'System Python interpreter',available:!!t.python,path:t.python},
    {id:'gcc',name:'GCC',description:'Системный компилятор GCC',available:!!t.gcc&&!!t.gxx,path:t.gxx},
    {id:'clang',name:'Clang',description:'Системный компилятор Clang',available:!!t.clang&&!!t.clangxx,path:t.clangxx},
    {id:'analysis',name:'clangd'+(t.format?' + clang-format':''),description:'Анализ кода и форматирование',available:!!t.clangd,formatterAvailable:!!t.format,path:t.clangd},
    {id:'debugger',name:t.gdb&&t.gdbserver?'GDB + gdbserver':'LLDB',description:'Локальный отладчик с просмотром структур',available:(!!t.gdb&&!!t.gdbserver)||!!t.lldbdap,path:t.gdb&&t.gdbserver?t.gdb:t.lldbdap},
    {id:'git',name:'Git',description:'Локальный контроль версий',available:!!t.git,path:t.git}
  ].map(p=>({...p,system:true,installed:p.available&&!disabled[p.id],local:true,bytes:0,installedBytes:0,requires:[],probe:p.id}))};}
  async formatConfig(){let file=path.join(this.ws.root,'.clang-format');if(!await exists(file)&&await exists(path.join(this.ws.root,'_clang-format')))file=path.join(this.ws.root,'_clang-format');if(!await exists(file))await this.ws.write(file,STYLE);return{path:portable(file),text:await fs.readFile(file,'utf8'),defaults:STYLE};}
  formatStyle(){const settings=this.ws.prefs.settings;if(!settings.indentMode||settings.indentMode==='formatter')return'--style=file';return'--style={BasedOnStyle: InheritParentConfig, IndentWidth: '+Math.max(1,Math.min(16,settings.indentWidth||4))+', TabWidth: '+Math.max(1,Math.min(16,settings.tabWidth||4))+', UseTab: '+(settings.indentMode==='tabs'?'Always':'Never')+'}';}
  format(args,text){return capture(this.tools.tool('format'),args,{cwd:this.ws.root,env:this.tools.env(),input:text,timeout:15000});}
  async typingConfig(file){let result={indent:4,tab:4,continuation:4,tabs:false};if(this.tools.tools.format){await this.ws.read(file);const dump=await this.format(['--style=file','--assume-filename='+file,'--dump-config'],'');if(!dump.code)for(const [key,field]of Object.entries({IndentWidth:'indent',TabWidth:'tab',ContinuationIndentWidth:'continuation',UseTab:'tabs'})){const match=new RegExp('^'+key+':\\s*(.+)$','m').exec(dump.text);if(match)result[field]=field==='tabs'?match[1]!=='Never':Number(match[1]);}}
    const s=this.ws.prefs.settings;if(s.indentMode&&s.indentMode!=='formatter')result={...result,indent:Math.max(1,Math.min(16,s.indentWidth||4)),tab:Math.max(1,Math.min(16,s.tabWidth||4)),tabs:s.indentMode==='tabs'};return result;
  }
  async git(d){
    const command=async args=>{const r=await capture(this.tools.tool('git'),['--no-pager','-c','core.quotepath=false','-c','core.excludesFile='+await this.gitExcludes(),...args],{cwd:this.ws.root,env:this.tools.env(),timeout:120000});return{code:r.code,text:r.text+r.error};};
    switch(d.action){
      case 'status':return{...await command(['status','--porcelain=v1','-z']),branch:(await command(['symbolic-ref','--short','HEAD'])).text.trim()};
      case 'init':return command(['init','--initial-branch=main']);
      case 'add':if(d.path!=='.')await this.ws.writable(path.join(this.ws.root,d.path));return command(['add','--',d.path]);
      case 'commit':if(!d.name?.trim()||!d.email?.trim()||!d.message?.trim())throw Error('Author, email and message are required');if(d.stageAll){const r=await command(['add','--all']);if(r.code)return r;}return command(['-c','user.name='+d.name,'-c','user.email='+d.email,'commit','-m',d.message]);
      case 'log':return command(['log','-40','--date=iso-strict','--format=%h%x09%an%x09%ad%x09%s']);
      case 'branches':return command(['branch','--list','--format=%(refname:short)']);
      case 'switch':if(d.branch.startsWith('-'))throw Error('Invalid branch');return command(['switch',d.branch]);
      case 'newBranch':if(d.branch.startsWith('-'))throw Error('Invalid branch');return command(['switch','-c',d.branch]);
      case 'diff':{const file=await this.ws.writable(d.path),r=await command(['show','HEAD:'+portable(path.relative(this.ws.root,file))]);return{original:r.code?'':r.text,modified:(await this.ws.read(file)).text,path:file};}
      case 'clone':{
        if(!/^https:\/\//.test(d.url)||/[\r\n]/.test(d.url)||!d.name||/[<>:"/\\|?*\x00-\x1f]/.test(d.name)||['.','..'].includes(d.name))throw Error('Use an HTTPS repository and valid folder name');const destination=path.join(this.ws.projectsDirectory,d.name);if(await exists(destination))throw Error('Project exists');await fs.mkdir(path.dirname(destination),{recursive:true});
        const r=await command(['clone','--',d.url,destination]);if(!r.code){const project=await this.ws.open(destination);r.project=project.project;}return r;
      }
      default:throw Error('Unknown Git action');
    }
  }
  async gitExcludes(){const file=path.join(this.ws.data,'git-excludes');if(!await exists(file))await fs.writeFile(file,'.forge/\n');return file;}
  async symbolize(addresses){const frames=[];if(!this.tools.tools.addr2line)return frames;for(const entry of (addresses||[]).slice(0,64)){if(!/^0x[0-9a-f]{1,16}$/i.test(entry.offset))continue;let file;try{file=await this.tools.executable(entry.path);}catch{continue;}const r=await capture(this.tools.tools.addr2line,['-f','-C','-e',file,entry.offset],{env:this.tools.env(),timeout:5000});const lines=r.text.trim().split('\n'),loc=/^(.*):(\d+)(?: \(discriminator \d+\))?$/.exec(lines[1]||'');if(loc&&Number(loc[2]))frames.push({func:lines[0],path:loc[1],line:Number(loc[2]),level:entry.level});}return frames;}
  validateArgv(argv){if(!Array.isArray(argv)||!argv.length||argv.length>256||argv.some(v=>typeof v!=='string'||v.includes('\0')))throw Error('Invalid command argv');}
  async buildCustom(d){const tools=this.tools,options=d.options||{};if(tools.building||tools.execution||tools.gdb||tools.dap)throw Error('Stop the current process first');const context=await tools.executionContext({cwd:path.resolve(this.ws.root,options.workingDirectory||'.'),environment:options.environment||{}});if(!Array.isArray(options.buildCommands)||options.buildCommands.length>256)throw Error('Invalid build commands');for(const argv of options.buildCommands)this.validateArgv(argv);tools.cancelled=false;let code=0;for(const argv of options.buildCommands){code=await tools.buildCommand(argv[0],argv.slice(1),d.id,context);if(code)break;}return{code,id:d.id,exists:false,executable:''};}
  async runCommand(d){const options=d.options||{},argv=options.runCommand;this.validateArgv(argv);const tools=this.tools;if(tools.execution)throw Error('Stop the current program first');const context=await tools.executionContext({cwd:path.resolve(this.ws.root,options.workingDirectory||'.'),environment:options.environment||{}});const child=tools.track(require('./tooling.cjs').launch(argv[0],[...argv.slice(1),...options.args||[]],{cwd:context.cwd,env:{...tools.env(),...context.environment},detached:process.platform!=='win32'}));tools.execution=child;tools.output(child,d.id,'stdout',child.stdout);tools.output(child,d.id,'stderr',child.stderr);child.stdin.on('error',()=>{});child.once('close',(code,signal)=>{if(tools.execution===child)tools.execution=null;this.event('exit',{id:d.id,code:code??128,signal});});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});return{id:d.id};}
  async close(){this.pythonRuntimes.cancel();await Promise.allSettled([...this.pythonRuntimes.jobs.values()]);this.pythonStyle.stop();this.pythonIntelligence.stop();await this.python.stop();await this.ws.persist();await this.tools.close();}
}
module.exports={DesktopHost,STYLE};
