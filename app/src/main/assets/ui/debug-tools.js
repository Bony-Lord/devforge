/* Loaded by the Debug host only. Release does not serve or package this file. */
(()=>{
 if(window.StudioDesktop?.buildChannel!=='debug')return;
 document.addEventListener('keydown',event=>{if(event.key==='F12'||event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='i'){event.preventDefault();event.stopImmediatePropagation();native('debugTools',{action:'devtools'}).catch(safeError);}},true);
 window.addEventListener('error',event=>native('debugFault',{kind:'error',message:String(event.error?.stack||event.message).slice(0,8192)}).catch(()=>{}));
 window.addEventListener('unhandledrejection',event=>native('debugFault',{kind:'unhandled-rejection',message:String(event.reason?.stack||event.reason).slice(0,8192)}).catch(()=>{}));
 function init(){
  const anchor=document.getElementById('settingsButton');if(!anchor)return;
  const button=document.createElement('button');button.id='debugToolsButton';button.className=anchor.className;button.textContent='Debug';button.title='DevTools · F12';button.setAttribute('aria-label','Debug');button.dataset.noI18n='';anchor.before(button);
  button.onclick=()=>native('debugTools',{action:'menu',language:window.forge?.settings?.language||'ru'}).catch(safeError);
  let elapsed=0;const observe=setInterval(()=>{if(window.forge?.startupComplete){clearInterval(observe);native('debugReady',{elapsedMs:Math.round(performance.now()),domNodes:document.getElementsByTagName('*').length}).catch(safeError);}else if((elapsed+=250)>120000)clearInterval(observe);},250);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
