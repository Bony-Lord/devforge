'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const iconv=require('iconv-lite');
const portable=p=>p.replaceAll('\\','/').replace(process.platform==='win32'?/^[A-Z]:/:/$^/,drive=>drive.toLowerCase());
const key=p=>process.platform==='win32'?portable(p).toLowerCase():portable(p);
const inside=(p,root)=>key(p)===key(root)||key(p).startsWith(key(root).replace(/\/$/,'')+'/');
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function canonical(p){
  p=path.resolve(p);let base=p,missing=[];
  while(!await exists(base)){const parent=path.dirname(base);if(parent===base)throw Error('Path unavailable');missing.unshift(path.basename(base));base=parent;}
  return portable(path.join(await fs.realpath(base),...missing));
}
async function atomic(p,data){
  await fs.mkdir(path.dirname(p),{recursive:true});const temp=path.join(path.dirname(p),'.studio-write-'+crypto.randomUUID());
  try{await fs.writeFile(temp,data,{flag:'wx'});await fs.rename(temp,p);}finally{await fs.rm(temp,{force:true});}
}
const encodingMap={'UTF-8':'utf8','UTF-8-BOM':'utf8','UTF-16LE':'utf16-le','UTF-16BE':'utf16-be','windows-1251':'win1251','KOI8-R':'koi8-r','ISO-8859-1':'latin1','US-ASCII':'ascii','Shift_JIS':'shift_jis'};
function decode(bytes,requested='auto'){
  let encoding=requested,skip=0;
  if(encoding==='auto')encoding=bytes.subarray(0,3).equals(Buffer.from([239,187,191]))?'UTF-8-BOM':bytes[0]===255&&bytes[1]===254?'UTF-16LE':bytes[0]===254&&bytes[1]===255?'UTF-16BE':'UTF-8';
  if(!encodingMap[encoding])throw Error('Unknown encoding: '+encoding);
  if(encoding==='UTF-8-BOM'&&bytes.subarray(0,3).equals(Buffer.from([239,187,191])))skip=3;
  if((encoding==='UTF-16LE'&&bytes[0]===255&&bytes[1]===254)||(encoding==='UTF-16BE'&&bytes[0]===254&&bytes[1]===255))skip=2;
  const body=bytes.subarray(skip),text=iconv.decode(body,encodingMap[encoding],{stripBOM:false});
  if(!iconv.encode(text,encodingMap[encoding]).equals(body))throw Error('Cannot decode file as '+encoding+'. Select another encoding.');
  return {text,encoding,bom:skip>0};
}
function encode(text,encoding,bom=false){
  if(!encodingMap[encoding])throw Error('Unknown encoding: '+encoding);
  const bytes=iconv.encode(text,encodingMap[encoding]);
  if(iconv.decode(bytes,encodingMap[encoding],{stripBOM:false})!==text)throw Error('Cannot encode all characters as '+encoding+'.');
  if(encoding==='UTF-8-BOM')return Buffer.concat([Buffer.from([239,187,191]),bytes]);
  if(bom&&encoding.startsWith('UTF-16'))return Buffer.concat([Buffer.from(encoding==='UTF-16LE'?[255,254]:[254,255]),bytes]);
  return bytes;
}
function templates(kind,input,namespace=''){
  let name=input.trim().replaceAll('\\','/');
  if(!name||path.isAbsolute(name)||/^[a-z]:/i.test(name)||/[\x00-\x1f\x7f]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid relative path');
  if(kind==='class'){
    const type=path.posix.basename(name),dir=path.posix.dirname(name)==='.'?'':path.posix.dirname(name)+'/';
    if(!/^[A-Za-z_]\w*$/.test(type)||namespace&&!/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/.test(namespace))throw Error('Invalid C++ identifier');
    const begin=namespace?'namespace '+namespace+' {\n\n':'',end=namespace?'\n} // namespace '+namespace+'\n':'';
    return {[dir+type+'.hpp']:'#pragma once\n\n'+begin+'class '+type+' {\npublic:\n    '+type+'();\n};\n'+end,[dir+type+'.cpp']:'#include "'+type+'.hpp"\n\n'+begin+type+'::'+type+'() = default;\n'+end};
  }
  let text='';if(['cpp','c','h','hpp','cmake'].includes(kind)){
    if(!name.endsWith('.'+kind))name+='.'+kind;
    text=kind==='h'||kind==='hpp'?'#pragma once\n\n':kind==='cmake'?'# CMake module\n\n':(kind==='c'?'/* '+path.posix.basename(name)+' */':'// '+path.posix.basename(name))+'\n\n';
  }else if(kind==='cmakelists'){if(!name.endsWith('CMakeLists.txt'))name+='/CMakeLists.txt';text='cmake_minimum_required(VERSION 3.22)\nproject(app LANGUAGES C CXX)\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\nadd_executable(app main.cpp)\n';}
  else if(kind!=='empty')throw Error('Unsupported template');
  return {[name]:text};
}
class Workspace {
  constructor(data,projectsDirectory){this.data=data;this.projectsDirectory=projectsDirectory||path.join(data,'projects');this.file=path.join(data,'settings.json');this.prefs={settings:{},session:{},projects:{},current:'',encodings:{}};this.versions=new Map();this.readState=new Map();this.saveQueue=Promise.resolve();}
  async init(){await fs.mkdir(this.data,{recursive:true});if(await exists(this.file))this.prefs={...this.prefs,...JSON.parse(await fs.readFile(this.file,'utf8'))};
    if(!this.prefs.current||!await exists(this.prefs.projects[this.prefs.current]?.path||'')){
      let project=null;for(const entry of Object.entries(this.prefs.projects)){if(entry[1].path&&await exists(entry[1].path)&&(await fs.stat(entry[1].path)).isDirectory()){project=entry;break;}}if(project)this.prefs.current=project[0];else if(await exists(path.join(this.projectsDirectory,'hello-cpp'))){const opened=await this.open(path.join(this.projectsDirectory,'hello-cpp'));this.prefs.current=opened.project;await this.persist();}else await this.newProject('hello-cpp');
    }return this;
  }
  persist(){const data=JSON.stringify(this.prefs,null,2);return this.saveQueue=this.saveQueue.catch(()=>{}).then(()=>atomic(this.file,data));}
  get root(){const root=this.prefs.projects[this.prefs.current]?.path;if(!root)throw Error('Project unavailable');return root;}
  get cache(){return path.join(this.data,'workspaces',this.prefs.current);}
  async open(folder){const root=await canonical(folder);if(!(await fs.stat(root)).isDirectory())throw Error('Folder not found');
    let entry=Object.entries(this.prefs.projects).find(([,p])=>key(p.path)===key(root));
    const id=entry?.[0]||crypto.randomUUID();this.prefs.projects[id]={path:root,label:path.basename(root)};await this.persist();return {project:id,label:path.basename(root),path:root};
  }
  async newProject(name,language='cpp'){
    if(!name||name==='.'||name==='..'||/[<>:"/\\|?*\x00-\x1f]/.test(name)||name.length>80)throw Error('Invalid project name');
    const folder=path.join(this.projectsDirectory,name);await fs.mkdir(path.dirname(folder),{recursive:true});await fs.mkdir(folder);
    const c=language==='c',file=c?'main.c':'main.cpp';
    await fs.writeFile(path.join(folder,file),c?'#include <stdio.h>\n\nint main(void) {\n    puts("Hello from C++ Studio!");\n    return 0;\n}\n':'#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++ Studio!\\n";\n    return 0;\n}\n');
    await fs.writeFile(path.join(folder,'CMakeLists.txt'),'cmake_minimum_required(VERSION 3.16)\nproject(studio_app LANGUAGES '+(c?'C':'CXX')+')\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\nadd_executable(app '+file+')\n');
    await fs.writeFile(path.join(folder,'.gitignore'),'.forge/\nbuild/\n');
    const result=await this.open(folder);this.prefs.current=result.project;await this.persist();return result;
  }
  async writable(input){const file=await canonical(path.isAbsolute(input)?input:path.join(this.root,input)),root=await canonical(this.root);if(!inside(file,root)||key(file)===key(root))throw Error('Path outside project');return file;}
  async tree(folder=this.root,depth=0,budget={remaining:12000}){
    if(depth>16)return[];const entries=await fs.readdir(folder,{withFileTypes:true}),result=[];
    entries.sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));
    for(const entry of entries){if(budget.remaining--<=0)break;if(entry.isSymbolicLink()||['.forge','.git','build','.cache','node_modules'].includes(entry.name)||entry.name.startsWith('.studio-write-'))continue;
      const file=portable(path.join(folder,entry.name)),dir=entry.isDirectory();if(!dir&&!entry.isFile())continue;
      result.push({name:entry.name,path:file,dir,...dir?{children:await this.tree(file,depth+1,budget)}:{size:(await fs.stat(file)).size}});
    }return result;
  }
  async read(input,encoding){
    const file=await canonical(input);if(!inside(file,await canonical(this.root))&&!this.readRoots?.some(root=>inside(file,root)))throw Error('File outside project and compiler headers');
    if((await fs.stat(file)).size>4*1024*1024)throw Error('Editor opens files up to 4 MB');
    const bytes=await fs.readFile(file),decoded=decode(bytes,encoding||this.prefs.encodings[file]||'auto');
    this.prefs.encodings[file]=decoded.encoding;this.readState.set(file,{hash:crypto.createHash('sha256').update(bytes).digest('hex'),bom:decoded.bom});
    return {...decoded,path:file,readonly:!inside(file,await canonical(this.root))};
  }
  historyDir(file){return path.join(this.cache,'history',Buffer.from(key(file)).toString('base64url'));}
  async write(input,text,encoding){
    const file=await this.writable(input),previous=await exists(file)?await fs.readFile(file):null,read=this.readState.get(file);
    if(previous&&read&&crypto.createHash('sha256').update(previous).digest('hex')!==read.hash)throw Error('File changed outside the editor. Reopen it before saving; disk contents were preserved.');
    const format=encoding||this.prefs.encodings[file]||(previous?decode(previous).encoding:this.prefs.settings.defaultEncoding||'UTF-8'),bytes=encode(text,format,read?.bom);
    if(previous&&!previous.equals(bytes)){
      const dir=this.historyDir(file);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,Date.now()+'-'+crypto.randomUUID()+'.json'),JSON.stringify({text:decode(previous,this.prefs.encodings[file]||'auto').text,time:Date.now()}));
      const records=(await fs.readdir(dir)).sort().reverse();for(const record of records.slice(30))await fs.rm(path.join(dir,record));
    }
    if(!previous||!previous.equals(bytes))await atomic(file,bytes);
    this.prefs.encodings[file]=format;this.readState.set(file,{hash:crypto.createHash('sha256').update(bytes).digest('hex'),bom:format==='UTF-8-BOM'||!!read?.bom});await this.persist();return true;
  }
  async history(input){const file=await this.writable(input),dir=this.historyDir(file);if(!await exists(dir))return[];return Promise.all((await fs.readdir(dir)).sort().reverse().map(async name=>JSON.parse(await fs.readFile(path.join(dir,name),'utf8'))));}
  async createTemplate(d,preview=false){const files=templates(d.kind,d.name,d.namespace||''),result=[],created=[];
    for(const file of Object.keys(files))if(await exists(await this.writable(file)))throw Error('File already exists: '+file);
    try{for(const [name,text]of Object.entries(files)){const file=await this.writable(name);if(!preview){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,encode(text,this.prefs.settings.defaultEncoding||'UTF-8'),{flag:'wx'});created.push(file);}result.push({path:preview?name:file,text});}}catch(error){for(const file of created)await fs.rm(file);throw error;}return result;
  }
  async createItem(d){
    if(!/^[A-Za-z0-9_+.-]{0,24}$/.test(d.extension||''))throw Error('Invalid file extension');const dir=await canonical(path.join(this.root,d.directory||''));if(!inside(dir,await canonical(this.root)))throw Error('Path outside project');
    for(let n=1;n<10000;n++){
      const folder=d.kind==='folder',base=folder?'new_folder':d.kind==='cmakelists'?'CMakeLists':'new_file',suffix=n===1?'':n;
      const ext=folder?'':d.kind==='cmakelists'?'.txt':d.kind==='empty'?(d.extension?(d.extension.startsWith('.')?'':'.')+d.extension:''):'.'+d.kind;
      const file=await this.writable(path.join(dir,base+suffix+ext));
      try{if(folder)await fs.mkdir(file);else await fs.writeFile(file,encode(Object.values(templates(d.kind,d.kind==='cmakelists'?'CMakeLists.txt':path.basename(file)))[0],this.prefs.settings.defaultEncoding||'UTF-8'),{flag:'wx'});return{path:file,dir:folder};}catch(e){if(e.code!=='EEXIST')throw e;}
    }throw Error('Too many files with this name');
  }
  async move(from,to){from=await this.writable(from);to=await this.writable(to);if(inside(to,from))throw Error('Cannot move a folder inside itself');if(await exists(to))throw Error('Destination exists');await fs.rename(from,to);
    for(const file of Object.keys(this.prefs.encodings))if(inside(file,from)){const target=to+file.slice(from.length);this.prefs.encodings[target]=this.prefs.encodings[file];delete this.prefs.encodings[file];if(this.readState.has(file)){this.readState.set(target,this.readState.get(file));this.readState.delete(file);}}
    await this.persist();return to;
  }
  async browse(input){const folder=await canonical(input||os.homedir()),entries=[];
    for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name))){if(entries.length>=3000)break;if(entry.isSymbolicLink())continue;entries.push({name:entry.name,path:portable(path.join(folder,entry.name)),dir:entry.isDirectory()});}
    return{permission:true,path:folder,parent:path.dirname(folder)===folder?null:portable(path.dirname(folder)),roots:[portable(path.parse(folder).root),portable(os.homedir())],entries,writable:true};
  }
}
module.exports={Workspace,portable,key,inside,canonical,exists,atomic,encode,decode,templates};
