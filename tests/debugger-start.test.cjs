const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const commands=[],context=vm.createContext({Date,Map,Promise,RuntimeWarnings:{begin(){}},onNative(){},$:()=>({textContent:''}),native:async op=>{assert.equal(op,'gdbStart');return{executable:'/installed/program-host',arguments:['--direct','/project/main.so']};}});
vm.runInContext(fs.readFileSync('app/src/main/assets/ui/debugger.js','utf8')+';globalThis.Client=GdbClient;',context);
(async()=>{
  const ide={settings:{breakpoints:{'/project/main.cpp':[5]}},state:{root:'/project'},clearOutput(){},showPanel(){},appendOutput(){}};
  const client=new context.Client(ide);client.renderControls=()=>{};
  client.command=async command=>{commands.push(command);if(command.startsWith('-break-insert')){assert.match(command,/^-break-insert -f /,'Symbols are unavailable until the user shared program loads');return{bkpt:{number:'1'}};}return{};};
  await client.start('/project/main.so',['argument']);
  assert.ok(commands.includes('-break-insert -f -t main'));
  assert.ok(commands.includes('-break-insert -f "/project/main.cpp:5"'));
  assert.ok(commands.includes('-exec-arguments "--direct" "/project/main.so" "argument"'));
  assert.equal(commands.at(-1),'-exec-run');assert.equal(client.active,true);
  console.log('Hosted debugger resolves pending main and user breakpoints after loading program symbols');
})().catch(error=>{console.error(error);process.exitCode=1;});
