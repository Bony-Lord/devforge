const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({GdbClient:class{},onNative:()=>{},tr:x=>x});vm.runInContext(fs.readFileSync('app/src/main/assets/ui/debugger-dap.js','utf8')+';globalThis.Client=DapClient;',context);
test('LLDB variable tree preserves expressions, nested references and source-frame selection',async()=>{
  const client=new context.Client({});client.frames=[{id:91},{id:105}];const requests=[];client.request=async(command,args)=>{requests.push({command,args});if(command==='evaluate')return{result:'{value = 42}',type:'Node',variablesReference:20,namedVariables:1};if(command==='variables')return{variables:[{name:'value',value:'42',type:'int',variablesReference:0,evaluateName:'item.value'}]};return{};};
  await client.command('-stack-select-frame 1');assert.equal(client.selectedFrameId,105);
  const root=await client.command('-var-create - * "item"');assert.equal(root.type,'Node');assert.equal(root.numchild,'1');assert.equal(requests[0].args.expression,'item');
  const children=await client.command('-var-list-children --all-values '+JSON.stringify(root.name)+' 0 50');assert.equal(children.children[0].child.value,'42');
  const expression=await client.command('-var-info-path-expression '+JSON.stringify(children.children[0].child.name));assert.equal(expression.path_expr,'item.value');
  await client.command('-var-delete '+JSON.stringify(root.name));assert.equal(client.objects.has(root.name),false);
});
