import {upstreamPatches} from './upstream-patches.js';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url));
const {flavor}=createRequire(import.meta.url)('../build-flavor.cjs'),build=flavor(process.env.DEVFORGE_BUILD_CHANNEL||'release');
export const outputDirectory=build.debug?path.resolve(here,'../.cache/codeoss-debug'):path.resolve(here,'../../app/src/main/assets/ui/vendor/codeoss');
export default defineConfig({base:'./',plugins:[upstreamPatches()],build:{outDir:outputDirectory,emptyOutDir:true,target:'es2022',minify:build.debug?false:'oxc',sourcemap:build.sourceMaps,cssCodeSplit:false,assetsInlineLimit:0,manifest:true,rollupOptions:{keepNames:true,input:{codeoss:path.join(here,'entry.js'),ru:path.join(here,'localization-ru.js')},preserveEntrySignatures:'strict',output:{entryFileNames:'[name].js',assetFileNames:'assets/[name]-[hash][extname]'}}},worker:{format:'es'},resolve:{alias:{'devforge-native-overlay':path.join(here,'native-overlay.js'),'devforge-terminal-cache-browser':path.join(here,'terminal-cache-browser.js')},dedupe:['@codingame/monaco-vscode-api','@codingame/monaco-vscode-editor-api','@codingame/monaco-vscode-extension-api']},server:{fs:{allow:[here]}}});
