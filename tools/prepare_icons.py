"""Vendor the selected Lucide SVGs and equivalent Android VectorDrawables, with provenance."""
import concurrent.futures,hashlib,json,pathlib,re,urllib.request,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
names=['files','folder','search','list-tree','settings','play','square','hammer','terminal','plus','refresh-cw','text-align-start','trash','chevron-down','x','circle-question-mark','command','menu','check','arrow-left','arrow-down','arrow-up','arrow-right','undo-2','redo-2','copy','clipboard-paste','scissors','keyboard','bug','git-branch','braces','parentheses','brackets','code-xml','file-cog','triangle-alert','circle-x','info','circle-check','chevron-right','ellipsis-vertical','file-code','file-text','pause','corner-down-left','step-forward','arrow-down-to-line','arrow-up-from-line','folder-open','loader-circle']
lock=ROOT/'icons.lock.json'
sha=json.loads(lock.read_text())['commit'] if lock.exists() else json.load(urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/lucide-icons/lucide/commits/main',headers={'User-Agent':'GCC-Cpp-Studio-build'})))['sha']
base=f'https://raw.githubusercontent.com/lucide-icons/lucide/{sha}/'
dest=ROOT/'app/src/main/assets/ui/icons';dest.mkdir(parents=True,exist_ok=True)
res=ROOT/'app/src/main/res/drawable';res.mkdir(parents=True,exist_ok=True)
def fetch(name):
    data=urllib.request.urlopen(base+'icons/'+name+'.svg').read();(dest/(name+'.svg')).write_bytes(data)
    paths=[]
    for e in ET.fromstring(data):
        tag=e.tag.split('}')[-1];a=e.attrib;d=''
        if tag=='path':d=a['d']
        elif tag=='line':d=f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}"
        elif tag in ('polyline','polygon'):d='M'+a['points']+('Z' if tag=='polygon' else '')
        elif tag=='circle':
            x,y,r=map(float,[a['cx'],a['cy'],a['r']]);d=f'M{x-r} {y}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0'
        elif tag=='rect':
            x,y,w,h=map(float,[a.get('x',0),a.get('y',0),a['width'],a['height']]);r=float(a.get('rx',0));d=f'M{x+r} {y}h{w-2*r}q{r} 0 {r} {r}v{h-2*r}q0 {r} {-r} {r}h{-w+2*r}q{-r} 0 {-r} {-r}v{-h+2*r}q0 {-r} {r} {-r}Z'
        if d:paths.append(f'<path android:pathData="{d}" android:fillColor="@android:color/transparent" android:strokeColor="#BCBEC4" android:strokeWidth="1.8" android:strokeLineCap="round" android:strokeLineJoin="round"/>')
    (res/('ic_'+name.replace('-','_')+'.xml')).write_text('<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">'+''.join(paths)+'</vector>\n',encoding='utf-8')
    return name,hashlib.sha256(data).hexdigest()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:hashes=dict(pool.map(fetch,names))
(ROOT/'licenses/lucide-LICENSE').write_bytes(urllib.request.urlopen(base+'LICENSE').read())
lock.write_text(json.dumps({'repository':'https://github.com/lucide-icons/lucide','commit':sha,'files':hashes},indent=2)+'\n',encoding='utf-8')
print('Prepared',len(hashes),'SVGs and Android vectors from',sha)
(ROOT/'app/src/main/assets/ui/icons.js').write_text("'use strict';\nconst STUDIO_ICONS="+json.dumps({name:(dest/(name+'.svg')).read_text().replace('stroke-width="2"','stroke-width="1.7"').replace('width="24"','width="24" aria-hidden="true"') for name in names})+';\n',encoding='utf-8')
