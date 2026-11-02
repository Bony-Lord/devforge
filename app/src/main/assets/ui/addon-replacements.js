/* Windows uses the upstream language extensions and Open VSX providers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioAddonReplacements=api;})(globalThis,()=>{
 'use strict';
 const providers=[
  {namespace:'vscodevim',name:'vim',title:'Vim',ids:['studio.vim','studio.lib.vim']},
  {namespace:'llvm-vs-code-extensions',name:'vscode-clangd',title:'clangd',ids:['studio.clangd','studio.formatter','studio.completion','studio.diagnostics','studio.semantic','studio.inlay-hints']},
  {namespace:'ms-pyright',name:'pyright',title:'Pyright',ids:['studio.python-intelligence','studio.tool.python-intelligence']},
  {namespace:'ms-python',name:'autopep8',title:'autopep8',ids:['studio.python-formatting','studio.tool.python-style','studio.python-style']},
  {namespace:'ms-python',name:'flake8',title:'Flake8',ids:['studio.python-diagnostics','studio.tool.python-style','studio.python-style']}
 ];
 const languages=['cpp','json','yaml','markdown','shell','python'],retired=new Set([...providers.flatMap(p=>p.ids),'studio.keyboard',...languages.map(id=>'studio.language.'+id)]),id=r=>typeof r==='string'?r:r.id;
 const enabled=()=>globalThis.StudioDesktop?.platform==='win32'&&!!globalThis.StudioCodeOSS?.api;
 const upstreamId=p=>'vscode.'+p.namespace.toLowerCase()+'.'+p.name.toLowerCase();
 function alias(manifest){return {...manifest,kind:'core',platforms:undefined,capabilities:[],dependencies:{},conflicts:{},replacement:providers.filter(p=>p.ids.includes(manifest.id)).map(upstreamId)};}
 function definitions(values){return values.map(d=>retired.has(d.manifest.id)?{manifest:alias(d.manifest),contributions:[]}:d);}
 function catalogAliases(){return [{manifest:alias({schemaVersion:1,id:'studio.vim',version:'1.0.1',api:{min:'0.1.2',maxExclusive:'0.2.0'},name:'Vim',license:'MIT'}) ,contributions:[]}];}
 function migrate(requested,catalog,installed=[]){
  const packages=new Map(installed.map(e=>{const m=(e.package||e).manifest;return[m.id,m];})),byId=new Map(catalog.map(m=>[m.id,m])),needed=new Set(),seen=new Set();
  const visit=name=>{if(seen.has(name))return;seen.add(name);if(retired.has(name))needed.add(name);const m=byId.get(name);if(m?.kind==='pack')Object.keys(m.includes||{}).forEach(visit);};requested.forEach(r=>visit(id(r)));
  const result=requested.filter(r=>!retired.has(id(r))),included=new Set(result.map(id));
  for(const p of providers)if(p.ids.some(name=>needed.has(name))){const name=upstreamId(p),m=packages.get(name);if(m&&!included.has(name)){result.push({id:name,version:m.version});included.add(name);}}
  return result;
 }
 return Object.freeze({providers,languages,retired,enabled,upstreamId,alias,definitions,catalogAliases,migrate});
});
