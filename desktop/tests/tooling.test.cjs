const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {DesktopHost}=require('../host.cjs');
const {LspFrames}=require('../tooling.cjs');
const {RuntimeFaultParser}=require('../../app/src/main/assets/ui/runtime-errors.js');
const context=vm.createContext({});vm.runInContext(require('node:fs').readFileSync(path.join(__dirname,'../../app/src/main/assets/ui/debugger.js'),'utf8')+';globalThis.parse=parseMI;',context);
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cpp-studio-tools-')),events=[],listeners=new Set();const host=await new DesktopHost(dir,(type,data)=>{events.push({type,data});for(const fn of listeners)fn(type,data);}).init();
  t.after(async()=>{await host.close();await new Promise(resolve=>setTimeout(resolve,700));await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:200});});
  const wait=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{const old=events.find(e=>e.type===type&&predicate(e.data));if(old)return resolve(old.data);const timer=setTimeout(()=>{listeners.delete(fn);reject(Error('Timed out waiting '+type+'\n'+JSON.stringify(events.slice(-20))));},20000);const fn=(kind,data)=>{if(kind===type&&predicate(data)){clearTimeout(timer);listeners.delete(fn);resolve(data);}};listeners.add(fn);});
  return{host,events,listeners,wait};
}
test('LSP framing handles UTF-8, partial headers and multiple frames',()=>{
  const messages=[{jsonrpc:'2.0',method:'test',params:{text:'Привет'}},{id:2,result:[1,2]}],stream=Buffer.concat(messages.map(m=>{const body=Buffer.from(JSON.stringify(m));return Buffer.concat([Buffer.from('Content-Length: '+body.length+'\r\n\r\n'),body]);}));
  for(let size=1;size<stream.length;size++){const result=[],parser=new LspFrames(m=>result.push(m));for(let i=0;i<stream.length;i+=size)parser.feed(stream.subarray(i,i+size));assert.deepEqual(result,messages);}
  assert.throws(()=>new LspFrames(()=>{}).feed(Buffer.from('Content-Length: 999999999\r\n\r\n')),/Invalid LSP/);
});
test('real GCC executable uses project cwd, supports stdin and exact return codes',{timeout:45000},async t=>{
  const {host,events,wait}=await fixture(t);if(!host.tools.tools.gxx)return t.skip('GCC is unavailable');const file=path.join(host.ws.root,'main.cpp');
  await host.handle('write',{path:file,text:'#include <iostream>\n#include <fstream>\nint main(){int x;std::cin>>x;std::ifstream f("data.txt");int y=0;f>>y;std::cout<<x+y<<"\\n";return 139;}\n'});await host.handle('newFile',{path:'data.txt',text:'35'});
  const result=await host.handle('build',{path:file,mode:'file',options:{compiler:'gcc',optimization:'debug'},id:'build'});assert.equal(result.code,0,JSON.stringify(events));
  await host.handle('run',{executable:result.executable,args:[],id:'run'});await host.handle('stdin',{text:'7\n'});const exit=await wait('exit',e=>e.id==='run');assert.equal(exit.code,139);
  const text=events.filter(e=>e.type==='output'&&e.data.id==='run').map(e=>e.data.text).join('');assert.match(text,/42/);const parser=new RuntimeFaultParser();parser.feed(text);parser.flush();assert.equal(parser.fault,null);
});
test('real GDB pauses on crash and finds project stack/structured local values',{timeout:60000},async t=>{
  const {host,events,listeners,wait}=await fixture(t);if(!host.tools.tools.gxx||!host.tools.tools.gdb||!host.tools.tools.gdbserver)return t.skip('GCC/GDB/gdbserver unavailable');const file=path.join(host.ws.root,'main.cpp');
  await host.handle('write',{path:file,text:'struct Node { int value; };\nint main(){Node item{42}; volatile int* ptr=nullptr; *ptr=item.value; return 0;}\n'});
  const result=await host.handle('build',{path:file,mode:'file',options:{compiler:'gcc',optimization:'debug'},id:'build'});assert.equal(result.code,0,JSON.stringify(events));
  const info=await host.handle('gdbStart',{executable:result.executable,args:[],id:'debug'});let seq=0;
  const command=async text=>{const id=++seq;await host.handle('gdbSend',{command:id+text});const response=await wait('gdb',e=>new RegExp('^'+id+'\\^').test(e.line));assert.ok(!response.line.includes('^error'),response.line);const at=response.line.indexOf(',');return at<0?{}:JSON.parse(JSON.stringify(context.parse(response.line.slice(at+1))));};
  await command('-gdb-set mi-async on');await command('-file-exec-and-symbols '+JSON.stringify(result.executable));await command('-interpreter-exec console "handle SIGSEGV stop print pass"');await command('-target-select remote '+info.remote);
  await command('-exec-continue');const stopped=await wait('gdb',e=>e.line.startsWith('*stopped,reason="signal-received"'));assert.match(stopped.line,/SIGSEGV/);
  const stack=await command('-stack-list-frames 0 20'),frames=(stack.stack||[]).map(x=>x.frame||x),frame=frames.find(f=>f.func==='main');assert.ok(frame,JSON.stringify(stack));assert.equal(Number(frame.line),2);
  await command('-stack-select-frame '+frame.level);const value=await command('-data-evaluate-expression "item.value"');assert.equal(value.value,'42');
  await host.handle('gdbStop');
});
test('real stdlib assertion becomes a diagnostic with sanitizers disabled',{timeout:45000},async t=>{
  const {host,events,wait}=await fixture(t);if(!host.tools.tools.gxx)return t.skip('GCC unavailable');const file=path.join(host.ws.root,'main.cpp');await host.handle('write',{path:file,text:'#include <vector>\nint main(){std::vector<int> v{1};return v[9];}\n'});
  const result=await host.handle('build',{path:file,mode:'file',options:{compiler:'gcc',optimization:'debug',runtimeChecks:'assertions'},id:'build'});assert.equal(result.code,0,JSON.stringify(events));
  // GDB intercepts SIGABRT before the OS can display a crash dialog on Windows.
  if(process.platform==='win32'){await host.handle('gdbStart',{executable:result.executable,id:'assert-debug'}).then(async info=>{let seq=0;const cmd=async text=>{const id=++seq;await host.handle('gdbSend',{command:id+text});return wait('gdb',e=>e.line.startsWith(id+'^'));};await cmd('-gdb-set breakpoint pending on');await cmd('-file-exec-and-symbols '+JSON.stringify(result.executable));await cmd('-break-insert -f abort');await cmd('-target-select remote '+info.remote);await cmd('-exec-continue');await wait('gdb',e=>/^\*stopped,reason="(?:signal-received|breakpoint-hit)"/.test(e.line));const response=await cmd('-stack-list-frames 0 24');const stack=JSON.parse(JSON.stringify(context.parse(response.line.slice(response.line.indexOf(',')+1))));const frames=(stack.stack||[]).map(x=>x.frame||x);assert.ok(frames.some(f=>/assert|vector/.test(f.func||'')),JSON.stringify(stack));const parser=new RuntimeFaultParser();parser.stopped({'signal-name':'SIGABRT'},frames);assert.ok(frames.some(f=>f.func==='main'&&f.fullname),JSON.stringify(frames));await cmd('-exec-continue');await wait('output',e=>e.id==='assert-debug'&&/Assertion/.test(e.text));await host.handle('gdbStop');});}
  else{await host.handle('run',{executable:result.executable,id:'assert-run'});await wait('exit',e=>e.id==='assert-run');}
  const p=new RuntimeFaultParser();for(const e of events)if(e.type==='output'&&e.data.stream==='stderr')p.feed(e.data.text);p.flush();assert.equal(p.fault?.kind,'assertion',p.report());
});

test('real CMake build runs with data from project root',{timeout:60000},async t=>{
  const {host,events,wait}=await fixture(t);if(!host.tools.tools.cmake||!host.tools.tools.gxx&&!host.tools.tools.clangxx)return t.skip('CMake/compiler unavailable');
  const file=path.join(host.ws.root,'main.cpp');await host.handle('write',{path:file,text:'#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("project-data.txt");int x=0;f>>x;std::cout<<x<<"\\n";return x==42?0:1;}\n'});await host.handle('newFile',{path:'project-data.txt',text:'42'});
  const result=await host.handle('build',{mode:'cmake',options:{compiler:host.tools.tools.gxx?'gcc':'clang',optimization:'debug',target:'app'},id:'cmake-build'});assert.equal(result.code,0,JSON.stringify(events.filter(e=>e.type==='output')));
  await host.handle('run',{executable:result.executable,id:'cmake-run'});assert.equal((await wait('exit',e=>e.id==='cmake-run')).code,0);assert.match(events.filter(e=>e.type==='output'&&e.data.id==='cmake-run').map(e=>e.data.text).join(''),/42/);
});

test('real LLDB DAP pauses, expands a structure and preserves crash stack',{timeout:60000},async t=>{
  const {host,events,wait}=await fixture(t);if(!host.tools.tools.lldbdap||!host.tools.tools.gxx&&!host.tools.tools.clangxx){assert.notEqual(process.env.CPP_STUDIO_REQUIRE_LLDB,'1','CI requires an actual LLDB DAP executable');return t.skip('LLDB DAP is supported on macOS/Linux; Windows uses GDB');}const file=path.join(host.ws.root,'main.cpp');
  await host.handle('write',{path:file,text:'struct Node { int value; };\nint main(){\n Node item{42};\n volatile int* ptr=nullptr;\n *ptr=item.value;\n return 0;\n}\n'});
  const result=await host.handle('build',{path:file,mode:'file',options:{compiler:host.tools.tools.gxx?'gcc':'clang',optimization:'debug'},id:'dap-build'});assert.equal(result.code,0,JSON.stringify(events));
  await host.handle('dapStart',{executable:result.executable,id:'dap-debug'});let seq=0;
  const request=async(command,args={})=>{const id=++seq;await host.handle('dapSend',{message:{seq:id,type:'request',command,arguments:args}});const response=(await wait('dap',e=>e.message.type==='response'&&e.message.request_seq===id)).message;assert.ok(response.success,JSON.stringify(response));return response.body||{};};
  await request('initialize',{adapterID:'lldb',linesStartAt1:true,columnsStartAt1:true,pathFormat:'path',supportsVariablePaging:true,supportsRunInTerminalRequest:true});
  const launched=request('launch',{program:result.executable,cwd:host.ws.root,args:[],stopOnEntry:true,runInTerminal:true});launched.catch(()=>{});await wait('dap',e=>e.message.event==='initialized');await request('setBreakpoints',{source:{path:file},breakpoints:[{line:5}]});await request('configurationDone');await launched;
  const entry=(await wait('dap',e=>e.message.event==='stopped')).message.body;await request('continue',{threadId:entry.threadId});
  const pause=(await wait('dap',e=>e.message.event==='stopped'&&e.message.body.reason==='breakpoint')).message.body;const stack=await request('stackTrace',{threadId:pause.threadId});const frame=stack.stackFrames.find(f=>f.name.includes('main'));assert.ok(frame);assert.equal(frame.line,5);
  assert.equal((await request('evaluate',{expression:'item.value',frameId:frame.id,context:'watch'})).result,'42');
  const scopes=await request('scopes',{frameId:frame.id}),scope=scopes.scopes.find(s=>!s.expensive),variables=await request('variables',{variablesReference:scope.variablesReference});const item=variables.variables.find(v=>v.name==='item');assert.ok(item?.variablesReference>0,JSON.stringify(variables));const members=await request('variables',{variablesReference:item.variablesReference});assert.ok(members.variables.some(v=>v.name==='value'&&v.value==='42'));
  await request('continue',{threadId:pause.threadId});const crash=(await wait('dap',e=>e.message.event==='stopped'&&e.message.body.reason==='exception')).message.body;assert.ok((await request('stackTrace',{threadId:crash.threadId})).stackFrames.some(f=>f.name.includes('main')&&f.line===5));
  await request('disconnect',{terminateDebuggee:true});await host.handle('dapStop');
});
