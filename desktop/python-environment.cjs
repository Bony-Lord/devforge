'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {capture,findTool}=require('./tooling.cjs');
class PythonEnvironments {
  constructor(host){this.host=host;this.cache=new Map();}
  async candidates(){
    const result=[],add=async file=>{try{if((await fs.stat(file)).isFile()&&(await fs.stat(file)).size>0&&!result.includes(file))result.push(file);}catch{}};
    if(this.host.ws.prefs.current&&this.host.trust().trusted)for(const name of ['.venv','venv'])await add(path.join(this.host.ws.root,name,process.platform==='win32'?'Scripts/python.exe':'bin/python'));
    const paths=(process.env.PATH||'').split(path.delimiter).filter(Boolean);
    if(process.platform==='win32'){
      const native=paths.filter(p=>!/(?:msys|cygwin|WindowsApps)/i.test(p));for(const folder of native)await add(path.join(folder,'python.exe'));
      const folder=path.join(process.env.LOCALAPPDATA||'','Programs/Python');try{for(const name of (await fs.readdir(folder)).sort().reverse())await add(path.join(folder,name,'python.exe'));}catch{}
    }
    for(const folder of paths.filter(p=>process.platform!=='win32'||!/WindowsApps/i.test(p)))for(const name of process.platform==='win32'?['python.exe','python3.exe']:['python3','python'])await add(path.join(folder,name));
    const fallback=await findTool('python');if(fallback)await add(fallback);return result;
  }
  async resolve(options={}){let value=options.pythonExecutable||this.host.ws.prefs.settings.pythonExecutable||this.host.ws.prefs.settings.toolPaths?.python||(await this.candidates())[0]||null;if(value&&!path.isAbsolute(value)&&/[\\/]/.test(value))value=path.resolve(this.host.ws.prefs.current?this.host.ws.root:this.host.ws.data,value);return value;}
  env(executable,extra={}){const result={...this.host.tools.env(),...extra};let previous='';for(const key of Object.keys(result))if(key.toUpperCase()==='PATH'){previous=result[key];delete result[key];}const folder=path.dirname(executable);return{...result,PATH:[...(path.isAbsolute(executable)?[folder,path.join(folder,'Scripts')]:[]),previous].filter(Boolean).join(path.delimiter),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};}
  async info(options={}){
    const executable=await this.resolve(options);if(!executable)return{available:false,delivery:'system'};const cached=this.cache.get(executable);if(cached&&Date.now()-cached.time<30000)return cached.value;
    try{const probe=await capture(executable,['-I','-c','import sys,json,sysconfig; print(json.dumps(dict(path=sys.executable,version=sys.version.split()[0],prefix=sys.prefix,basePrefix=sys.base_prefix,sitePackages=sysconfig.get_path("purelib"))))'],{env:this.env(executable),timeout:5000});if(probe.code)throw Error(probe.error||probe.text);const value={available:true,delivery:'system',...JSON.parse(probe.text)};this.cache.set(executable,{time:Date.now(),value});return value;}catch(error){return{available:false,path:executable,delivery:'system',error:error.message};}
  }
  async list(options={}){const items=[],seen=new Set(),selected=await this.resolve(options),candidates=[...new Set([selected,...await this.candidates()].filter(Boolean))].slice(0,12);for(let offset=0;offset<candidates.length;offset+=2)for(const value of await Promise.all(candidates.slice(offset,offset+2).map(p=>this.info({pythonExecutable:p})))){if(value.available){let key=path.resolve(value.prefix||path.dirname(value.path))+'|'+value.version;if(process.platform==='win32')key=key.toLowerCase();if(!seen.has(key)){seen.add(key);items.push(value);}}}return items;}
}
module.exports={PythonEnvironments};
