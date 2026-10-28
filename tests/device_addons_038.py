"""Addon SDK and keyboard integration on an explicitly owned input-check fixture."""
import argparse,json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device,ADB
p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--report',required=True);args=p.parse_args();assert args.project.startswith('input-check-');d=Device();checks=[]
def js(s):return d.evaluate(s)
def check(name,evidence,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':evidence});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(evidence)
def restart():
 global d
 d.close();subprocess.run([ADB,'shell','am','force-stop','com.forgex'],check=True,capture_output=True);subprocess.run([ADB,'shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity'],check=True,capture_output=True);d=Device();js('forge.addons.ready')
def key(code,action=0,meta=0):return js('native("editorTestHardwareKey",'+json.dumps({'key':code,'action':action,'meta':meta})+')')
try:
 assert js('forge.state.project')==args.project;js("(async()=>{await forge.addons.ready;await forge.addons.apply([]);await forge.changeSettings({keyboardPrimary:'system',altShiftLayout:true});await forge.openFile(forge.state.root+'/main.cpp');})()")
 base=js("({commands:forge.commands.length,line:getComputedStyle(document.body).getPropertyValue('--line')})")
 js("Promise.all([forge.addons.toggle('studio.navigation'),forge.addons.toggle('studio.contrast')])")
 result=js("({status:forge.addons.manager.status(),commands:forge.commands.length,line:getComputedStyle(document.body).getPropertyValue('--line')})")
 check('Concurrent toggles preserve both addons and add commands/theme',result,len(result['status']['active'])==2 and result['commands']==base['commands']+2 and result['line']!=base['line'])
 js('forge.registerCommands();forge.registerCommands()');check('Command refresh does not duplicate addon actions',js('forge.commands.length'),js('forge.commands.length')==base['commands']+2)
 restart();result=js('forge.addons.manager.status()');check('Addon profile survives cold launch with a new asset-server origin',result,len(result['active'])==2)
 js("forge.addons.apply(forge.addons.profile,true)");result=js('forge.addons.manager.status()');check('Safe mode disposes extensions and retains requested profile',result,len(result['active'])==0 and len(result['requested'])==2)
 js("forge.addons.apply(forge.addons.profile,false)");js("native('addonStateCommit',{schemaVersion:1,requested:forge.addons.profile,safeMode:false,activating:true})");restart();result=js('forge.addons.manager.status()');check('Interrupted activation boots into recovery',result,result['safeMode']and len(result['active'])==0 and len(result['requested'])==2)
 js('forge.addons.apply([],false)');result=js("({commands:forge.commands.length,line:getComputedStyle(document.body).getPropertyValue('--line'),entries:forge.addons.registry.entries.size})");check('Disable restores original UI and clears contributions',result,result['commands']==base['commands']and result['line']==base['line']and result['entries']==0)
 js("forge.addons.open()");result=js("(()=>{const d=document.querySelector('#addonsDialog'),r=d.getBoundingClientRect();return {open:d.open,rows:d.querySelectorAll('[data-addon]').length,inside:r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};})()");check('Compact addon manager stays inside viewport',result,result['open']and result['rows']==2 and result['inside']);js("document.querySelector('#addonsDialog').close()")
 # Exercise the real Activity dispatch path with synthesized keyboard device events.
 js("(async()=>{forge.active.model.setValue('');await NativeEditing.sync();await forge.editor.focus();})()")
 key(45);key(45,1);key(57,0,2);key(59,0,3);key(59,1,2);key(57,1);key(45);key(45,1)
 value=js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()');check('Alt+Shift changes hardware key Q from q to Cyrillic й',value,value=='qй')
 key(57,0,2);key(59,0,3);key(59,1,2);key(57,1);key(45);key(45,1)
 value=js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()');check('Second Alt+Shift returns to Latin input',value,value=='qйq')
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating',keyboardModifiers:'sticky',keyboardLayout:'pc'});await native('keyboard');})()");time.sleep(.25)
 def tap(action):
  s=js("native('editorTestFloatingKeyboard')");k=next(k for k in s['keys']if k['action']==action);subprocess.run([ADB,'shell','input','tap',str(round(k['x']+k['width']/2)),str(round(k['y']+k['height']/2))],check=True,capture_output=True);time.sleep(.08)
 before=js("native('editorTestFloatingKeyboard').then(s=>s.russian)");tap('alt');tap('shift');after=js("native('editorTestFloatingKeyboard').then(s=>s.russian)");check('Alt+Shift also switches the built-in PC keyboard',{'before':before,'after':after},before!=after)
finally:
 try:js("(async()=>{await forge.addons.apply([]);await forge.saveAll();})()")
 except Exception:pass
 d.close();path=pathlib.Path(args.report);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2),encoding='utf-8')
