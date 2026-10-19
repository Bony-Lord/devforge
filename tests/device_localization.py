import json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'tools'))
from device_cdp import Device,ADB
def connect():
 for n in range(25):
  try:
   (root/'work').mkdir(exist_ok=True);d=Device()
   if d.evaluate('!!window.forge'):return d
   d.close()
  except Exception:pass
  time.sleep(.15)
 raise RuntimeError('IDE did not restart')
def restart():
 subprocess.run([ADB,'shell','am','force-stop','com.forgex'],check=True,capture_output=True);subprocess.run([ADB,'shell','am','start','-n','com.forgex/dev.forge.ide.MainActivity'],check=True,capture_output=True);return connect()
results=[];d=connect()
try:
 for locale in ['en','ru']:
  d.evaluate("(async()=>{await forge.saveAll();forge.settings.language="+json.dumps(locale)+";await native('settings',forge.settings);await forge.persistSession();return true;})()");d.close();d=restart()
  value=d.evaluate("(async()=>{forge.openSettings();await new Promise(r=>setTimeout(r,150));const walker=document.createTreeWalker(document.querySelector('#settingsDialog'),NodeFilter.SHOW_TEXT);let n,ru=[];while(n=walker.nextNode())if(/[А-Яа-яЁё]/.test(n.data)&&n.parentElement.tagName!=='OPTION'&&!n.parentElement.closest('[data-no-i18n]'))ru.push(n.data.trim());document.querySelector('#settingsDialog').close();return {locale:StudioI18n.locale,stored:forge.settings.language,html:document.documentElement.lang,russianSettings:ru};})()")
  passed=value['locale']==locale and value['stored']==locale and value['html']==locale and (locale=='ru' or not value['russianSettings']);results.append({'test':'Persist '+locale+' interface across Android process restart','passed':passed,'evidence':value});print(json.dumps(results[-1],ensure_ascii=False),flush=True)
finally:
 d.close();(root/'verification-localization.json').write_text(json.dumps({'results':results,'passed':sum(r['passed'] for r in results),'total':len(results)},ensure_ascii=False,indent=2),encoding='utf-8')
