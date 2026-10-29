'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {portable,inside,canonical,exists,atomic}=require('./workspace.cjs');
const isWindows=process.platform==='win32';
function launch(exe,args,options={}){return cp.spawn(exe,args,{windowsHide:true,shell:false,stdio:'pipe',...options});}
function capture(exe,args,options={}){
  const {input='',timeout=30000,...spawnOptions}=options;
  return new Promise((resolve,reject)=>{
    const child=launch(exe,args,spawnOptions),out=[],err=[];let size=0,errorSize=0;
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(path.basename(exe)+' timed out'));},timeout);timer.unref();
    child.stdout.on('data',b=>{if(size<4*1024*1024)out.push(b.subarray(0,4*1024*1024-size));size+=b.length;});
    child.stderr.on('data',b=>{if(errorSize<65536)err.push(b.subarray(0,65536-errorSize));errorSize+=b.length;});
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code:code??128,text:Buffer.concat(out).toString(),error:Buffer.concat(err).toString(),signal});});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
class LspFrames {
  constructor(onMessage){this.buffer=Buffer.alloc(0);this.onMessage=onMessage;}
  feed(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);
    for(;;){const at=this.buffer.indexOf('\r\n\r\n');if(at<0){if(this.buffer.length>8192)throw Error('LSP header too large');return;}
      const match=/content-length:\s*(\d+)/i.exec(this.buffer.subarray(0,at).toString('ascii')),length=Number(match?.[1]);
      if(!length||length>16*1024*1024)throw Error('Invalid LSP frame');if(this.buffer.length<at+4+length)return;
      const message=JSON.parse(this.buffer.subarray(at+4,at+4+length).toString());this.buffer=this.buffer.subarray(at+4+length);this.onMessage(message);
    }
  }
}
async function findTool(name,overrides={}){
  if(overrides[name]){const file=await canonical(overrides[name]);if(await exists(file))return file;throw Error('Tool unavailable: '+file);}
  const names={python:process.platform==='win32'?['python','python3']:['python3','python'],gcc:process.platform==='darwin'?['gcc-16','gcc-15','gcc-14','gcc']:['gcc'],gxx:process.platform==='darwin'?['g++-16','g++-15','g++-14','g++']:['g++'],clang:['clang'],clangxx:['clang++'],cmake:['cmake'],ninja:['ninja'],gdb:['gdb'],gdbserver:['gdbserver'],git:['git'],clangd:['clangd'],format:['clang-format'],symbolizer:['llvm-symbolizer'],lldbdap:['lldb-dap','lldb-dap-23','lldb-dap-22','lldb-dap-21','lldb-dap-20','lldb-dap-19','lldb-vscode','lldb-vscode-18','lldb-vscode-17'],addr2line:['addr2line','llvm-addr2line']}[name]||[name];
  const folders=[...(process.env.PATH||'').split(path.delimiter),...(isWindows?['C:/msys64/mingw64/bin','C:/msys64/ucrt64/bin','C:/Program Files/CMake/bin','C:/Program Files/LLVM/bin','C:/Program Files/Git/cmd',...['bin/mingw/bin','bin/cmake/win/x64/bin','bin/ninja/win/x64','bin/clang/win/x64/bin','plugins/clion-radler/DotFiles/windows-x64'].map(p=>path.join(process.env.LOCALAPPDATA||'', 'Programs/CLion',p))]:['/usr/bin','/usr/local/bin','/opt/homebrew/bin','/opt/homebrew/opt/llvm/bin','/usr/local/opt/llvm/bin','/opt/homebrew/opt/llvm/libexec/bin','/usr/local/opt/llvm/libexec/bin','/opt/homebrew/opt/lldb/bin','/usr/local/opt/lldb/bin'])];
  for(const folder of folders.filter(Boolean))for(const tool of names){const file=path.join(folder,tool+(isWindows?'.exe':''));if(await exists(file))return portable(await fs.realpath(file));}return null;
}
class Tooling {
  constructor(workspace,event){this.ws=workspace;this.event=event;this.tools={};this.profiles=new Map();this.sanitizerProbes=new Map();this.children=new Set();this.lsp=null;this.execution=null;this.building=null;this.gdb=null;this.server=null;this.cancelled=false;}
  async discover(){for(const name of ['gcc','gxx','clang','clangxx','clangd','format','cmake','ninja','gdb','gdbserver','git','symbolizer','lldbdap','addr2line','python'])this.tools[name]=await findTool(name,this.ws.prefs.settings.toolPaths);if(isWindows)this.tools.lldbdap=null;if(process.platform==='darwin'&&!this.tools.lldbdap){const found=await capture('/usr/bin/xcrun',['--find','lldb-dap'],{timeout:5000});if(!found.code&&await exists(found.text.trim()))this.tools.lldbdap=portable(found.text.trim());}if(process.platform==='darwin'&&this.tools.gcc&&!this.ws.prefs.settings.toolPaths?.gcc){const version=await capture(this.tools.gcc,['--version'],{timeout:5000});if(/clang/i.test(version.text)){this.tools.gcc=null;this.tools.gxx=null;}}if(!this.tools.python){try{for(const name of (await fs.readdir(path.join(this.ws.data,'python-runtimes'))).filter(n=>/^python-\d+\.\d+\.\d+$/.test(n)).sort().reverse()){const exe=path.join(this.ws.data,'python-runtimes',name,'python',isWindows?'python.exe':'bin/python3');if(await exists(exe)){this.tools.python=portable(exe);break;}}}catch{}}const roots=new Set();for(const tool of Object.values(this.tools))if(tool)for(const subdir of ['include','lib','lib64','libexec']){const dir=portable(path.resolve(path.dirname(tool),'..',subdir));if(await exists(dir))roots.add(dir);}if(!isWindows)for(const dir of ['/usr/include','/usr/local/include','/Library/Developer/CommandLineTools/SDKs','/Applications/Xcode.app'])if(await exists(dir))roots.add(dir);this.ws.readRoots=[...roots];return this.tools;}
  env(){const folders=[...new Set(Object.values(this.tools).filter(Boolean).map(p=>path.dirname(p)))];return {...process.env,PATH:[...folders,process.env.PATH||''].join(path.delimiter),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TERM:'dumb',GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat'};}
  tool(name){const tool=this.tools[name];if(!tool)throw Error('Install '+({gxx:'GCC C++',format:'clang-format',clangxx:'Clang C++'}[name]||name)+' or select its path in Settings → Tools.');return tool;}
  compiler(options,c=false){return this.tool(options.compiler==='clang'?(c?'clang':'clangxx'):(c?'gcc':'gxx'));}
  standard(options,c){const s=options[c?'cStandard':'cppStandard']||(c?'c17':'c++20');if(!/^(?:(?:gnu\+\+|c\+\+)(?:98|03|11|14|17|20|23|26)|(?:gnu|c)(?:89|90|99|11|17|23|2x))$/.test(s))throw Error('Unknown language standard');return s;}
  flags(options,c=false,analysis=false){
    const debug=options.optimization!=='release',checks=options.runtimeChecks==='off'?'none':options.debugSession&&options.runtimeChecks==='address'?'sanitizers':options.debugSession&&options.runtimeChecks==='undefined'?'undefined':options.runtimeChecks||'assertions',args=['-std='+this.standard(options,c),'-Wall','-Wextra','-Wpedantic','-Wshadow','-Wunused','-I'+this.ws.root];
    if(!analysis)args.push(debug?'-O0':'-O2','-g','-fdiagnostics-color=never');
    if(debug){args.push('-fno-omit-frame-pointer');if(checks!=='none'&&!c)args.push('-D_GLIBCXX_ASSERTIONS=1','-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG');if(checks==='undefined'&&options.debugSession)args.push('-fsanitize=undefined','-fsanitize-recover=undefined');if(checks==='sanitizers')args.push('-fsanitize=address,undefined','-fno-sanitize-recover=all');}
    if(!Array.isArray(options.flags||[]))throw Error('Compiler flags must be an array');for(const flag of (options.flags||[]).slice(0,100)){if(typeof flag!=='string'||flag.includes('\0'))throw Error('Invalid compiler flag');if(flag)args.push(flag);}return args;
  }
  async standardLibraries(options,c=false){
    if(!isWindows||c||options.compiler==='clang'||options.linkExperimentalLibrary===false||!/(?:23|26|2b|2c)$/.test(this.standard(options)))return[];
    this.libraryCache??=new Map();const compiler=this.compiler(options,false);if(!this.libraryCache.has(compiler)){const result=await capture(compiler,['-print-file-name=libstdc++exp.a'],{cwd:this.ws.root,env:this.env(),timeout:5000}),library=result.text.trim();this.libraryCache.set(compiler,!result.code&&path.isAbsolute(library)&&await exists(library));}return this.libraryCache.get(compiler)?['-lstdc++exp']:[];
  }
  async verifySanitizers(options){
    if(options.optimization==='release'||!(options.runtimeChecks==='sanitizers'||options.runtimeChecks==='address'&&options.debugSession))return;
    const compiler=this.compiler(options),key=compiler;
    if(this.sanitizerProbes.has(key)){const error=this.sanitizerProbes.get(key);if(error)throw Error(error);return;}
    const folder=path.join(this.ws.cache,'probe');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'probe.cpp'),out=path.join(folder,isWindows?'probe.exe':'probe');
    try{await fs.writeFile(file,'int main(){return 0;}\n');const r=await capture(compiler,['-fsanitize=address,undefined','-fno-sanitize-recover=all',file,'-o',out],{cwd:this.ws.root,env:this.env()});
      if(r.code)throw Error(r.error||r.text);const run=await capture(out,[],{cwd:this.ws.root,env:this.env()});if(run.code)throw Error(run.error||'Sanitizer runtime could not start');this.sanitizerProbes.set(key,'');
    }catch(e){const error='ASan/UBSan are unavailable in this compiler/runtime. Select another compiler or standard library checks.\n'+e.message;this.sanitizerProbes.set(key,error);throw Error(error);}finally{await fs.rm(file,{force:true});await fs.rm(out,{force:true});}
  }
  track(child){this.children.add(child);child.once('close',()=>this.children.delete(child));child.on('error',()=>{});return child;}
  output(child,id,stream,source){
    const decoder=new StringDecoder('utf8');let total=0;
    const send=text=>{if(!text)return;const before=total;total+=text.length;if(before<2*1024*1024)this.event('output',{id,stream,text:text.slice(0,2*1024*1024-before)});else if(before===2*1024*1024)this.event('output',{id,stream,text:'\n[Output limited to 2 MB]\n'});};
    source.on('data',chunk=>send(decoder.write(chunk)));source.on('end',()=>send(decoder.end()));
  }
  async buildCommand(exe,args,id,context={}){
    if(this.cancelled)return 130;this.event('output',{id,stream:'command',text:[exe,...args].map(a=>/\s/.test(a)?JSON.stringify(a):a).join(' ')+'\n'});
    const child=this.track(launch(exe,args,{cwd:context.cwd||this.ws.root,env:{...this.env(),...this.buildEnvironment,...context.environment},detached:!isWindows}));this.building=child;this.output(child,id,'build',child.stdout);this.output(child,id,'build',child.stderr);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.terminate(child);reject(Error('Build exceeded 180 seconds'));},180000);timer.unref();child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);if(this.building===child)this.building=null;resolve(this.cancelled?130:code??128);});});
  }
  async sources(){const files=[],walk=async dir=>{for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink()||['.forge','build','.git','node_modules'].includes(e.name))continue;const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else if(/\.(c|cc|cpp|cxx|C)$/.test(e.name))files.push(portable(file));if(files.length>1000)throw Error('More than 1000 source files');}};await walk(this.ws.root);return files;}
  async cmakeDir(options){if(options.buildDirectory){const requested=options.buildDirectory;if(typeof requested!=='string'||path.isAbsolute(requested)||requested.split(/[\\/]/).includes('..'))throw Error('Build directory must be inside the project');const folder=await canonical(path.resolve(this.ws.root,requested)),root=await canonical(this.ws.root);if(folder===root||!inside(folder,root))throw Error('Build directory must be inside the project');return folder;}const profile=options.cmakeProfile;if(profile&&!/^[A-Za-z0-9_-]{1,64}$/.test(profile))throw Error('Invalid CMake profile');return path.join(this.ws.root,'build',profile||((options.optimization==='release')?'release':'debug'));}
  async cmakeModel(options={}){
    const folder=await this.cmakeDir(options),reply=path.join(folder,'.cmake/api/v1/reply'),result={configured:false,files:[],targets:[],time:0};
    const db=path.join(folder,'compile_commands.json');if(await exists(db)){const entries=JSON.parse(await fs.readFile(db,'utf8'));result.files=await Promise.all(entries.map(e=>canonical(path.isAbsolute(e.file)?e.file:path.resolve(e.directory,e.file))));result.configured=true;result.time=(await fs.stat(db)).mtimeMs;}
    if(!await exists(reply))return result;
    const index=(await fs.readdir(reply)).filter(n=>/^index-.*\.json$/.test(n)).sort().at(-1);if(!index)return result;
    const read=async name=>{if(path.basename(name)!==name)throw Error('Invalid CMake reply reference');const file=path.join(reply,name);if((await fs.stat(file)).size>16*1024*1024)throw Error('CMake reply too large');return JSON.parse(await fs.readFile(file,'utf8'));};
    const metadata=await read(index),reference=metadata.objects?.find(o=>o.kind==='codemodel'&&o.version.major===2);if(!reference)return result;
    const model=await read(reference.jsonFile),config=model.configurations.find(c=>c.name===(options.cmakeBuildType||'Debug'))||model.configurations[0];
    for(const entry of config?.targets||[]){const target=await read(entry.jsonFile);const artifacts=await Promise.all((target.artifacts||[]).map(a=>canonical(path.resolve(model.paths.build,a.path))));result.targets.push({name:target.name,type:target.type,artifacts});for(const source of target.sources||[])result.files.push(await canonical(path.resolve(model.paths.source,source.path)));}
    result.files=[...new Set(result.files)];result.configured=true;return result;
  }
  async build(d){
    if(this.building||this.execution||this.gdb||this.dap)throw Error('Stop the current process first');this.cancelled=false;const options={...this.ws.prefs.settings,...d.options};this.buildEnvironment=options.buildEnvironment||{};await this.verifySanitizers(options);await fs.mkdir(this.ws.cache,{recursive:true});
    let output,code;
    if(d.mode==='cmake'){
      this.tool('ninja');
      const folder=await this.cmakeDir(options),standard=c=>this.standard(options,c).replace('03','98').replace('89','90').replace('2x','23').replace(/\D/g,'');
      await fs.mkdir(path.join(folder,'.cmake/api/v1/query/client-cpp-studio'),{recursive:true});await fs.writeFile(path.join(folder,'.cmake/api/v1/query/client-cpp-studio/codemodel-v2'),'');
      const args=['-S',this.ws.root,'-B',folder,'-G','Ninja','-DCMAKE_MAKE_PROGRAM='+this.tool('ninja'),
        '-DCMAKE_C_COMPILER='+this.compiler(options,true),'-DCMAKE_CXX_COMPILER='+this.compiler(options),'-DCMAKE_BUILD_TYPE='+(options.cmakeBuildType||(options.optimization==='release'?'Release':'Debug')),'-DCMAKE_EXPORT_COMPILE_COMMANDS=ON','-DCMAKE_C_STANDARD='+standard(true),'-DCMAKE_CXX_STANDARD='+standard(false),
        '-DCMAKE_C_EXTENSIONS='+(this.standard(options,true).startsWith('gnu')?'ON':'OFF'),'-DCMAKE_CXX_EXTENSIONS='+(this.standard(options,false).startsWith('gnu')?'ON':'OFF'),
        '-DCMAKE_C_FLAGS='+this.flags(options,true).map(flag=>quoteFlag(flag).replaceAll('$',()=> '$$')).join(' '),'-DCMAKE_CXX_FLAGS='+this.flags(options).map(flag=>quoteFlag(flag).replaceAll('$',()=> '$$')).join(' ')];
      const extra=options.cmakeOptions||[];if(!Array.isArray(extra)||extra.length>100||extra.some(x=>typeof x!=='string'||!x.startsWith('-D')||x.includes('\0')))throw Error('CMake options must be -DNAME=value arguments');args.push(...extra);
      code=await this.buildCommand(this.tool('cmake'),args,d.id);if(code)return{code,id:d.id,configured:false};
      const libraries=await this.standardLibraries(options),explicitLibraries=extra.some(f=>f.startsWith('-DCMAKE_CXX_STANDARD_LIBRARIES'));
      if(libraries.length&&!explicitLibraries){const cache=await fs.readFile(path.join(folder,'CMakeCache.txt'),'utf8'),previous=cache.match(/^CMAKE_CXX_STANDARD_LIBRARIES:[^=]*=(.*)$/m)?.[1]||'';if(!previous.includes('-lstdc++exp')){code=await this.buildCommand(this.tool('cmake'),[...args,'-DCMAKE_CXX_STANDARD_LIBRARIES='+[previous,...libraries].filter(Boolean).join(' ')],d.id);if(code)return{code,id:d.id,configured:false};}}
      const model=await this.cmakeModel(options);if(d.configureOnly)return{code,id:d.id,configured:true,targets:model.targets};
      const selected=model.targets.find(t=>t.name===options.target)||(!options.target||options.target==='app'?model.targets.find(t=>t.type==='EXECUTABLE'):null);if(!selected)throw Error(options.target?'CMake target unavailable: '+options.target:'CMake has no executable target. Configure a run target.');
      code=await this.buildCommand(this.tool('cmake'),['--build',folder,'--config',options.cmakeBuildType||(options.optimization==='release'?'Release':'Debug'),'--target',selected.name,'--parallel','2'],d.id);output=selected.type==='EXECUTABLE'?selected.artifacts[0]:null;
      if(output&&!inside(output,await canonical(folder))&&!inside(output,await canonical(this.ws.root)))throw Error('Executable outside project/build directory');
    }else{
      const file=await this.ws.writable(d.path),c=file.endsWith('.c');output=path.join(await this.cmakeDir(options),isWindows?'program.exe':'program');await fs.mkdir(path.dirname(output),{recursive:true});
      code=await this.buildCommand(this.compiler(options,c),[...this.flags(options,c),...d.mode==='project'?await this.sources():[file],'-o',output,...await this.standardLibraries(options,c)],d.id);
    }
    if(!code&&output&&await exists(output)){
      const profile={sanitizers:options.optimization!=='release'&&(options.runtimeChecks==='sanitizers'||options.runtimeChecks==='address'&&options.debugSession)};this.profiles.set(portable(output),profile);await atomic(output+'.studio-runtime.json',JSON.stringify(profile));
    }
    return {code,id:d.id,executable:output?portable(output):null,exists:!!output&&await exists(output)};
  }
  async profile(executable){if(this.profiles.has(executable))return this.profiles.get(executable);try{const file=executable+'.studio-runtime.json';if((await fs.stat(file)).size<8192)return JSON.parse(await fs.readFile(file,'utf8'));}catch{}return{};}
  async runEnvironment(executable,{debug=false}={}){const env=this.env();if((await this.profile(executable)).sanitizers){env.ASAN_OPTIONS='halt_on_error=1:abort_on_error=1:color=never:symbolize=1'+(debug?':detect_leaks=0':'');env.UBSAN_OPTIONS='halt_on_error=1:print_stacktrace=1:color=never';if(this.tools.symbolizer)env.ASAN_SYMBOLIZER_PATH=this.tools.symbolizer;}return env;}
  async executable(input){const file=await canonical(input);if(!inside(file,await canonical(this.ws.root))&&!inside(file,await canonical(this.ws.cache)))throw Error('Executable outside project');return file;}
  async executionContext(d){const cwd=await canonical(d.cwd||this.ws.root);if(!inside(cwd,await canonical(this.ws.root))||!(await fs.stat(cwd)).isDirectory())throw Error('Working directory must be inside the project');const environment=d.environment||{};if(typeof environment!=='object'||Array.isArray(environment)||Object.entries(environment).some(([k,v])=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)||typeof v!=='string'||v.includes('\0')))throw Error('Invalid runtime environment');return{cwd,environment};}
  async run(d,shell=false){
    if(this.execution||this.gdb||this.dap)throw Error('Stop current process first');
    const file=shell?(isWindows?process.env.ComSpec||'C:/Windows/System32/cmd.exe':'/bin/sh'):await this.executable(d.executable);
    const args=shell?(isWindows?['/d','/s','/c',d.command]:['-c',d.command]):d.args||[];
    const context=await this.executionContext(d);const child=this.track(launch(file,args,{cwd:context.cwd,env:{...shell?this.env():await this.runEnvironment(file),...context.environment},detached:!isWindows}));this.execution=child;
    this.output(child,d.id,'stdout',child.stdout);this.output(child,d.id,'stderr',child.stderr);child.stdin.on('error',()=>{});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.once('close',(code,signal)=>{if(this.execution===child)this.execution=null;if(signal&&!child.studioStopped){const numbers={SIGSEGV:11,SIGABRT:6,SIGBUS:7,SIGFPE:8,SIGILL:4};if(numbers[signal])this.event('output',{id:d.id,stream:'stderr',text:'\n\x1eCPPSTUDIO_FAULT:'+JSON.stringify({kind:'signal',signal:numbers[signal]})+'\n'});}this.event('exit',{id:d.id,code:code??128,signal,stopped:!!child.studioStopped});});return{id:d.id};
  }
  terminate(child){if(!child||child.exitCode!==null)return;child.studioStopped=true;if(isWindows){const killer=launch(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/pid',String(child.pid),'/t','/f']);killer.on('error',()=>child.kill());killer.stdout.resume();killer.stderr.resume();}
    else {try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}},600);timer.unref();}}
  async stop(){this.cancelled=true;this.dap?.stop();await this.stopDebug();this.terminate(this.execution);this.terminate(this.building);}
  async startLsp(options){
    this.stopLsp();await fs.mkdir(this.ws.cache,{recursive:true});const db=path.join(this.ws.cache,'compile_commands.json'),cmakeDb=path.join(await this.cmakeDir(options),'compile_commands.json');
    if(options.buildMode==='cmake'&&await exists(cmakeDb))await fs.copyFile(cmakeDb,db);else await atomic(db,JSON.stringify((await this.sources()).map(file=>({directory:this.ws.root,file,arguments:[this.compiler(options,file.endsWith('.c')),...this.flags(options,file.endsWith('.c'),true),'-c',file]})),null,2));
    // Some IDE distributions ship only clangd.exe, without LLVM resource headers.
    // Keep complete clangd packages unchanged; use the selected compiler's fallback
    // headers only when clangd's own stddef.h cannot be found beside the binary.
    const resourceRoot=path.resolve(path.dirname(this.tool('clangd')),'../lib/clang'),versions=await fs.readdir(resourceRoot).catch(()=>[]);let resources=false;for(const version of versions)if(await exists(path.join(resourceRoot,version,'include/stddef.h')))resources=true;
    if(!resources){const entries=JSON.parse(await fs.readFile(db,'utf8')),headers=new Map();for(const entry of entries){const c=entry.file.endsWith('.c'),compiler=this.compiler(options,c);if(!headers.has(compiler)){const result=await capture(compiler,['-E','-x',c?'c':'c++','-v','-'],{cwd:this.ws.root,env:this.env(),timeout:5000}),block=result.error.split('#include <...> search starts here:')[1]?.split('End of search list.')[0]||'',paths=[];for(const line of block.split(/\r?\n/)){const include=line.trim().replace(/ \(framework directory\)$/,'');if(path.isAbsolute(include)&&await exists(include))paths.push(portable(include));}headers.set(compiler,paths);}for(const include of headers.get(compiler)){if(entry.arguments)entry.arguments.push('-isystem',include);else if(entry.command)entry.command+=' -isystem '+quoteFlag(include);}}await atomic(db,JSON.stringify(entries,null,2));}
    const args=['--background-index','--background-index-priority=low','-j=2','--clang-tidy='+!!options.clangTidy,'--limit-results=100','--completion-style=detailed','--header-insertion=iwyu','--pch-storage=memory','--log=error','--compile-commands-dir='+portable(this.ws.cache),'--query-driver='+[this.tools.gcc,this.tools.gxx,this.tools.clang,this.tools.clangxx].filter(Boolean).join(',')];
    const child=this.track(launch(this.tool('clangd'),args,{cwd:this.ws.root,env:this.env()}));this.lsp=child;const frames=new LspFrames(m=>{if(this.lsp===child)this.event('lsp',m);});
    child.stdout.on('data',chunk=>{try{frames.feed(chunk);}catch(e){child.kill();this.event('lspLog',e.message);}});child.stderr.on('data',b=>this.event('lspLog',b.toString().slice(0,16000)));child.stdin.on('error',()=>{});
    child.once('close',()=>{if(this.lsp===child){this.lsp=null;this.event('lspExit',{error:'clangd stopped'});}});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});return{root:this.ws.root};
  }
  sendLsp(message){if(!this.lsp)throw Error('clangd stopped');const bytes=Buffer.from(JSON.stringify(message));this.lsp.stdin.write('Content-Length: '+bytes.length+'\r\n\r\n');this.lsp.stdin.write(bytes);}
  stopLsp(){const child=this.lsp;this.lsp=null;child?.kill();}
  async startDebug(d){
    if(this.gdb||this.execution)throw Error('Stop current process first');const executable=await this.executable(d.executable),id=d.id;
    // The loopback gdbserver gives the inferior separate stdin/stdout pipes.
    // It also avoids opening a console window on Windows Bluetooth-keyboard setups.
    const context=await this.executionContext(d);const server=this.track(launch(this.tool('gdbserver'),['--once','127.0.0.1:0',executable,...d.args||[]],{cwd:context.cwd,env:{...await this.runEnvironment(executable,{debug:true}),...context.environment},detached:!isWindows}));this.server=server;server.stdin.on('error',()=>{});
    this.output(server,id,'stdout',server.stdout);let tail='';
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.terminate(server);reject(Error('gdbserver startup timed out'));},15000);timer.unref();
      const read=b=>{tail+=b.toString();const match=/Listening on port (\d+)/i.exec(tail);if(match){clearTimeout(timer);server.stderr.off('data',read);if(tail)this.event('output',{id,stream:'debugLog',text:tail});resolve(Number(match[1]));}if(tail.length>65536){clearTimeout(timer);reject(Error('gdbserver could not start'));}};
      server.stderr.on('data',read);server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('close',code=>{clearTimeout(timer);reject(Error('gdbserver stopped: '+code+'\n'+tail));});
    });
    this.output(server,id,'stderr',server.stderr);
    const debuggerProcess=this.track(launch(this.tool('gdb'),['--quiet','--nx','--interpreter=mi2'],{cwd:this.ws.root,env:this.env(),detached:!isWindows}));this.gdb=debuggerProcess;debuggerProcess.stdin.on('error',()=>{});
    let buffer='';const decoder=new StringDecoder('utf8');debuggerProcess.stdout.on('data',b=>{buffer+=decoder.write(b);let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);this.event('gdb',{session:id,line});}if(buffer.length>2*1024*1024){buffer='';this.terminate(debuggerProcess);}});
    this.output(debuggerProcess,id,'debugLog',debuggerProcess.stderr);debuggerProcess.once('close',()=>{if(this.gdb===debuggerProcess){this.gdb=null;this.terminate(server);this.server=null;this.event('gdbExit',{session:id});}});
    await new Promise((resolve,reject)=>{debuggerProcess.once('spawn',resolve);debuggerProcess.once('error',reject);});return{session:id,executable,argumentsApplied:true,remote:'127.0.0.1:'+port};
  }
  sendDebug(command){if(!this.gdb)throw Error('Debugger stopped');if(typeof command!=='string'||/[\r\n]/.test(command)||command.length>65536)throw Error('Invalid GDB command');this.gdb.stdin.write(command+'\n');}
  debugInput(text){if(!this.server)throw Error('Debugger stopped');this.server.stdin.write(text);}
  async stopDebug(){const gdb=this.gdb,server=this.server;this.gdb=null;this.server=null;if(gdb){try{gdb.stdin.write('-gdb-set confirm off\n-interpreter-exec console "kill"\n-gdb-exit\n');}catch{}const timer=setTimeout(()=>this.terminate(gdb),500);timer.unref();}if(server)this.terminate(server);}
  async close(){this.stopLsp();await this.stop();for(const child of this.children)this.terminate(child);}
}
function quoteFlag(flag){
  if(isWindows)return /[\s"]/.test(flag)?'"'+flag.replace(/(\\*)"/g,'$1$1\\"').replace(/\\+$/g,'$&$&')+'"':flag;
  return /^[A-Za-z0-9_./:+,=@%-]+$/.test(flag)?flag:"'"+flag.replaceAll("'","'\\''")+"'";
}
module.exports={Tooling,LspFrames,findTool,capture,launch};
