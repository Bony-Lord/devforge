import json,pathlib,subprocess,sys,time,xml.etree.ElementTree as ET,re
source=pathlib.Path(__file__).resolve().parents[1];root=source;sys.path.insert(0,str(source/'tools'))
from device_cdp import Device,ADB
(source/'work').mkdir(exist_ok=True);d=Device();report={'device':'realme RMX3951 / Android 16','keyboard':'Yandex Keyboard, actual screen taps','results':[]}
def adb(*args):return subprocess.check_output([ADB,*map(str,args)])
def check(name,passed,evidence):
 report['results'].append({'test':name,'passed':bool(passed),'evidence':evidence});print('PASS' if passed else 'FAIL',name,flush=True)
def evaluate(s):return d.evaluate(s)
def text():return evaluate('forge.active.model.getValue()')
def settle():
 previous=None;equal=0
 for _ in range(30):
  g=evaluate('forge.keyboardGeometry?.height||0')
  equal=equal+1 if g==previous and g>0 else 0;previous=g
  if equal>=4:return
  time.sleep(.06)
def waittext(predicate):
 for _ in range(50):
  value=text()
  if predicate(value):return value
  time.sleep(.025)
 return value
def settext(s):
 evaluate("(async()=>{await NativeEditing.sync();forge.active.model.setValue("+json.dumps(s)+");await NativeEditing.sync();forge.editor.setPosition(forge.active.model.getPositionAt(forge.active.model.getValueLength()));forge.editor.focus();await native('keyboard');return forge.active.path;})()")
 settle();time.sleep(.08)
 assert text()==s,(len(text()),len(s))
try:
 assert 'input-check-' in evaluate('forge.state.project')
 settext('');commits=[]
 for _ in range(3):
  for x,y in [(220,1960),(488,1825),(330,1960),(540,2270)]:adb('shell','input','tap',x,y)
  time.sleep(.35);commits.append(text())
 check('Actual Yandex keys keep std lowercase after spaces',commits==['std ','std std ','std std std '],{'committedText':commits})
 settext('');times=[]
 for x,letter in [(60,'q'),(165,'w'),(270,'e'),(380,'r'),(488,'t'),(590,'y')]:
  start=time.perf_counter();previous=text();adb('shell','input','tap',x,1825);current=waittext(lambda s:s!=previous);times.append(round((time.perf_counter()-start)*1000,1))
 check('Characters arrive before space/composition finish',current=='qwerty',{'text':current,'tap_to_shadow_upper_bound_ms':times})
 info=adb('shell','dumpsys','input_method').decode('utf-8','replace');types=re.findall(r'inputType=0x([a-f0-9]+)',info);check('IME requests no suggestions and no autocorrect',any((int(v,16)&0x80000) and not(int(v,16)&0x8000) for v in types),{'inputTypes':list(dict.fromkeys(types))[:5]})
 settext('fast_delete_word '*25);before=len(text());adb('shell','input','swipe',1000,2130,1000,2130,1800);after=waittext(lambda s:len(s)<before-10);check('Holding keyboard Backspace repeatedly deletes text',len(after)<before-10,{'before':before,'after':len(after)})
 settext('alpha beta gamma\nsecond line\n');evaluate("forge.editor.setPosition({lineNumber:1,column:1});forge.editor.focus()")
 adb('shell','input','swipe',245,590,245,590,850)
 selection=evaluate('forge.editor.getSelection()');check('Long press selects a word with native selection',selection['endColumn']>selection['startColumn'] or selection['endLineNumber']>selection['startLineNumber'],selection)
 adb('shell','uiautomator','dump','/sdcard/studio-selection.xml');xml=adb('shell','cat','/sdcard/studio-selection.xml').decode('utf-8');(root/'work/native-selection.xml').write_text(xml,encoding='utf-8')
 (root/'work/native-selection.png').write_bytes(adb('exec-out','screencap','-p'))
 print('SELECTION_NODES',[(e.get('text'),e.get('content-desc'),e.get('bounds')) for e in ET.fromstring(xml).iter('node') if e.get('content-desc') or e.get('text')],flush=True)
 # Selection navigation uses the same native view as an external keyboard.
 adb('shell','input','keycombination',113,31)
 evaluate("forge.editor.setPosition({lineNumber:2,column:1});forge.editor.focus()")
 adb('shell','input','keycombination',113,50)
 result=waittext(lambda s:s!='alpha beta gamma\nsecond line\n');check('Hardware clipboard copy/paste reaches native text',result=='alpha beta gamma\nbetasecond line\n',result)
 evaluate('forge.saveAll()');saved=evaluate("native('read',{path:forge.active.path}).then(x=>x.text)");check('Disk, visible native buffer and LSP shadow stay in sync',saved==text(),{'savedLength':len(saved),'shadowLength':len(text())})
finally:
 report['passed']=sum(r['passed'] for r in report['results']);report['total']=len(report['results']);(source/'verification-native-input.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');d.close()
