'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {canonical,inside,exists}=require('./workspace.cjs');
function validate(input){
  if(!input||input.version!==1||!Array.isArray(input.profiles)||!input.profiles.length||!Array.isArray(input.runs)||!input.runs.length)throw Error('Invalid project configurations');
  const string=(value,max=4096)=>{if(typeof value!=='string'||value.length>max||value.includes('\0'))throw Error('Invalid configuration value');return value;};
  const env=value=>{if(value==null)return{};if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>100)throw Error('Invalid environment');return Object.fromEntries(Object.entries(value).map(([k,v])=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))throw Error('Invalid environment variable');return[k,string(v)];}));};
  const array=value=>{if(!Array.isArray(value)||value.length>100)throw Error('Invalid configuration arguments');return value.map(v=>string(v));};
  if(input.profiles.length>30||input.runs.length>80)throw Error('Too many configurations');
  const name=value=>{string(value,100);if(!value.trim())throw Error('Configuration name is required');return value.trim();};
  const ids=new Set(),readId=value=>{string(value,64);if(!/^[a-zA-Z0-9_-]+$/.test(value)||ids.has(value))throw Error('Duplicate or invalid configuration ID');ids.add(value);return value;};
  const profiles=input.profiles.slice(0,30).map(p=>{if(!['Debug','Release','RelWithDebInfo','MinSizeRel'].includes(p.buildType)||!['','gcc','clang'].includes(p.compiler||''))throw Error('Invalid CMake profile');const cmakeOptions=array(p.cmakeOptions||[]);if(cmakeOptions.some(x=>!/^\-D[^=\s]+(?:=.*)?$/.test(x)))throw Error('CMake options must be -DNAME=value arguments');return{id:readId(p.id),name:name(p.name),buildType:p.buildType,compiler:p.compiler||'',cmakeOptions,environment:env(p.environment)};});
  ids.clear();const runs=input.runs.slice(0,80).map(r=>{if(!['file','project','cmake'].includes(r.kind))throw Error('Invalid run configuration');return{id:readId(r.id),name:name(r.name),kind:r.kind,target:string(r.target||'',200),args:array(r.args||[]),workingDirectory:string(r.workingDirectory||'.'),environment:env(r.environment)};});
  return{version:1,profiles,runs};
}
class ProjectConfigurations{
  constructor(host){this.host=host;this.ws=host.ws;}
  async read(){
    const file=path.join(this.ws.root,'.cpp-studio/configurations.json');
    if(await exists(file)){const value=await this.ws.read(file);return validate(JSON.parse(value.text));}
    return validate({version:1,profiles:[{id:'debug',name:'Debug',buildType:'Debug'},{id:'release',name:'Release',buildType:'Release'}],runs:[{id:'default',name:await exists(path.join(this.ws.root,'CMakeLists.txt'))?'CMake':'Current file',kind:await exists(path.join(this.ws.root,'CMakeLists.txt'))?'cmake':'file'}]});
  }
  async state(){const configuration=await this.read(),selected=this.ws.prefs.configurationSelection?.[this.ws.prefs.current]||{},profile=configuration.profiles.find(p=>p.id===selected.profile)||configuration.profiles[0],run=configuration.runs.find(r=>r.id===selected.run)||configuration.runs[0];return{configuration,profile:profile.id,run:run.id,targets:(await this.host.tools.cmakeModel(this.options(profile))).targets};}
  options(profile){const base=this.ws.prefs.settings;return{...base,compiler:profile.compiler||base.compiler||'gcc',optimization:['Release','MinSizeRel'].includes(profile.buildType)?'release':'debug',cmakeBuildType:profile.buildType,cmakeProfile:profile.id,cmakeOptions:profile.cmakeOptions,buildEnvironment:profile.environment};}
  async select(d){const state=await this.state();if(d.profile&&!state.configuration.profiles.some(p=>p.id===d.profile)||d.run&&!state.configuration.runs.some(r=>r.id===d.run))throw Error('Configuration unavailable');this.ws.prefs.configurationSelection??={};this.ws.prefs.configurationSelection[this.ws.prefs.current]={profile:d.profile||state.profile,run:d.run||state.run};await this.ws.persist();return this.state();}
  async save(d){const configuration=validate(d.configuration);if(d.profile&&!configuration.profiles.some(p=>p.id===d.profile)||d.run&&!configuration.runs.some(r=>r.id===d.run))throw Error('Configuration unavailable');const file=path.join(this.ws.root,'.cpp-studio/configurations.json');await this.ws.write(file,JSON.stringify(configuration,null,2)+'\n');return this.select({profile:d.profile,run:d.run});}
  async resolve(d={}){const state=await this.state(),profile=state.configuration.profiles.find(p=>p.id===state.profile),run=state.configuration.runs.find(r=>r.id===state.run),cwd=await canonical(path.resolve(this.ws.root,run.workingDirectory));if(!inside(cwd,await canonical(this.ws.root))||!(await fs.stat(cwd)).isDirectory())throw Error('Working directory must be a project folder');const options={...this.options(profile),target:run.target,buildMode:run.kind};return{mode:run.kind,path:d.path,options,args:run.args,cwd,environment:{...profile.environment,...run.environment}};}
}
module.exports={ProjectConfigurations,validate};
