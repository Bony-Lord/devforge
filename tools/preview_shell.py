"""Synthetic browser preview of the UI shell. No native editor, IME, compiler or real project I/O.
Run locally and open http://127.0.0.1:8766/?language=en or language=ru.
"""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,urllib.parse
root=Path(__file__).resolve().parents[1]/'app/src/main/assets/ui'
js=r'''window.STUDIO_BOOT_LANGUAGE=__PREVIEW_LOCALE__;window.__previewErrors=[];window.addEventListener('error',e=>window.__previewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__previewErrors.push(String(e.reason)));const previewRoot='/fixture';const previewFiles={'main.cpp':'int main() { return 0; }\n','CMakeLists.txt':'cmake_minimum_required(VERSION 3.22)\nproject(app)\nadd_executable(app main.cpp)\n','.clang-format':'BasedOnStyle: LLVM\nIndentWidth: 4\nTabWidth: 4\nUseTab: Never\n'};const previewBuffers=new Map();window.ForgeNative={request(raw){const r=JSON.parse(raw),d=r.data||{};let value=true;switch(r.op){case'state':value={project:'ui-fixture',projects:['ui-fixture'],root:previewRoot,usr:'/usr',cache:'/cache',tree:Object.keys(previewFiles).map(name=>({name,path:previewRoot+'/'+name,dir:false,size:previewFiles[name].length})),settings:{},session:{},version:'0.2.0',abi:'preview'};break;case'read':value={path:d.path,text:previewFiles[d.path.split('/').pop()]||'',encoding:'UTF-8',readonly:false};break;case'formatterTypingConfig':value={indent:4,tab:4,continuation:4,tabs:false};break;case'formatterSchema':value={code:0,text:'IndentWidth: 4\nTabWidth: 4\nUseTab: Never\n'};break;case'formatterConfig':value={path:previewRoot+'/.clang-format',text:previewFiles['.clang-format'],defaults:previewFiles['.clang-format']};break;case'probe':value={preview:'Synthetic browser shell UI; native Android editor is not rendered here.'};break;case'cmakeCommands':value={code:0,text:'project\nadd_executable\n'};break;case'cmakeSources':value={configured:false,files:[],time:0};break;case'editorOpen':if(!d.uri){value=false;break;}if(!previewBuffers.has(d.uri))previewBuffers.set(d.uri,{uri:d.uri,text:d.text,revision:0});value=previewBuffers.get(d.uri);break;case'editorSnapshot':value=[];break;case'lspStart':value={root:previewRoot,usr:'/usr'};break;case'lspSend':if(d.message.id)setTimeout(()=>window.__nativeEvent('lsp',{id:d.message.id,result:d.message.method==='initialize'?{capabilities:{}}:[]}),1);break;}setTimeout(()=>window.__nativeResult({id:r.id,value}),0);}};'''
class Preview(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  query=urllib.parse.urlsplit(self.path)
  if query.path in ('/','/index.html'):
   language=urllib.parse.parse_qs(query.query).get('language',['ru'])[0]
   page=(root/'index.html').read_text(encoding='utf-8').replace('<head>','<head><script>'+js.replace('__PREVIEW_LOCALE__',json.dumps(language))+'</script>',1).encode('utf-8')
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(page)));self.end_headers();self.wfile.write(page)
  else:super().do_GET()
print('Synthetic shell preview on localhost:8766',flush=True)
ThreadingHTTPServer(('127.0.0.1',8766),Preview).serve_forever()

