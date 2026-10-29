/* Declarative, portable project scaffolding. Applying a template never runs code. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioProjectTemplates=api;})(globalThis,()=>{
  'use strict';
  const FORMAT='devforge.template',VERSION=1,ID=/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const fail=message=>{throw Error(message);},clone=v=>JSON.parse(JSON.stringify(v));
  function keys(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Unsupported template field');}
  function label(v){if(typeof v==='string')return !!v.trim()&&v.length<=1000;return object(v)&&Object.keys(v).length>0&&Object.entries(v).every(([k,s])=>/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(k)&&typeof s==='string'&&!!s.trim()&&s.length<=1000);}
  function path(value){
    if(typeof value!=='string'||value.length>240||/[\\:\x00-\x1f\x7f<>"|?*]/.test(value)||value.startsWith('/')||value.endsWith('/'))fail('Invalid template path');
    const parts=value.split('/');
    if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)||['.git','.forge','.devforge'].includes(p.toLowerCase())))fail('Reserved or unsafe template path');
    return value;
  }
  function freeze(v){if(object(v)||Array.isArray(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
  function parse(input){
    const text=typeof input==='string'?input:JSON.stringify(input);if(!text||new TextEncoder().encode(text).length>262144)fail('Template exceeds 256 KiB');
    let t;try{t=JSON.parse(text);}catch{fail('Invalid template JSON');}
    // Reject prototype keys at every depth, including opaque future project fields.
    JSON.stringify(t,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail('Unsafe template key');return v;});
    keys(t,['format','version','id','kind','name','description','category','parameters','requires','appliesTo','files','project','profile','entryFile']);
    if(t.format!==FORMAT||t.version!==VERSION||!ID.test(t.id||'')||!['project','attachment'].includes(t.kind)||!label(t.name)||t.description!==undefined&&!label(t.description))fail('Invalid template identity');
    if(t.category!==undefined&&(typeof t.category!=='string'||t.category.length>80))fail('Invalid template category');
    t.parameters??=[];if(!Array.isArray(t.parameters)||t.parameters.length>24)fail('Invalid template parameters');const names=new Set(['projectName']);
    for(const p of t.parameters){keys(p,['id','label','type','default','choices']);if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(p.id)||names.has(p.id)||!label(p.label)||!['text','identifier','relativePath','choice'].includes(p.type))fail('Invalid template parameter');names.add(p.id);if(p.type==='choice'&&(!Array.isArray(p.choices)||!p.choices.length||p.choices.length>40||p.choices.some(c=>typeof c!=='string'||!c||c.length>240)))fail('Invalid parameter choices');if(p.default!==undefined)parameter(p,p.default);}
    t.requires??={};keys(t.requires,['addons','tools']);for(const field of ['addons','tools']){t.requires[field]??=[];if(!Array.isArray(t.requires[field])||t.requires[field].length>64||t.requires[field].some(s=>typeof s!=='string'||!(field==='addons'?ID:/^[a-z][a-z0-9-]*$/).test(s)))fail('Invalid template requirements');}
    if(t.appliesTo!==undefined&&(!Array.isArray(t.appliesTo)||t.appliesTo.length>64||t.appliesTo.some(s=>typeof s!=='string'||!s||s.length>100)))fail('Invalid template project types');
    if(!Array.isArray(t.files)||t.files.length>128)fail('Invalid template files');
    for(const f of t.files){keys(f,['path','text']);if(typeof f.path!=='string'||typeof f.text!=='string'||f.text.includes('\0'))fail('Invalid template file');path(substitute(f.path,Object.fromEntries([...names].map(k=>[k,'value']))));checkTokens(f.text,names);checkTokens(f.path,names);}
    if(t.project!==undefined){keys(t.project,t.kind==='project'?['projectType','profiles','configurations','active','tooling','addons','interface']:['tooling']);checkTokens(JSON.stringify(t.project),names);if(t.kind==='project'&&(!Array.isArray(t.project.profiles)||!Array.isArray(t.project.configurations)||typeof t.project.active!=='string'||typeof t.project.projectType!=='string'))fail('Project template needs profiles and run configurations');}
    if(t.kind==='project'&&!t.project)fail('Missing project configuration');
    if(t.profile!==undefined){if(t.kind!=='attachment')fail('Profile patch belongs to attachments');keys(t.profile,['compiler','cppStandard','cStandard','flags','cmakeOptions','pythonExecutable','environment']);checkTokens(JSON.stringify(t.profile),names);}
    if(t.entryFile!==undefined){if(typeof t.entryFile!=='string')fail('Invalid entry file');path(substitute(t.entryFile,Object.fromEntries([...names].map(k=>[k,'value']))));checkTokens(t.entryFile,names);}
    return freeze(t);
  }
  function checkTokens(text,names){text.replace(/\{\{([^{}]+)\}\}/g,(_,token)=>{const [name,filter,...extra]=token.split('|');if(!names.has(name)||filter&&filter!=='json'||extra.length)fail('Unknown template parameter: '+token);return '';});}
  function parameter(p,value){if(typeof value!=='string'||value.length>1000||/[\x00-\x1f\x7f]/.test(value))fail('Invalid parameter: '+p.id);if(p.type==='identifier'&&!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))fail('Expected an identifier: '+p.id);if(p.type==='relativePath')path(value);if(p.type==='choice'&&!p.choices.includes(value))fail('Unknown parameter choice: '+p.id);return value;}
  function substitute(text,values){return text.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)(\|json)?\}\}/g,(_,name,filter)=>{if(!Object.hasOwn(values,name))fail('Missing template parameter: '+name);return filter?JSON.stringify(values[name]):values[name];});}
  function expandObject(v,values){if(typeof v==='string')return substitute(v,values);if(Array.isArray(v))return v.map(x=>expandObject(x,values));if(object(v))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expandObject(x,values)]));return v;}
  function instantiate(input,parameters={},projectName='my-project'){
    const t=parse(input);if(!object(parameters)||Object.keys(parameters).some(k=>!t.parameters.some(p=>p.id===k)))fail('Unknown template parameter');
    if(typeof projectName!=='string'||!projectName||projectName.length>80||/[\x00-\x1f\x7f]/.test(projectName))fail('Invalid project name');
    const values={projectName};for(const p of t.parameters)values[p.id]=parameter(p,parameters[p.id]??p.default??'');
    const seen=new Set(),files=t.files.map(f=>{const file={path:path(substitute(f.path,values)),text:substitute(f.text,values)},key=file.path.toLowerCase();if(seen.has(key))fail('Duplicate template file: '+file.path);seen.add(key);return file;});
    const result={...clone(t),files,project:t.project?expandObject(t.project,values):undefined,profile:t.profile?expandObject(t.profile,values):undefined,entryFile:t.entryFile?path(substitute(t.entryFile,values)):undefined,values};
    if(result.entryFile&&!files.some(f=>f.path===result.entryFile))fail('Template entry file must be generated');
    if(new TextEncoder().encode(JSON.stringify(result)).length>1048576)fail('Expanded template exceeds 1 MiB');return result;
  }
  function merge(base,patch){const out=clone(base||{});for(const[k,v]of Object.entries(patch||{})){if(['__proto__','prototype','constructor'].includes(k))fail('Unsafe project key');out[k]=object(v)?merge(object(out[k])?out[k]:{},v):clone(v);}return out;}
  function compatible(t,projectType){return t.kind==='project'||!t.appliesTo?.length||t.appliesTo.includes('*')||t.appliesTo.includes(projectType);}
  function plan(instance,{current={},document=null,replace=[]}={}){
    if(!compatible(instance,document?.projectType))fail('Template is incompatible with this project type');
    const changes=[],conflicts=[],unchanged=[];
    for(const file of instance.files){const before=Object.hasOwn(current,file.path)?current[file.path]:null;if(before!==null&&typeof before!=='string')fail('Invalid template snapshot');if(before===file.text){unchanged.push(file.path);continue;}if(before!==null&&!replace.includes(file.path)){conflicts.push(file.path);continue;}changes.push({...file,before});}
    let project=document?clone(document):null;
    if(instance.kind==='project'){if(document)fail('Project template cannot replace an existing project configuration');project={version:1,...clone(instance.project)};}
    else if(instance.project){if(!project)fail('Open a configured project first');project=merge(project,instance.project);}
    if(instance.profile){if(!project)fail('Open a configured project first');const selected=project.configurations.find(c=>c.id===project.active),profile=project.profiles.find(p=>p.id===selected?.profile);if(!profile)fail('No active project profile');Object.assign(profile,merge(profile,instance.profile));}
    if(project){project.templates??=[];if(!Array.isArray(project.templates))fail('Invalid project template history');const receipt={id:instance.id,parameters:Object.fromEntries(Object.entries(instance.values).filter(([k])=>k!=='projectName'))};project.templates=project.templates.filter(r=>r.id!==receipt.id);project.templates.push(receipt);}
    return {changes,conflicts,unchanged,project,requirements:clone(instance.requires),entryFile:instance.entryFile};
  }
  return Object.freeze({FORMAT,VERSION,parse,instantiate,plan,compatible,path,merge});
});
