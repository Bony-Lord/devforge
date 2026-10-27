"""Exact cross-window tab index and float shrink, including fast release."""
import json,pathlib,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device
d=Device();checks=[]
def js(s):return d.evaluate(s)
def check(name,value,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:1800]
def mouse(t,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':t,'x':x,'y':y,'button':'none'if t=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
def rect(id):return js('forge.windows.api.getPanel('+json.dumps(id)+').group.element.querySelector(\'.studio-tool-tab[data-tool="'+id+'"]\').getBoundingClientRect().toJSON()')
try:
 assert js("forge.state.project==='input-check-workspace-035-20261027'")
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'system'});for(const doc of [...forge.tabs])await forge.closeTab(doc);forge.windows.reset();for(const letter of ['a','b','c','d']){const path=forge.state.root+'/tab-position-'+letter+'.cpp';await native('write',{path,text:'int '+letter+'() { return 0; }\\n'});await forge.openFile(path);}forge.windows.joinDocuments();})()");time.sleep(.4)
 ids=js("Object.fromEntries([...forge.windows.codeWindows.values()].filter(r=>r.path).map(r=>[r.path.match(/tab-position-(.)/)[1],r.id]))");source=ids['d']
 for position,before,expected in [('beginning','a',['d','a','b','c']),('middle','b',['a','d','b','c']),('end',None,['a','b','c','d'])]:
  js('forge.windows.floatPanel(forge.windows.api.getPanel('+json.dumps(source)+'),false);true');time.sleep(.35)
  a=rect(source);p={'x':a['x']+a['width']*.3,'y':a['y']+14};mouse('mousePressed',p['x'],p['y'],1)
  b=rect(ids[before or'c']);q={'x':b['x']+15 if before else b['right']+12,'y':b['y']+14}
  for n in range(1,7):mouse('mouseMoved',p['x']+(q['x']-p['x'])*n/6,p['y']+(q['y']-p['y'])*n/6,1);time.sleep(.02)
  time.sleep(.34);marker=js("(()=>{const e=document.querySelector('.studio-tab-insertion');return e?{before:e.dataset.before,width:e.getBoundingClientRect().width,ready:e.dataset.ready}:null})()");check('Tab insertion marker shows '+position,marker,marker and marker['before']==(ids.get(before)or'')and marker['width']<=6)
  mouse('mouseReleased',q['x'],q['y']);time.sleep(.35);order=js('forge.windows.api.getPanel('+json.dumps(ids['a'])+').group.panels.map(p=>p.api.getParameters().path.match(/tab-position-(.)/)[1])');check('Cross-window drop inserts at '+position,order,order==expected)
 # A cached old float size must not prevent shrinking on a new detach.
 js('forge.windows.place('+json.dumps(source)+',"right","screen");forge.windows.locations['+json.dumps(source)+']={width:1200,height:700};true');time.sleep(.35);old=js('forge.windows.api.getPanel('+json.dumps(source)+').group.element.getBoundingClientRect().toJSON()');js('forge.windows.floatPanel(forge.windows.api.getPanel('+json.dumps(source)+'));true');time.sleep(.4);new=js('forge.windows.api.getPanel('+json.dumps(source)+').group.element.closest(".dv-resize-container").getBoundingClientRect().toJSON()');check('Menu detach shrinks both axes despite an oversized saved float',{'old':old,'new':new},new['width']<old['width']*.9 and new['height']<old['height']*.9)
 js('forge.windows.place('+json.dumps(source)+',"right","screen");true');time.sleep(.35);old=js('forge.windows.api.getPanel('+json.dumps(source)+').group.element.getBoundingClientRect().toJSON()');b=rect(source);p={'x':b['x']+25,'y':b['y']+14};mouse('mousePressed',p['x'],p['y'],1);q={'x':700,'y':300};mouse('mouseMoved',q['x'],q['y'],1);mouse('mouseReleased',q['x'],q['y']);time.sleep(.6);new=js('forge.windows.api.getPanel('+json.dumps(source)+').group.element.closest(".dv-resize-container").getBoundingClientRect().toJSON()');check('Immediate release still finishes float shrink on both axes',{'old':old,'new':new},new['width']<old['width']*.9 and new['height']<old['height']*.9)
finally:
 try:js("(async()=>{for(const doc of [...forge.tabs])await forge.closeTab(doc);await forge.openFile(forge.state.root+'/main.cpp');forge.windows.reset();await forge.saveAll();})()")
 except Exception:pass
 d.close();(ROOT/'verification-tab-placement-035.json').write_text(json.dumps({'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2),encoding='utf-8')
