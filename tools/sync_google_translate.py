"""Build the optional translator package from its reviewed source, without downloads."""
import json
from pathlib import Path
ui=Path(__file__).resolve().parents[1]/'app/src/main/assets/ui'
file=ui/'addons/catalog.json'
packages=json.loads(file.read_text(encoding='utf-8'))
package={
 'format':'cppstudio.addon','formatVersion':1,
 'manifest':{'schemaVersion':1,'id':'studio.google-translate','version':'1.0.0',
 'api':{'min':'0.1.2','maxExclusive':'0.2.0'},
 'name':{'ru':'Google Translate','en':'Google Translate'},
 'description':{'ru':'Перевод выделенного текста и снимков окна без ключа через сайт Google. Перевод подписей интерфейса через дополнительный Cloud API.','en':'Translate selected text and window captures without a key through Google. Optional Cloud API for interface labels.'},
 'publisher':'DevForge','license':'MIT','kind':'feature','scope':'application','platforms':['win32'],
 'capabilities':['extensions.full-access'],'dependencies':{},'conflicts':{},'interfaceTranslation':True,
 'configuration':{'target':{'type':'string','default':'ru','description':'Translation language / Язык перевода'},'translateInterface':{'type':'boolean','default':False,'description':'Translate interface using Cloud API; may incur charges / Переводить интерфейс через Cloud API; возможна оплата'}},
 'tags':['translation','google','screenshot','interface'],
 'readme':{'ru':'Google Translate: текст и снимки через официальный сайт без ключа. Сначала просмотрите снимок, затем нажмите перевод. Если Google не принял автоматическую загрузку, нажмите «Показать файл снимка» и загрузите PNG вручную. Автоматический перевод подписей приложения требует дополнительного Cloud Translation API key. Ключ хранится зашифрованным в Windows. Машинный перевод может быть неточным. Код и содержимое файлов не переводятся автоматически.','en':'Text and captures use the Google Translate website without an API key. Preview the capture before sending. If automatic upload is unavailable, use Show capture file and upload the PNG manually. Automatic application labels require an optional Cloud Translation API key, encrypted by Windows. Machine translation may be inaccurate. Code and file contents are excluded from automatic translation.'}},
 'contributions':[], 'module':(ui/'addons/google-translate.js').read_text(encoding='utf-8')}
packages=[p for p in packages if p['manifest']['id']!='studio.google-translate']+[package]
file.write_text(json.dumps(packages,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
