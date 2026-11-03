'use strict';
// Available before the editor/runtime is initialized; never show the old layout.
globalThis.StudioBoot={
 stage(label){if(!globalThis.StudioDesktop)return;document.body.classList.add('studio-booting');let box=document.getElementById('studioBoot');if(!box){box=document.createElement('section');box.id='studioBoot';box.setAttribute('role','status');const title=document.createElement('strong');title.textContent='DevForge';const text=document.createElement('span');text.dataset.bootStage='';const progress=document.createElement('progress');progress.ariaLabel='Loading';box.append(title,text,progress);document.body.append(box);}box.querySelector('[data-boot-stage]').textContent=label;},
 ready(){document.body.classList.remove('studio-booting');document.getElementById('studioBoot')?.remove();},
 fail(error){this.stage((globalThis.StudioI18n?.locale==='en'?'Startup failed: ':'Ошибка запуска: ')+error.message);const box=document.getElementById('studioBoot');box?.querySelector('progress')?.remove();if(box&&!box.querySelector('button')){const retry=document.createElement('button');retry.textContent='↻';retry.title='Restart';retry.onclick=()=>location.reload();box.append(retry);}}
};
StudioBoot.stage(globalThis.STUDIO_BOOT_LANGUAGE==='en'?'Loading workspace…':'Загрузка рабочего пространства…');
globalThis.StudioDownloads={
 jobs:new Map(),
 update(value){if(!value||!Number.isFinite(value.bytes)||value.bytes<0)return;const id=value.job||value.extension||value.id||'components';if(this.jobs.size>=16&&!this.jobs.has(id))return;
 let record=this.jobs.get(id);if(!record){const box=document.createElement('div');box.className='studio-download';box.setAttribute('role','status');const text=document.createElement('span'),progress=document.createElement('progress');box.append(text,progress);let tray=document.getElementById('studioDownloads');if(!tray){tray=document.createElement('aside');tray.id='studioDownloads';document.body.append(tray);}tray.append(box);record={box,text,progress};this.jobs.set(id,record);}
 const total=Number.isFinite(value.total)&&value.total>0?value.total:0,format=bytes=>(bytes/1048576).toFixed(1)+' MiB';record.text.textContent=(value.extension||value.id||'DevForge')+' · '+format(value.bytes)+(total?' / '+format(total):'');if(total){record.progress.max=total;record.progress.value=Math.min(total,value.bytes);}else record.progress.removeAttribute('value');clearTimeout(record.timer);if(['complete','error'].includes(value.phase)||value.running===false){if(value.phase==='error')record.text.textContent+=' · '+(value.error||'Error');record.timer=setTimeout(()=>{record.box.remove();this.jobs.delete(id);},value.phase==='error'?12000:3500);}
 }
};
for(const event of ['extensionDownloadProgress','extensionGalleryProgress','runtimeProgress','packProgress'])onNative(event,value=>StudioDownloads.update(value));
