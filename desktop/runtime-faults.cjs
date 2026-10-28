'use strict';
/* Bounded, streaming parser. User output is always text, never markup or code. */
class RuntimeFaultParser {
  constructor(){this.reset();}
  reset(){this.tail='';this.tails={};this.lines=[];this.fault=null;this.frames=[];this.addresses=[];}
  feed(text,stream='stderr'){
    stream=stream==='stdout'?'stdout':'stderr';this.tail=this.tails[stream]||'';this.tail+=String(text).replace(/\x1b\[[0-9;]*m/g,'');
    let end;while((end=this.tail.indexOf('\n'))>=0){this.line(this.tail.slice(0,end).replace(/\r$/,''));this.tail=this.tail.slice(end+1);}
    if(this.tail.length>16384){this.line(this.tail.slice(0,16384));this.tail=this.tail.slice(-8192);}
    this.tails[stream]=this.tail;return this.fault;
  }
  flush(){for(const tail of Object.values(this.tails))if(tail)this.line(tail);this.tails={};this.tail='';return this.fault;}
  line(line){
    this.lines.push(line);if(this.lines.length>200)this.lines.shift();
    const record=/^\x1eCPPSTUDIO_FAULT:(\{.*\})$/.exec(line);
    if(record){try{const data=JSON.parse(record[1]);if(data.kind==='signal'&&Number.isInteger(data.signal)&&data.signal>0&&data.signal<128)this.signal(data.signal);}catch{}return;}
    const asan=/(?:ERROR|SUMMARY): (AddressSanitizer|LeakSanitizer|UndefinedBehaviorSanitizer):\s*(.+)/.exec(line);
    const ubsan=/^(.+?):(\d+):(\d+): runtime error:\s*(.+)/.exec(line);
    const assertion=/(?:Assertion .*failed|assertion .*failed|assertion .*failure|_LIBCPP_ASSERT|libc\+\+ Hardening assertion)/i.test(line);
    if(asan&&(!this.fault||this.fault.kind==='signal'))this.fault={kind:'sanitizer',title:asan[1]+': '+asan[2].replace(/\s+on address\b[\s\S]*$/,'').slice(0,240)};
    if(ubsan){if(!this.fault||this.fault.kind==='signal')this.fault={kind:'undefined',title:'UBSan: '+ubsan[4].slice(0,240)};this.addFrame({path:ubsan[1],line:Number(ubsan[2]),column:Number(ubsan[3])});}
    if(assertion&&(!this.fault||this.fault.kind==='signal'))this.fault={kind:'assertion',title:line.trim().slice(0,300)};
    if(/(?:terminate called after throwing|terminating (?:due to|with) uncaught exception)/.test(line)&&(!this.fault||this.fault.kind==='signal'))this.fault={kind:'exception',title:line.trim().slice(0,300)};
    if(this.fault){
      if(/^\s*what\(\):/.test(line))this.fault.detail=line.trim().slice(0,1000);
      // Greedy path deliberately handles Windows drive letters and spaces.
      const frame=/^\s*#(\d+)\s+(?:0x[\da-f]+\s+)?(?:in\s+)?(.*?)\s+((?:[A-Za-z]:[\\/]|\/|\.\.?[\\/]).*?):(\d+)(?::(\d+))?\s*$/.exec(line);
      if(frame)this.addFrame({level:Number(frame[1]),func:frame[2],path:frame[3],line:Number(frame[4]),column:Number(frame[5]||1)});
      const address=/^\s*#(\d+)\s+0x[\da-f]+\s+.*?\(([^()]+)\+(0x[\da-f]+)\)/i.exec(line);
      if(address&&this.addresses.length<64)this.addresses.push({level:Number(address[1]),path:address[2],offset:address[3]});
      const assertionLocation=/^(.+?):(\d+)(?::\d+)?:.*(?:assert|Assertion)/.exec(line);
      if(assertionLocation)this.addFrame({path:assertionLocation[1],line:Number(assertionLocation[2]),column:1});
    }
  }
  addFrame(frame){if(this.frames.length<80&&!this.frames.some(f=>f.path===frame.path&&f.line===frame.line&&f.func===frame.func))this.frames.push(frame);}
  signal(signal,description=''){
    const names={4:'SIGILL',6:'SIGABRT',7:'SIGBUS',8:'SIGFPE',9:'SIGKILL',11:'SIGSEGV',13:'SIGPIPE',15:'SIGTERM'};
    if(!this.fault)this.fault={kind:'signal',title:typeof signal==='string'?signal:(names[signal]||'Signal '+signal),detail:description};
    else this.fault.signal=typeof signal==='string'?signal:(names[signal]||String(signal));
    return this.fault;
  }
  stopped(data,frames){
    this.flush();this.signal(data['signal-name']||'Signal',data['signal-meaning']||'');
    if(this.fault.kind==='signal'&&(frames||[]).some(f=>/__glibcxx_assert_fail|__assert_fail|__assert2|__assert_rtn|__libcpp_verbose_abort/.test(f.func||'')))
      this.fault={kind:'assertion',title:'Нарушена проверка стандартной библиотеки',detail:data['signal-meaning']||''};
    this.frames=[];for(const frame of frames||[])if(frame.fullname&&frame.line)this.addFrame({path:frame.fullname,line:Number(frame.line),column:1,func:frame.func,level:frame.level});
    return this.fault;
  }
  report(){return this.lines.filter(l=>!l.startsWith('\x1eCPPSTUDIO_FAULT:')).join('\n').slice(-96000);}
}

if(typeof module!=='undefined')module.exports={RuntimeFaultParser};
if(typeof window!=='undefined'){
  class RuntimeDiagnostics {
    constructor(ide){
      this.ide=ide;this.parser=new RuntimeFaultParser();
      this.banner=document.createElement('section');this.banner.className='runtime-fault hidden';this.banner.setAttribute('aria-live','polite');
      this.banner.innerHTML='<div class="runtime-fault-heading"><span data-icon="triangle-alert"></span><strong></strong><button class="runtime-copy" data-icon="copy" title="Копировать подробности"></button><button class="runtime-dismiss" data-icon="x" title="Скрыть"></button></div><p></p><div class="runtime-frames"></div><details><summary>Подробности ошибки выполнения</summary><pre></pre></details>';
      this.banner.querySelector('.runtime-dismiss').onclick=()=>this.banner.classList.add('hidden');
      this.banner.querySelector('.runtime-copy').onclick=()=>this.copy().catch(safeError);
      $('#console').prepend(this.banner);
    }
    begin(id,debug=false){clearTimeout(this.timer);this.id=id;this.debug=debug;this.parser.reset();this.banner.classList.add('hidden');this.banner.querySelector('details').open=false;this.banner.querySelector('.runtime-frames').replaceChildren();}
    feed(event){if(event.id!==this.id||!['stderr','stdout'].includes(event.stream))return;this.parser.feed(event.text,event.stream);if(this.parser.fault)this.schedule();}
    schedule(){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.render();},60);}
    stopped(data,frames){
      this.parser.stopped(data,frames);
      this.render();
    }
    end(event){if(event.id!==this.id)return;this.parser.flush();if(this.parser.fault){this.render();this.symbolize().catch(console.warn);}}
    async symbolize(){const id=this.id,parser=this.parser;if(!parser.addresses.length)return;const frames=await native('runtimeSymbolize',{addresses:parser.addresses});if(id!==this.id||parser!==this.parser)return;for(const frame of frames||[])parser.addFrame(frame);this.render();}
    finishDebug(id){if(id!==this.id)return;this.debug=false;this.parser.flush();if(this.parser.fault)this.render();}
    render(){
      if(this.debug&&!this.ide.debugger?.paused)return;
      const fault=this.parser.fault;if(!fault)return;
      const home=this.debug?$('#debug'):$('#console');if(this.banner.parentElement!==home)home.insertBefore(this.banner,home.firstChild);
      const newlyVisible=this.banner.classList.contains('hidden');
      this.banner.classList.remove('hidden');this.banner.querySelector('strong').textContent=tr(fault.title);
      this.banner.querySelector('p').textContent=fault.detail||tr(this.debug?'Программа приостановлена на ошибке. Стек и переменные доступны ниже.':'Программа завершилась с ошибкой. Запустите отладку для просмотра стека и переменных.');
      this.banner.querySelector('pre').textContent=this.parser.report();
      const list=this.banner.querySelector('.runtime-frames');list.replaceChildren();
      const root=this.ide.state.root.replaceAll('\\','/').replace(/\/$/,'');
      const frames=this.parser.frames.map(f=>{let path=f.path.replaceAll('\\','/');if(!/^(?:[A-Za-z]:\/|\/)/.test(path))path=root+'/'+path;return{...f,path};});
      frames.sort((a,b)=>Number(pathWithin(b.path,root))-Number(pathWithin(a.path,root)));
      for(const f of frames.slice(0,24)){
        const b=document.createElement('button');b.className='runtime-frame';b.textContent=(f.func?f.func+' · ':'')+relative(f.path,root)+':'+f.line;
        b.onclick=async()=>{try{if(this.debug&&this.ide.debugger?.paused&&f.level!==undefined){await this.ide.debugger.command('-stack-select-frame '+Number(f.level));await this.ide.debugger.refresh({fullname:f.path,line:String(f.line)});}else await this.ide.openFile(f.path,{lineNumber:f.line,column:f.column||1});}catch(e){safeError(e);}};list.append(b);
      }
      if(newlyVisible){this.ide.showPanel(this.debug?'debug':'console');if($('#panel').getBoundingClientRect().height<240&&innerHeight>=600){document.documentElement.style.setProperty('--panel-height',Math.min(320,innerHeight*.45)+'px');this.ide.layoutEditors();}home.scrollTop=0;}
    }
    async copy(){
      const text=this.parser.fault.title+'\n'+(this.parser.fault.detail||'')+'\n'+this.parser.frames.map(f=>(f.func||'')+' '+f.path+':'+f.line).join('\n')+'\n\n'+this.parser.report();
      try{await native('clipboardWrite',{text});this.ide.toast('Подробности скопированы');return;}catch{}
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error(tr('Не удалось скопировать текст'));}
      this.ide.toast('Подробности скопированы');
    }
  }
  window.RuntimeDiagnostics=RuntimeDiagnostics;
}
