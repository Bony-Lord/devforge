'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
class NativeDebugger {
 constructor(host,parse){this.host=host;this.parse=parse;this.requests=new Map();this.sequence=0;this.active=false;this.variables=[];this.references=new Set();this.phase='closed';}
 command(command){if(!this.active)return Promise.reject(Error('Отладчик не запущен'));const id=String(++this.sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(id);reject(Error('GDB timeout: '+command));},20000);this.requests.set(id,{resolve,reject,timer});this.host.handle('gdbSend',{command:id+command}).catch(error=>{clearTimeout(timer);this.requests.delete(id);reject(error);});});}
 receive(event,data){
  if(event==='gdbExit'){this.active=false;for(const r of this.requests.values()){clearTimeout(r.timer);r.reject(Error('GDB stopped'));}this.requests.clear();return;}
  if(event!=='gdb'||data.session!==this.session)return;const match=/^(\d*)([\^*+=~@&])(.*)$/.exec(data.line);if(!match)return;
  const[,token,kind,body]=match,comma=body.indexOf(','),name=comma<0?body:body.slice(0,comma),value=comma<0?{}:this.parse(body.slice(comma+1));
  if(kind==='^'){const pending=this.requests.get(token);if(pending){clearTimeout(pending.timer);this.requests.delete(token);name==='error'?pending.reject(Error(value.msg||'GDB error')):pending.resolve(value);}}
  else if(kind==='*'&&name==='running'&&this.phase==='starting')this.phase='executing';
  // Remote attach emits an initial stop before our continue-to-main. Publishing
  // it enables step buttons while the inferior is already running again.
  else if(kind==='*'&&name==='stopped'&&this.phase==='executing')this.host.event('nativeDebugStopped',{...value,session:this.session});
 }
 async start(d){
  const info=await this.host.handle('gdbStart',d);this.active=true;this.session=info.session;this.phase='connecting';
  try{
   for(const command of ['-gdb-set mi-async on','-gdb-set pagination off','-gdb-set confirm off','-gdb-set disable-randomization off','-enable-pretty-printing'])await this.command(command).catch(()=>{});
   for(const rule of ['skip -rfu ^std::.*','skip -rfu ^__gnu_cxx::.*','skip -gfi */include/c++/*'])await this.command('-interpreter-exec console '+JSON.stringify(rule)).catch(()=>{});
   const share=path.resolve(path.dirname(this.host.tools.tools.gxx||''),'../share');
   for(const directory of (await fs.readdir(share).catch(()=>[])).filter(n=>n.startsWith('gcc-')).sort().reverse()){const root=path.join(share,directory,'python');try{await fs.access(path.join(root,'libstdcxx/v6/__init__.py'));await this.command('-interpreter-exec console '+JSON.stringify('python import sys;sys.path.insert(0,'+JSON.stringify(root.replaceAll('\\','/'))+');import libstdcxx.v6;libstdcxx.v6.register_libstdcxx_printers(None)'));break;}catch{}}
   await this.command('-gdb-set breakpoint pending on');await this.command('-file-exec-and-symbols '+JSON.stringify(info.executable));
   for(const [file,lines]of Object.entries(d.breakpoints||{}))for(const line of lines)if(Number.isInteger(line)&&line>0)await this.command('-break-insert -f '+JSON.stringify(file+':'+line));
   await this.command('-break-insert -f -t main');await this.command('-target-select remote '+info.remote);this.phase='starting';await this.command('-exec-continue');return info;
  }catch(error){await this.stop();throw error;}
 }
 async snapshot(d={}){
  if(d.frame!==undefined){if(!Number.isInteger(d.frame)||d.frame<0||d.frame>10000)throw Error('Invalid frame');await this.command('-stack-select-frame '+d.frame);}
  for(const variable of this.variables)await this.command('-var-delete '+JSON.stringify(variable)).catch(()=>{});this.variables=[];this.references.clear();
  const stack=await this.command('-stack-list-frames 0 80'),locals=await this.command('-stack-list-variables --all-values'),variables=[];
  for(const variable of (locals.variables||[]).slice(0,200)){
   try{const created=await this.command('-var-create - * '+JSON.stringify(variable.name));this.variables.push(created.name);this.references.add(created.name);variables.push({name:variable.name,value:created.value??variable.value,type:created.type||'',reference:created.name,children:Number(created.numchild)||created.dynamic==='1'});}
   catch{variables.push({name:variable.name,value:variable.value||'<недоступно>',type:'',reference:'',children:0});}
  }
  return{frames:(stack.stack||[]).map(e=>e.frame||e),variables};
 }
 async children(d){if(typeof d.reference!=='string'||!this.references.has(d.reference))throw Error('Переменная устарела; обновите список');const data=await this.command('-var-list-children --all-values '+JSON.stringify(d.reference)+' 0 100');return(data.children||[]).map(e=>e.child||e).map(c=>{this.references.add(c.name);return{name:c.exp,value:c.value||'',type:c.type||'',reference:c.name,children:Number(c.numchild)||c.dynamic==='1'};});}
 async stop(){this.phase='closed';await this.host.handle('gdbStop');this.active=false;this.references.clear();for(const r of this.requests.values()){clearTimeout(r.timer);r.reject(Error('GDB stopped'));}this.requests.clear();return true;}
}
module.exports={NativeDebugger};
