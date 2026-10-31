'use strict';
const JSON5=require('json5');
const packages=require(require('./assets.cjs').ui+'/addon-packages.js');
function addonId(original){const[publisher,...rest]=String(original).split('.');if(!publisher||!rest.length)throw Error('Invalid VS Code extension identifier');return'vscode.'+publisher.toLowerCase().replace(/[^a-z0-9-]/g,'-')+'.'+rest.join('.').toLowerCase().replace(/[^a-z0-9-]/g,'-');}
function report(manifest){const engine=manifest.engines?.vscode,engineCompatible=!engine||require('semver').satisfies('1.142.0',engine,{includePrerelease:true});return{runtime:'codeoss',apiVersion:'1.142.0',engineCompatible,engine:engine||'*',mode:manifest.main?'node':manifest.browser?'browser':'declarative',partial:false,supportedGroups:Object.keys(manifest.contributes||{}),unsupported:[],requiresRuntimeCheck:!!(manifest.main||manifest.browser)};}
function convert(read,{bundle}){
 const m=JSON5.parse(read('extension/package.json')),originalId=m.publisher+'.'+m.name,id=addonId(originalId),configuration={};
 // Original manifests, binaries, grammars, resources and code stay intact in the
 // bundle. This is only the DevForge lifecycle/settings envelope, not an API converter.
 for(const section of [].concat(m.contributes?.configuration||[]))for(const[key,field]of Object.entries(section.properties||{})){if(!field||typeof field!=='object')continue;const value={};for(const name of ['type','default','description','markdownDescription','enum','enumDescriptions','minimum','maximum','items','properties','scope','order','additionalProperties','anyOf','oneOf','allOf','pattern','format','minLength','maxLength','minItems','maxItems','uniqueItems','required'])if(field[name]!==undefined)value[name]=field[name];configuration[key]=value;}
 const dependencies=Object.fromEntries((m.extensionDependencies||[]).map(value=>[addonId(value),{}]));dependencies['studio.vsix']={min:'1.0.3'};
 const summary=String(m.description||m.displayName||m.name||originalId).slice(0,1000);
 return packages.parse({format:'cppstudio.addon',formatVersion:1,manifest:{schemaVersion:1,id,version:m.version,api:{min:'0.1.1',maxExclusive:'0.2.0'},name:m.displayName||m.name,description:summary,readme:summary,license:typeof m.license==='string'?m.license:'See original extension license',publisher:m.publisher,configuration,vscode:{bundle,originalId,main:m.main||null,browser:m.browser||null,engine:m.engines?.vscode,compatibility:report(m),dependencyIds:m.extensionDependencies||[],pack:m.extensionPack||[],languages:(m.contributes?.languages||[]).map(l=>({id:l.id,extensions:l.extensions||[],filenames:l.filenames||[],aliases:l.aliases||[]}))},...(m.extensionPack?.length&&!m.main&&!m.browser?{kind:'pack',includes:{}}:{}),capabilities:['extensions.full-access',...(m.contributes?.languages?.length?['editor.languages']:[])],dependencies,conflicts:{},platforms:['win32']},contributions:[],module:'return StudioCodeOSS.activate(api);'});
}
module.exports={addonId,report,convert};
