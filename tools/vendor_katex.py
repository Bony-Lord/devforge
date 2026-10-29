"""Prepare the optional KaTeX library; verify npm integrity before copying files."""
from pathlib import Path
import base64,hashlib,io,json,tarfile,urllib.request
root=Path(__file__).resolve().parents[1]
version='0.19.1'
metadata=json.load(urllib.request.urlopen('https://registry.npmjs.org/katex/'+version,timeout=30))
archive=urllib.request.urlopen(metadata['dist']['tarball'],timeout=60).read()
algorithm,expected=metadata['dist']['integrity'].split('-',1)
assert algorithm=='sha512' and base64.b64encode(hashlib.sha512(archive).digest()).decode()==expected
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
    for source,target in [('package/dist/katex.min.js','app/src/main/assets/ui/vendor/katex.min.js'),('package/LICENSE','licenses/KaTeX-LICENSE')]:
        payload=tar.extractfile(source).read()
        destination=root/target;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(payload)
        print(json.dumps({'file':target,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}))
(root/'licenses/katex-origin.json').write_text(json.dumps({'version':version,'tarball':metadata['dist']['tarball'],'integrity':metadata['dist']['integrity'],'upstream':'https://github.com/KaTeX/KaTeX','license':'MIT','output':'MathML; browser native math layout, no external fonts'},indent=2)+'\n',encoding='utf-8')
