"""Build the optional translator package from its reviewed source, without downloads."""
import json
from pathlib import Path
ui=Path(__file__).resolve().parents[1]/'app/src/main/assets/ui'
file=ui/'addons/catalog.json'
packages=json.loads(file.read_text(encoding='utf-8'))
package={
 'format':'cppstudio.addon','formatVersion':1,
 'manifest':{'schemaVersion':1,'id':'studio.google-translate','version':'1.1.0',
 'api':{'min':'0.1.2','maxExclusive':'0.2.0'},
 'name':{'ru':'Google Translate','en':'Google Translate'},
 'description':{'ru':'Перевод текста и интерфейса внутри приложения; OCR Windows и изменяемая переводящая рамка с Live-режимом. Без ключа или с Cloud API.','en':'In-app text and interface translation, Windows OCR and a resizable live translation frame. Keyless Google or optional Cloud API.'},
 'publisher':'DevForge','license':'MIT','kind':'feature','scope':'application','platforms':['win32'],
 'capabilities':['extensions.full-access'],'dependencies':{},'conflicts':{},'interfaceTranslation':True,
 'configuration':{'provider':{'type':'string','default':'web','enum':['web','cloud'],'description':'Translation service / Сервис перевода'},'globalShortcut':{'type':'string','default':'CommandOrControl+Alt+T','description':'Global frame shortcut / Глобальная клавиша рамки'},'target':{'type':'string','default':'ru','description':'Translation language / Язык перевода'},'translateInterface':{'type':'boolean','default':False,'description':'Translate application interface / Переводить интерфейс приложения'}},
 'tags':['translation','google','screenshot','interface'],
 'readme':{'ru':'Текст и подписи переводятся прямо в приложении. Без ключа используется веб-сервис Google с его ограничениями доступности; Cloud API необязателен. Для снимков — локальный OCR Windows без загрузки моделей. Ctrl+Alt+T открывает выбор области; рамку можно перемещать и менять её размер. Live обновляет перевод не чаще раза в 2 секунды. В настройках доступны инструкция и прямые ссылки для Cloud API. Ключ хранится зашифрованным Windows. Машинный перевод может быть неточным. Код и содержимое файлов автоматически не отправляются.','en':'Text and interface labels are translated in the application. Keyless Google web translation is subject to availability; Cloud API is optional. Captures use local Windows OCR. Ctrl+Alt+T selects a region; move and resize the frame, or enable Live for updates at most every 2 seconds. Settings include Cloud setup instructions and direct links. Windows encrypts the key. Machine translation may be inaccurate. Code and file contents are excluded from automatic translation.'}},
 'contributions':[], 'module':(ui/'addons/google-translate.js').read_text(encoding='utf-8')}
packages=[p for p in packages if p['manifest']['id']!='studio.google-translate']+[package]
file.write_text(json.dumps(packages,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
