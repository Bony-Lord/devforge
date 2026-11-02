'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const limits={maxWorkers:[1,32],maxMemoryMb:[512,262144],workerMemoryMb:[512,262144],reserveMemoryMb:[1024,262144],maxDiskMb:[64,1048576],delay:[0,10000]};
function validate(value){
 const out={};for(const[key,val]of Object.entries(value||{})){
  if(key==='paused'){if(typeof val!=='boolean')throw Error('Пауза должна быть включена или выключена');out.paused=val;}
  else if(key==='performance'){if(!['normal','idle','full'].includes(val))throw Error('Неизвестный режим нагрузки');out.performance=val;}
  else if(limits[key]){const[min,max]=limits[key];if(!Number.isInteger(val)||val<min||val>max)throw Error('Недопустимое значение: '+key);out[key]=val;}
  else throw Error('Нельзя изменить параметр: '+key);
 }return out;
}
async function apply(store,config,state,{engine='single'}={}){
 state.controls??={version:1,engine,revision:0,paused:false};
 let value;try{value=JSON.parse(await fs.readFile(path.join(store.run,'control.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return false;state.controls.error='Не удалось прочитать управление: '+error.message;return false;}
 if(value.format!=='devforge.soak.control/1'||value.token!==store.token||!Number.isSafeInteger(value.revision)||value.revision<=state.controls.revision)return false;
 try{
  const patch=validate(value.patch);if(engine==='single'&&patch.performance&&patch.performance!==config.performance)throw Error('Изменение режима этого запуска требует перезапуска');
  const next={...config,...patch};if(engine==='fleet'&&next.workerMemoryMb>next.maxMemoryMb)throw Error('Память одного потока превышает общий лимит');
  const paused=patch.paused??state.controls.paused;delete patch.paused;Object.assign(config,patch);store.maxBytes=config.maxDiskMb*1048576;
  Object.assign(state.controls,{revision:value.revision,paused,appliedAt:new Date().toISOString()});delete state.controls.error;
  state.performance=config.performance;state.limits={...state.limits,memoryMb:config.maxMemoryMb,workerMemoryMb:config.workerMemoryMb,reserveMemoryMb:config.reserveMemoryMb,diskMb:config.maxDiskMb,maxWorkers:config.maxWorkers};return true;
 }catch(error){state.controls.error=error.message;state.controls.revision=value.revision;return false;}
}
module.exports={validate,apply};
