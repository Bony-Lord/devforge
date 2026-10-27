"""Fetch exact MIT dockview-core bundle; no enterprise code or runtime network use."""
import urllib.request,json,tarfile,io,pathlib,hashlib,base64
ROOT=pathlib.Path(__file__).resolve().parents[1]
VERSION='8.3.1'
INTEGRITY='sha512-6Loais9hlIRo25sTQSWGWlgbPr22ddoLBzpGDFaTnocawnC45twp5f2S2WxUz5/HPa/a65I4yxKUqZa8xrcc5Q=='
url=f'https://registry.npmjs.org/dockview-core/-/dockview-core-{VERSION}.tgz'
raw=urllib.request.urlopen(url,timeout=60).read()
assert 'sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()==INTEGRITY
dest=ROOT/'app/src/main/assets/ui/vendor';dest.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz')as tar:
 original=tar.extractfile('package/dist/dockview-core.js').read()
 # 8.3.1 starts a tab/group docking drag on the first mouse move even when
 # the dedicated floating titlebar should only move the window. This cancels
 # the overlay's own move handler on Android's pointer backend. Shift+drag
 # remains an explicit dock gesture. Ordinary touch and mouse moves stay free.
 before='isCancelled: () => {\n\t\t\t\t\tif (!resolveDndCapabilities(this.accessor.options).pointer) return true;'
 after='isCancelled: (event) => {\n\t\t\t\t\tif (isFloating() && !event.shiftKey) return true;\n\t\t\t\t\tif (!resolveDndCapabilities(this.accessor.options).pointer) return true;'
 source=original.decode('utf-8');assert source.count(before)==1
 source=source.replace(before,after,1)
 # A MutableDisposable must remain reusable after a resize gesture ends.
 resize_before='const end = () => {\n\t\t\t\t\tmove.dispose();\n\t\t\t\t\tthis._onDidChangeEnd.fire();'
 resize_after=resize_before.replace('move.dispose()', 'move.clear()')
 assert source.count(resize_before)==1
 source=source.replace(resize_before,resize_after,1)
 # App-owned DOM event bridge to the documented Overlay.setBounds method.
 # This lets a live drag commit bounds without recreating the entire layout.
 bridge_before='this._element.className = "dv-resize-container";'
 bridge_after=bridge_before+'\n\t\t\tthis._element.addEventListener("studio-set-bounds", event => this.setBounds(event.detail));'
 assert source.count(bridge_before)==1
 bundle=source.replace(bridge_before,bridge_after,1).encode('utf-8')
 license=tar.extractfile('package/LICENCE.md').read()
 assert b'MIT License'in license
 (dest/'dockview-core.js').write_bytes(bundle)
 (ROOT/'licenses/dockview-LICENSE').write_bytes(license)
(ROOT/'dockview.lock.json').write_text(json.dumps({'name':'dockview-core','version':VERSION,'license':'MIT','source':url,'integrity':INTEGRITY,'upstreamBundleSha256':hashlib.sha256(original).hexdigest(),'localPatch':'Free pointer float moves; reusable resize listener; app event bridge for live Overlay.setBounds','bundle':'app/src/main/assets/ui/vendor/dockview-core.js','sha256':hashlib.sha256(bundle).hexdigest()},indent=2)+'\n',encoding='utf-8')
print('Vendored dockview-core',VERSION,len(bundle),'bytes')
