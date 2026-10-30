'use strict';
// Original interface glyphs. Shape as well as color identifies each tool.
for(const[name,paths]of Object.entries({
 'arrow-down':'<path d="M12 3v18m-7-7 7 7 7-7"/>',
 'pencil':'<path d="M4 15l11-11 5 5L9 20l-6 1zM13 6l5 5M4 15l5 5"/>',
 'save':'<path d="M4 3h13l4 4v14H3V3zm3 0v6h10V3M7 21v-8h10v8M14 4v3"/>',
 'studio-motion':'<path d="M3 7h8M2 12h5m-4 5h8M14 5l7 7-7 7m-4-7h11"/>',
 'book-open':'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1zm0 0v15M5 8h4m-4 4h4m6-4h4m-4 4h4"/>',
 'palette':'<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4 2 2 0 0 1 1-4h2a3 3 0 0 0 3-3c0-4-4-7-9-7Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="6" cy="15" r="1"/>',
 'studio-python':'<path d="M12 3H8a3 3 0 0 0-3 3v3h9v3H6a3 3 0 0 0-3 3v1h5m4 5h4a3 3 0 0 0 3-3v-3h-9v-3h8a3 3 0 0 0 3-3V8h-5"/><circle cx="9" cy="6" r=".7" fill="currentColor"/><circle cx="15" cy="18" r=".7" fill="currentColor"/>',
 'studio-notebook':'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4m3-10h7m-7 4 2 2-2 2m4 0h3"/>',
 'lightbulb':'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
 'sliders-horizontal':'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11M8 3v6m6 0v6M6 15v6"/>',
 'panels-top-left':'<rect x="2" y="3" width="15" height="13" rx="1"/><rect x="7" y="8" width="15" height="13" rx="1"/><path d="M7 12h15"/>',
 'blocks':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M17 2v8m-4-4h8"/>',
 'list-minus':'<path d="M8 5h13M8 11h13M8 17h7M3 5h.01M3 11h.01M3 17h.01m14 3h6"/>',
 'shield':'<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="M8 12l3 3 5-6"/>',
 'file-plus':'<path d="M14 3H5v18h14V8zM14 3v5h5M8 14h8m-4-4v8"/>',

 'studio-run-settings':'<path d="M3 4l7 5-7 5zM13 5h8m-8 6h8m-8 6h8"/><circle cx="16" cy="5" r="1.5"/><circle cx="19" cy="11" r="1.5"/><circle cx="15" cy="17" r="1.5"/>',
 'folder-cog':'<path d="M3 7V4h7l2 3h9v5M3 7v13h8"/><circle cx="17" cy="17" r="3"/><path d="M17 12v2m0 6v2m5-5h-2m-6 0h-2m1.5-3.5 1.4 1.4m4.2 4.2 1.4 1.4m0-7-1.4 1.4m-4.2 4.2-1.4 1.4"/>',
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

// Complete list/play glyph, contained inside the 24px viewBox.
STUDIO_ICONS["studio-run-settings"]=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h4M7 16h3"/><path d="m15 12 4 3-4 3z"/></svg>`;
