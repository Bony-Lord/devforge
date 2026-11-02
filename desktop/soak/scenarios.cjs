'use strict';
const files=['code.cpp','notes.md','data.json','scratch.txt'];
const pick=(rng,values)=>values[Math.floor(rng()*values.length)];
const names=['open-file','switch-tab','edit-save-undo','resize','settings-popup','command-search','addon-search','panel','sidebar','rename-roundtrip','copy-file','trash-restore','external-update','notebook-cell','project-roundtrip','reload','settings-values','split-editor','rapid-popup','invalid-path'];
function generate(rng,index,coverage){let type=names[index<names.length?index:Math.floor(rng()*names.length)];if(coverage&&index>=names.length){const candidates=names.map(name=>({name,weight:1/Math.sqrt(1+(coverage[name]?.passed||0)+(coverage[name]?.failed||0)+(coverage[name]?.unavailable||0))})),total=candidates.reduce((sum,c)=>sum+c.weight,0);let target=rng()*total;for(const item of candidates){target-=item.weight;if(target<=0){type=item.name;break;}}}const params={};
 if(['open-file','switch-tab','edit-save-undo'].includes(type))params.file=pick(rng,files);
 if(type==='edit-save-undo')params.text='\n// soak_'+Math.floor(rng()*1e9).toString(36)+' Привет';
 if(type==='resize'){params.width=pick(rng,[390,480,720,900,1024,1360,1600,1920]);params.height=pick(rng,[640,720,900,1080]);params.scale=pick(rng,[1,1.25,1.5]);}
 if(type==='command-search')params.query=pick(rng,['> настройки','> settings','code','notes','@class','data.json',':2:3','файл','zz-no-such-file']);
 if(type==='addon-search')params.query=pick(rng,['markdown','@enabled','@installed','@pack','python','cpp','zz-not-an-addon','']);
 if(type==='panel')params.name=pick(rng,['console','problems','terminal','debug','build']);
 if(type==='sidebar')params.name=pick(rng,['project','outline','search','git']);
 if(type==='notebook-cell'){params.kind=pick(rng,['code','markdown']);params.text=pick(rng,['print(1 + 2)','**строка**\nВторая строка','for i in range(3):\n    print(i)','[ссылка](https://example.invalid)']);}
 if(type==='settings-values')params.values={fontSize:pick(rng,[12,14,16,20]),wordWrap:rng()>.5,theme:pick(rng,['forge-dark','forge-light'])};
 if(type==='split-editor')params.direction=pick(rng,['side','stacked']);
 if(type==='external-update')params.text='external_'+Math.floor(rng()*1e9)+'\n';
 return{schema:1,type,params};
}
async function execute(action,context){const {call,cdp,fixture,checkDisk}=context,p=action.params||{};await call({type:'assertScope'});
 switch(action.type){
  case 'open-file':await call({type:'closeTransient'});await call({type:'open',params:p});await call({type:'assertOpen',params:p});break;
  case 'switch-tab':await call({type:'closeTransient'});for(const file of ['code.cpp',p.file])await call({type:'open',params:{file}});await cdp.click((await call({type:'tab',params:p})).point);await call({type:'assertOpen',params:p});break;
  case 'edit-save-undo':{await call({type:'closeTransient'});await call({type:'open',params:p});const before=await call({type:'prepareEdit'});await cdp.key('End',2);await cdp.send('Input.insertText',{text:p.text});await call({type:'assertEdit',params:{text:p.text}});await cdp.key('z',2);await cdp.key('y',2);await call({type:'assertEdit',params:{text:p.text}});await call({type:'save'});await checkDisk(p.file,p.text);return{before:before.before.slice(-120)};}
  case 'resize':await cdp.send('Emulation.setDeviceMetricsOverride',{width:p.width,height:p.height,deviceScaleFactor:p.scale,mobile:false});break;
  case 'settings-popup':case 'rapid-popup':{await call({type:'closeTransient'});const point=(await call({type:'target',params:{name:'settings'}})).point;await cdp.click(point,action.type==='rapid-popup'?2:1);break;}
  case 'command-search':await call({type:'closeTransient'});await call({type:'quick'});await cdp.send('Input.insertText',{text:p.query});break;
  case 'addon-search':await call({type:'closeTransient'});await cdp.click((await call({type:'target',params:{name:'addons'}})).point);await call({type:'addonSearch',params:p});break;
  case 'panel':case 'sidebar':await call({type:'closeTransient'});await call({type:action.type==='panel'?'panel':'side',params:p});break;
  case 'rename-roundtrip':await call({type:'closeTransient'});await call({type:'save'});await call({type:'rename',params:{from:'scratch.txt',to:'renamed.txt'}});await checkDisk('renamed.txt');await call({type:'rename',params:{from:'renamed.txt',to:'scratch.txt'}});break;
  case 'copy-file':await call({type:'closeTransient'});{const result=await call({type:'copy',params:{file:'victim.txt'}});await checkDisk(result.path,true);break;}
  case 'trash-restore':await call({type:'closeTransient'});await call({type:'trashRestore',params:{file:'victim.txt'}});await checkDisk('victim.txt','recoverable fixture bytes');break;
  case 'external-update':{await call({type:'externalReady'});await context.writeExternal('external.txt',p.text);await call({type:'waitExternal',params:p});break;}
  case 'notebook-cell':await call({type:'closeTransient'});await call({type:'notebook'});await call({type:'notebookAdd',params:p});await call({type:'notebookFocus'});await cdp.send('Input.insertText',{text:p.text});await call({type:'assertNotebook',params:p});await call({type:'save'});{const saved=JSON.parse(await checkDisk('notebook.ipynb')),source=saved.cells.at(-1).source;if((Array.isArray(source)?source.join(''):source)!==p.text)throw Error('Saved notebook lost the new cell contents');break;}
  case 'project-roundtrip':await call({type:'closeTransient'});await call({type:'project',params:{name:'Soak other'}});await call({type:'project',params:{name:'Soak main'}});break;
  case 'reload':await call({type:'save'});await cdp.send('Page.reload');await cdp.until('document.readyState==="complete"');await context.inject();break;
  case 'settings-values':await call({type:'closeTransient'});await call({type:'settings',params:p});break;
  case 'split-editor':await call({type:'closeTransient'});await call({type:'open',params:{file:'code.cpp'}});await call({type:'split',params:p});break;
  case 'invalid-path':await call({type:'invalidPath'});break;
  case 'self-check':await call({type:'selfCheck'});break;
  default:{const error=Error('Unknown scenario '+action.type);error.code='ADAPTER_MISMATCH';throw error;}
 }
 return{ok:true};
}
module.exports={names,generate,execute};
