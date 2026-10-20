'use strict';
const path=require('node:path');
const {LspFrames,launch}=require('./tooling.cjs');
const {inside,canonical}=require('./workspace.cjs');
/** LLDB's DAP transport, including a private piped terminal for program stdin. */
class DebugAdapter {
  constructor(tools,id,executable){this.tools=tools;this.id=id;this.executable=executable;this.child=null;this.terminal=null;this.closed=false;}
  async start(){
    const t=this.tools,child=t.track(launch(t.tool('lldbdap'),[],{cwd:t.ws.root,env:t.env(),detached:process.platform!=='win32'}));this.child=child;
    const frames=new LspFrames(message=>this.receive(message).catch(error=>this.event('output',{category:'stderr',output:error.message+'\n'})));
    child.stdout.on('data',buffer=>{try{frames.feed(buffer);}catch(error){this.event('output',{category:'stderr',output:error.message+'\n'});this.stop();}});
    child.stderr.on('data',buffer=>t.event('output',{id:this.id,stream:'debugLog',text:buffer.toString().slice(0,16000)}));child.stdin.on('error',()=>{});
    child.once('close',()=>{if(!this.closed){this.closed=true;t.terminate(this.terminal);if(t.dap===this)t.dap=null;this.event('terminated',{});}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});return{session:this.id,protocol:'dap',executable:this.executable};
  }
  event(event,body){this.tools.event('dap',{session:this.id,message:{type:'event',event,body}});}
  send(message){if(this.closed||!this.child)throw Error('LLDB stopped');const data=Buffer.from(JSON.stringify(message));this.child.stdin.write('Content-Length: '+data.length+'\r\n\r\n');this.child.stdin.write(data);}
  async receive(message){
    if(message.type==='request'){
      if(message.command!=='runInTerminal'){this.send({seq:0,type:'response',request_seq:message.seq,command:message.command,success:false,message:'Unsupported reverse request'});return;}
      try{
        const args=message.arguments?.args;if(!Array.isArray(args)||!args.length||args.length>1000||args.some(x=>typeof x!=='string'||x.includes('\0')))throw Error('Invalid terminal arguments');
        const launcher=await canonical(args[0]),adapter=await canonical(this.tools.tool('lldbdap'));
        if(launcher!==adapter&&!inside(launcher,path.dirname(adapter))&&launcher!==this.executable)throw Error('Unexpected debug launcher');
        const terminal=this.tools.track(launch(launcher,args.slice(1),{cwd:this.tools.ws.root,env:{...await this.tools.runEnvironment(this.executable,{debug:true}),...message.arguments.env},detached:process.platform!=='win32'}));this.terminal=terminal;terminal.stdin.on('error',()=>{});
        this.tools.output(terminal,this.id,'stdout',terminal.stdout);this.tools.output(terminal,this.id,'stderr',terminal.stderr);
        await new Promise((resolve,reject)=>{terminal.once('spawn',resolve);terminal.once('error',reject);});this.send({seq:0,type:'response',request_seq:message.seq,command:message.command,success:true,body:{processId:terminal.pid}});
      }catch(error){this.send({seq:0,type:'response',request_seq:message.seq,command:message.command,success:false,message:error.message});}
    }else this.tools.event('dap',{session:this.id,message});
  }
  input(text){if(!this.terminal)throw Error('Program terminal is not ready');this.terminal.stdin.write(text);}
  stop(){if(this.closed)return;try{this.send({seq:0,type:'request',command:'disconnect',arguments:{terminateDebuggee:true}});}catch{}this.closed=true;this.tools.terminate(this.terminal);this.tools.terminate(this.child);if(this.tools.dap===this)this.tools.dap=null;}
}
module.exports={DebugAdapter};
