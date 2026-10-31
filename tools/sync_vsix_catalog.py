"""Keep the removable VSX addon and its reviewed source in sync (no downloads)."""
import json
from pathlib import Path

ui = Path(__file__).resolve().parents[1] / 'app/src/main/assets/ui'
catalog = ui / 'addons/catalog.json'
packages = json.loads(catalog.read_text(encoding='utf-8'))
package = next(p for p in packages if p['manifest']['id'] == 'studio.vsix')
keys = ['openExternalGallery', 'galleryAddonId', 'galleryIcon', 'renderExternalGallery']
package['module'] = (
    'const previous={};for(const key of ' + json.dumps(keys)
    + ')previous[key]=StudioAddons.prototype[key];\n'
    + (ui / 'extension-gallery.js').read_text(encoding='utf-8')
    + "\nconst installed=Object.fromEntries(Object.keys(previous).map(key=>[key,StudioAddons.prototype[key]]));\n"
    + "api.commands.register('open',api.raw.application.settings.language==='ru'?'Open VSX: расширения':'Open VSX: extensions',()=>api.raw.application.addons.openExternalGallery());\n"
    + "api.use(()=>{const addons=api.raw.application.addons;addons.externalGallery=false;addons.galleryIcons?.clear();for(const[key,value]of Object.entries(previous)){if(StudioAddons.prototype[key]!==installed[key])continue;if(value)StudioAddons.prototype[key]=value;else delete StudioAddons.prototype[key];}addons.render();});\n"
)
catalog.write_text(json.dumps(packages, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
