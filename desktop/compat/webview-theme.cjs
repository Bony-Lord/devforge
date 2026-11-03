'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const marker='// DevForge: keep the embedded document canvas in the active workbench palette.';
function patch(source){if(source.includes(marker))return source;const needle='\t\tconst applyStyles = (document, body) => {';if(!source.includes(needle))throw Error('Pinned webview theme hook changed');return source.replace(needle,needle+'\n\t\t\t'+marker+`\n            if (document?.documentElement) {
                const dark = !['vscode-light','vscode-high-contrast-light'].includes(initData.activeTheme);
                for (const element of [document.documentElement, body].filter(Boolean)) {
                    element.style.setProperty('background-color', 'var(--vscode-editor-background, '+(dark?'#1e1e1e':'#ffffff')+')', 'important');
                    element.style.setProperty('color', 'var(--vscode-editor-foreground, '+(dark?'#d4d4d4':'#333333')+')', 'important');
                    element.style.setProperty('color-scheme', dark?'dark':'light');
                }
            }`);}
function updateCSP(source){const script=source.match(/<script[^>]*>([\s\S]*?)<\/script>/);if(!script||!source.includes('sha256-'))throw Error('Pinned webview preload CSP changed');const hash=require('node:crypto').createHash('sha256').update(script[1]).digest('base64');return source.replace(/sha256-[a-zA-Z0-9+/=]+/,'sha256-'+hash);}
async function prepare(root){const file=path.join(root,'node_modules/@codingame/monaco-vscode-view-common-service-override/service-override/viewCommon/vs/workbench/contrib/webview/browser/pre/index.html');const source=await fs.readFile(file,'utf8'),updated=updateCSP(patch(source));if(updated!==source)await fs.writeFile(file,updated);}
module.exports={patch,prepare,updateCSP};
