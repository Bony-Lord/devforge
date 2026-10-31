import {upstreamPatches} from './upstream-patches.js';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({base:'./',plugins:[upstreamPatches()],build:{outDir:path.resolve(here,'../../app/src/main/assets/ui/vendor/codeoss'),emptyOutDir:true,target:'es2022',minify:false,cssCodeSplit:false,assetsInlineLimit:0,manifest:true,rollupOptions:{input:{codeoss:path.join(here,'entry.js'),ru:path.join(here,'localization-ru.js')},preserveEntrySignatures:'strict',output:{entryFileNames:'[name].js',assetFileNames:'assets/[name]-[hash][extname]'}}},worker:{format:'es'},resolve:{alias:{'devforge-terminal-cache-browser':path.join(here,'terminal-cache-browser.js')},dedupe:['@codingame/monaco-vscode-api','@codingame/monaco-vscode-editor-api','@codingame/monaco-vscode-extension-api']},server:{fs:{allow:[here]}}});
