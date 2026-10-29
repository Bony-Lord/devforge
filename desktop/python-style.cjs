'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {launch}=require('./tooling.cjs'),{inside,canonical}=require('./workspace.cjs');
class PythonStyleHost {
  constructor(host){this.host=host;this.cache=path.join(host.ws.data,'python-style');this.jobs=new Map();this.admin=Promise.resolve();this.installing=false;this.manifest=require(require('./assets.cjs').assets+'/python/style-manifest.json');}
  async info(){const packages=[];for(const p of this.manifest.packages){let installed=false;try{const file=path.join(this.cache,p.filename);if((await fs.stat(file)).size!==p.bytes)throw Error('Size mismatch');const bytes=await fs.readFile(file);installed=bytes.length===p.bytes&&crypto.createHash('sha256').update(bytes).digest('hex')===p.sha256;}catch{}packages.push({...p,installed});}return{id:'python-style',installed:packages.every(p=>p.installed),packages,bytes:packages.reduce((n,p)=>n+p.bytes,0),path:this.cache};}
  stop(){for(const job of this.jobs.values())this.host.tools.terminate(job);this.jobs.clear();}
  manage(action,d){const operation=this.admin.catch(()=>{}).then(async()=>{this.installing=true;this.stop();try{if(action==='remove'){for(const p of this.manifest.packages)await fs.unlink(path.join(this.cache,p.filename)).catch(e=>{if(e.code!=='ENOENT')throw e;});return this.info();}return await this.run(action,d);}finally{this.installing=false;}});this.admin=operation;return operation;}
  async request(action,d){
    if(this.installing)throw Error('Finish the Python style component operation first');
    if(!this.host.addons.enabled(action==='format'?'studio.python-formatting':'studio.python-diagnostics'))throw Error('Enable the Python style addon');
    const root=await canonical(this.host.ws.root);if(!this.host.trust().trusted)throw Error('WORKSPACE_UNTRUSTED: Trust this folder before running Python tools');
    if(typeof d.root!=='string'||await canonical(d.root)!==root)throw Error('Project changed; retry Python analysis');
    const source=await canonical(d.path);if(!inside(source,root)||!source.endsWith(d.notebook?'.ipynb':'.py')||typeof d.text!=='string'||Buffer.byteLength(d.text)>524288)throw Error('Invalid Python style source');
    return this.run(action,{...d,root,path:source});
  }
  async run(action,d={}){
    const options=this.host.trust().trusted?d.options:undefined,runtimeKey=options?.pythonExecutable||this.host.ws.prefs.settings.pythonExecutable||this.host.tools.tools.python||'',info=this.runtime?.key===runtimeKey&&Date.now()-this.runtime.time<30000?this.runtime.info:await this.host.python.info(options);if(!info.available)throw Error('PYTHON_UNAVAILABLE: Select Python 3.10 or newer');this.runtime={key:runtimeKey,time:Date.now(),info};await fs.mkdir(this.cache,{recursive:true});
    const args=['-B','-S',path.join(require('./assets.cjs').assets,'python/style_tools.py'),action,this.cache],key=action==='analyze'?d.root+'|'+d.path+'|'+String(d.cell||'').slice(0,128):'admin-'+action;
    if(this.jobs.has(key))this.host.tools.terminate(this.jobs.get(key));
    const child=launch(info.path,args,{cwd:this.cache,env:{...this.host.tools.env(),PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONUTF8:'1'},detached:process.platform!=='win32'});this.jobs.set(key,child);this.host.tools.children.add(child);
    return new Promise((resolve,reject)=>{let output='',error='',settled=false;const finish=(reason,value)=>{if(settled)return;settled=true;clearTimeout(timer);this.host.tools.children.delete(child);if(this.jobs.get(key)===child)this.jobs.delete(key);reason?reject(reason):resolve(value);},timer=setTimeout(()=>{this.host.tools.terminate(child);finish(Error('Python style tool timed out'));},action==='install'?180000:20000);timer.unref();
      child.stdout.on('data',bytes=>{output+=bytes.toString('utf8');if(output.length>4*1024*1024){this.host.tools.terminate(child);finish(Error('Python style response too large'));}});child.stderr.on('data',bytes=>{if(error.length<8192)error+=bytes.toString('utf8');});child.on('error',e=>finish(e));child.on('close',code=>{if(code!==0)return finish(Error(error||'Python style operation cancelled'));try{const value=JSON.parse(output);if(!value.ok)throw Error(value.error||'Python style operation failed');finish(null,value);}catch(e){finish(e);}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({root:d.root,path:d.path,text:d.text,notebook:!!d.notebook}));
    });
  }
}
module.exports={PythonStyleHost};
