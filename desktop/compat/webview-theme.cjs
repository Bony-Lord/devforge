'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const marker='// DevForge: keep the embedded document canvas in the active workbench palette.';
function patch(source){
 const nextMarker='// DevForge: independent browser palette v3.';if(source.includes(nextMarker))return source;
 if(source.includes('// DevForge: independent browser palette v2.'))source=source.replace(/\s*\/\/ DevForge: independent browser palette v2\.[\s\S]*?(?=\n\s*if \(!document\))/, '');
 if(source.includes(marker))source=source.replace(/\s*\/\/ DevForge: keep the embedded document canvas[\s\S]*?(?=\n\s*if \(!document\))/, '');
 const needle='\t\tconst applyStyles = (document, body) => {';if(!source.includes(needle))throw Error('Pinned webview theme hook changed');
 return source.replace(needle,`
        ${nextMarker}
        let devforgeBrowserTheme = 'dark';
        const devforgeDocuments = new WeakMap();
        const devforgePalette = (doc) => {
            if (!doc?.body || !doc.defaultView) return;
            const dark = devforgeBrowserTheme !== 'light', bg = dark?'#202124':'#ffffff', fg = dark?'#d4d4d4':'#242424';
            const old = devforgeDocuments.get(doc);
            if (old && old.dark !== dark) { for (const [node,style] of old.styles) if(node.isConnected) node.setAttribute('style',style); old.observer.disconnect(); devforgeDocuments.delete(doc); }
            let record = devforgeDocuments.get(doc);
            if (!record) { record={dark,styles:new Map()}; devforgeDocuments.set(doc,record);let timer;record.observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>devforgePalette(doc),150);});record.observer.observe(doc.body,{childList:true,subtree:true}); }
            for (const node of [doc.documentElement,doc.body]) { node.style.setProperty('background-color',bg,'important'); node.style.setProperty('color',fg,'important');node.style.colorScheme=dark?'dark':'light'; }
            doc.body.classList.toggle('vscode-dark',dark);doc.body.classList.toggle('vscode-light',!dark);doc.body.dataset.vscodeThemeKind=dark?'vscode-dark':'vscode-light';
            const luminance=value=>{const match=value.match(/[\\d.]+/g);if(!match||match.length<3)return null;return {alpha:match.length>3?Number(match[3]):1,value:(Number(match[0])*.2126+Number(match[1])*.7152+Number(match[2])*.0722)/255};};
            for (const node of Array.from(doc.body.querySelectorAll('*')).slice(0,6000)) {
                if (['IMG','VIDEO','CANVAS','SVG','PATH'].includes(node.tagName))continue;
                const style=doc.defaultView.getComputedStyle(node),background=luminance(style.backgroundColor),color=luminance(style.color);let changes=[];
                if(background?.alpha>.5&&(dark?background.value>.65:background.value<.25))changes.push(['background-color',bg]);
                if(color&&(dark?color.value<.28:color.value>.72))changes.push(['color',fg]);
                if(changes.length){if(!record.styles.has(node))record.styles.set(node,node.getAttribute('style')||'');for(const[key,value]of changes)node.style.setProperty(key,value,'important');}
            }
            for(const node of record.styles.keys())if(!node.isConnected)record.styles.delete(node);
        };
        window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.type!=='devforge-browser-theme')return;devforgeBrowserTheme=event.data.theme==='light'?'light':'dark';for(const frame of document.querySelectorAll('iframe')){try{devforgePalette(frame.contentDocument);}catch{}}});
        const devforgeTranslations=new Map();
        window.addEventListener('message',event=>{
            if(event.source!==window.parent||!event.data?.type?.startsWith('devforge-translate-'))return;
            const data=event.data;
            if(data.type==='devforge-translate-restore'){for(const[node,value]of devforgeTranslations)if(node.isConnected&&node.data===value.translated)node.data=value.original;devforgeTranslations.clear();return;}
            if(data.type==='devforge-translate-collect'){
                const items=[];
                for(const frame of document.querySelectorAll('iframe')){try{const doc=frame.contentDocument;if(!doc?.body)continue;const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())&&items.length<60){const parent=node.parentElement,value=node.data.trim(),old=devforgeTranslations.get(node);if(!parent||parent.closest('script,style,pre,code,textarea,input,[contenteditable]')||!parent.checkVisibility()||value.length<2||value.length>1500||!/[a-zA-Z\\u0400-\\u04ff]/.test(value)||old&&node.data===old.translated)continue;items.push({node,text:value,original:node.data});}}catch{}}
                for(const[node]of devforgeTranslations)if(!node.isConnected)devforgeTranslations.delete(node);
                devforgeTranslations.pending={id:data.id,items};window.parent.postMessage({type:'devforge-translate-texts',id:data.id,texts:items.map(v=>v.text)},event.origin);return;
            }
            if(data.type==='devforge-translate-apply'){const pending=devforgeTranslations.pending;if(!pending||pending.id!==data.id||!Array.isArray(data.values))return;pending.items.forEach((item,index)=>{if(typeof data.values[index]!=='string'||!item.node.isConnected||item.node.data!==item.original)return;const translated=item.original.replace(item.text,data.values[index]);devforgeTranslations.set(item.node,{original:item.original,translated});item.node.data=translated;});devforgeTranslations.pending=null;}
        });
        ${needle.trim()}
            if (document?.body) setTimeout(()=>devforgePalette(document),0);`);
}
function updateCSP(source){const script=source.match(/<script[^>]*>([\s\S]*?)<\/script>/);if(!script||!source.includes('sha256-'))throw Error('Pinned webview preload CSP changed');const hash=require('node:crypto').createHash('sha256').update(script[1]).digest('base64');return source.replace(/sha256-[a-zA-Z0-9+/=]+/,'sha256-'+hash);}
async function prepare(root){const file=path.join(root,'node_modules/@codingame/monaco-vscode-view-common-service-override/service-override/viewCommon/vs/workbench/contrib/webview/browser/pre/index.html');const source=await fs.readFile(file,'utf8'),updated=updateCSP(patch(source));if(updated!==source)await fs.writeFile(file,updated);}
module.exports={patch,prepare,updateCSP};
