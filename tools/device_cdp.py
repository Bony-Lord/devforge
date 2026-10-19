"""Inspect/test our own debuggable Android WebView over an authorized ADB connection.

Requires websocket-client (pip install websocket-client). No external browser profile.
"""
import argparse, base64, json, os, pathlib, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parents[1]/'work/python'))
import websocket
ADB=os.environ.get('ADB',r'D:\ADB\adb.exe')

class Device:
    def __init__(self):
        pid=subprocess.check_output([ADB,'shell','pidof','com.forgex'],text=True).strip()
        subprocess.run([ADB,'forward','tcp:9222','localabstract:webview_devtools_remote_'+pid],check=True,capture_output=True)
        pages=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json',timeout=8))
        if not pages: raise RuntimeError('WebView is not ready')
        self.ws=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],timeout=90,suppress_origin=True)
        self.seq=0
    def call(self,method,params=None):
        self.seq+=1;seq=self.seq
        self.ws.send(json.dumps({'id':seq,'method':method,'params':params or {}}))
        while True:
            r=json.loads(self.ws.recv())
            if r.get('id')==seq:
                if 'error'in r:raise RuntimeError(r['error'])
                return r.get('result',{})
    def evaluate(self,expression):
        r=self.call('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True,'timeout':210000,'userGesture':True})
        if 'exceptionDetails'in r:raise RuntimeError(r['exceptionDetails'].get('exception',r['exceptionDetails']))
        return r.get('result',{}).get('value',r.get('result'))
    def screenshot(self,path):
        r=self.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
        pathlib.Path(path).parent.mkdir(parents=True,exist_ok=True)
        pathlib.Path(path).write_bytes(base64.b64decode(r['data']))
    def close(self):self.ws.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['eval','screenshot']);p.add_argument('value');args=p.parse_args()
    d=Device()
    try:
        if args.action=='eval':print(json.dumps(d.evaluate(args.value),ensure_ascii=False,indent=2))
        else:d.screenshot(args.value);print(args.value)
    finally:d.close()
