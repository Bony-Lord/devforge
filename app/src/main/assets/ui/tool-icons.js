'use strict';
// Original interface glyphs. Shape as well as color identifies each tool.
for(const[name,paths]of Object.entries({
 'studio-console':'<path d="M4 5h16v14H4zM7 9l3 3-3 3m6 0h4"/>',
 'studio-terminal':'<path d="M3 7h18v13H3zM6 4h12M6 11l2 2-2 2m5 1h5"/>',
 'studio-problems':'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
 'studio-project':'<path d="M3 6h7l2 2h9v12H3zM3 6V4h7l2 2"/>',
 'studio-structure':'<path d="M5 4v14h5M5 8h5m4-3h6v6h-6zm0 10h6v6h-6z"/>',
 'studio-cmake':'<path d="M5 2h9l5 5v15H5zM14 2v6h5M9 12h6m-6 3h3m0 0v4m-3 0h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
 'studio-float':'<path d="M3 8v12h13M8 3h13v13H8zM8 7h13"/>',
 'studio-dock-left':'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M5 8h2m-2 4h2m-2 4h2"/>',
 'studio-dock-right':'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16m2-12h2m-2 4h2m-2 4h2"/>',
 'studio-dock-top':'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M7 7h10"/>',
 'studio-dock-bottom':'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 14h18M7 17h10"/>',
 'studio-keyboard-float':'<rect x="3" y="8" width="16" height="12" rx="2"/><path d="M7 12h1m3 0h1m3 0h1M7 16h7m1-12h6v6m0-6-4 4"/>',
 'studio-placement':'<path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/>'
}))STUDIO_ICONS[name]='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
