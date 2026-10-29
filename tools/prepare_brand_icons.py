"""Package the approved raster master without changing its artwork."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'artwork/devforge-icon-master.png'
if __name__ == '__main__':
    with Image.open(MASTER) as source:
        assert source.mode == 'RGBA' and source.width == source.height
        assert source.getchannel('A').getextrema() == (0, 255)
        mark = source.resize((512, 512), Image.Resampling.LANCZOS)
    mark.save(ROOT / 'desktop/icon.png', optimize=True)
    mark.save(ROOT / 'desktop/icon.ico', sizes=[(n, n) for n in [16, 24, 32, 48, 64, 128, 256]])
    for relative, size in [('app/src/main/assets/ui/brand/devforge.png', 128), ('app/src/main/res/drawable-nodpi/devforge_mark.png', 512), ('docs/devforge-logo.png', 512)]:
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        mark.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
    print('DevForge raster master packaged as PNG and seven-size ICO')
