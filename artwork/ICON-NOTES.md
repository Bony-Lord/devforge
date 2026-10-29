# DevForge icon refinement

The user supplied the silver D/anvil, orange F and two flames on a dark tile.
The built-in imagegen tool edited that image on 2026-10-29; the master PNG keeps
its generated alpha. The outer photographic background and broad shadow were
removed, with restrained edge/lighting cleanup and the same visual identity.

`devforge-icon-master.png` is the square RGBA source. `tools/prepare_brand_icons.py`
only resizes/converts this source for desktop PNG/ICO, the UI header, Android
drawable and documentation. It does not regenerate or redraw the artwork.
Windows executables and the NSIS installer use all seven ICO sizes, 16–256 px.

## Final prompt (built-in edit, transparent background enabled)

Use case: precise-object-edit. Edit target: the attached DevForge application
icon. Make a restrained production-ready refinement of this exact icon, not a
new logo. Preserve its distinctive silver-white D integrated with an anvil, two
orange/yellow flame tongues, and orange-red F on a near-black rounded-square
tile. Preserve the overall silhouettes and composition extremely closely. Crop
away the entire outer dark photographic background and broad external shadow;
the rounded-square tile itself should fill almost the entire square canvas with
a narrow even 2% transparent safety margin. Outside the rounded-square tile must
be genuinely transparent alpha, with no checkerboard printed into the image.
Clean and sharpen curves, unify small bevels, subtly reduce excessive orange
bloom and metallic glare for legibility as a professional desktop/Android IDE
app icon, maintain clear dark separation between the D and F. Center and balance
the monogram, keep a dark charcoal/slightly blue tile, no extra text, no new
symbols, no watermark, no mockup, straight-on square icon. Keep the original
recognizable look; changes should feel like a polished crop with very light
finishing.
