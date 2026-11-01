'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {atomic,inside}=require('./core.cjs');
async function prepare(profile){
 profile=await fs.realpath(profile);
 const main=path.join(profile,'projects','main'),other=path.join(profile,'projects','other');for(const root of [main,other])await fs.mkdir(root,{recursive:true});await fs.mkdir(path.join(main,'copies'));
 const notebook={cells:[{cell_type:'code',execution_count:null,metadata:{},outputs:[],source:['print(2 + 2)']},{cell_type:'markdown',metadata:{},source:['# Проверка\n','Первая строка\n','Вторая строка']}],metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'}},nbformat:4,nbformat_minor:5};
 const files={'visual-reference.cpp':'// DevForge visual reference\n#include <vector>\nstruct Sample {\n    int value = 42;\n};\nint main() { return 0; }\n','code.cpp':'#include <iostream>\nint main() { return 0; }\n','notes.md':'# Markdown\nПервая строка\nВторая строка\n\n**Жирный** и `код`\n','data.json':'{\n  "name": "тест",\n  "values": [1, 2, 3]\n}\n','scratch.txt':'scratch fixture\n','victim.txt':'recoverable fixture bytes\n','external.txt':'initial external fixture\n','notebook.ipynb':JSON.stringify(notebook,null,2)};
 for(const [name,text]of Object.entries(files))await fs.writeFile(path.join(main,name),text);await fs.writeFile(path.join(other,'other.txt'),'independent project bytes\n');
 const portable=value=>value.replaceAll('\\','/'),a=portable(main),b=portable(other),base=['studio.pack.essentials','studio.console','studio.run-configurations','studio.notebooks','studio.outline','studio.split-editors','studio.terminal','studio.diagnostics'];
 await atomic(path.join(profile,'settings.json'),{settings:{language:'ru',setupComplete:true,setupDismissed:true,autosave:false,interfaceMode:'windows',showBuildFolders:true},projects:{main:{path:a,label:'Soak main'},other:{path:b,label:'Soak other'}},current:'main',trustedRoots:{[a]:true,[b]:true},session:{project:'main',tabs:[a+'/visual-reference.cpp'],active:a+'/visual-reference.cpp'}});
 await atomic(path.join(profile,'addons.json'),{schemaVersion:1,revision:0,packages:[],profile:{schemaVersion:1,modulesVersion:2,requested:base,defaultRequested:base,resolved:[],activating:false,safeMode:false}});
 return{profile,roots:[a,b],main,other,files};
}
async function snapshot(profile,destination,store){const allowed=['settings.json','addons.json','window-sessions','projects'];let count=0,bytes=0;for(const name of allowed){const start=path.join(profile,name);async function visit(file){if(!inside(file,profile))throw Error('Snapshot escaped fixture');const stat=await fs.lstat(file).catch(()=>null);if(!stat||stat.isSymbolicLink()||count>=80||bytes>2*1048576)return;if(stat.isDirectory()){if(['.forge','build','node_modules','.git'].includes(path.basename(file)))return;for(const name of await fs.readdir(file))await visit(path.join(file,name));}else if(stat.size<262144){const data=await fs.readFile(file);await store.write(destination+'/'+path.relative(profile,file).split(path.sep).join('/'),data);count++;bytes+=data.length;}}await visit(start);}return{files:count,bytes};}
module.exports={prepare,snapshot};
