'use strict';
// Small native Windows distribution: WPF + pipe host. No browser UI payload.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(__dirname,'dist'),stage=path.join(dist,'payload');
const version='0.8.0-native.1';
async function copy(from,to){await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true});}
async function files(directory){const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);else throw Error('Unexpected link in package: '+file);}return result;}
function run(file,args){const result=spawnSync(file,args,{cwd:root,stdio:'inherit',windowsHide:true});if(result.status!==0)throw Error(file+' failed: '+result.status);}
function nsis(value){return value.replaceAll('$','$$').replaceAll('"','$\\"');}
async function main(){
 if(process.platform!=='win32')throw Error('Native packaging currently targets Windows only');
 await fs.mkdir(dist,{recursive:true});
 if(await fs.stat(stage).catch(()=>null)){
  const absolute=await fs.realpath(stage);if(absolute!==stage||!absolute.startsWith(dist+path.sep)||!await fs.stat(path.join(stage,'.devforge-native-payload')).catch(()=>null))throw Error('Refusing to replace an unowned staging directory');
  await fs.rm(absolute,{recursive:true,force:true});
 }
 await fs.mkdir(stage);await fs.writeFile(path.join(stage,'.devforge-native-payload'),version+'\n');
 run('dotnet',['publish',path.join(__dirname,'DevForge.Windows.csproj'),'--no-restore','-c','Release','--no-self-contained','-p:DebugType=None','-p:DebugSymbols=false','-o',stage,'--nologo','--verbosity','quiet']);
 // Only server modules; Electron bootstrap, browser editor and UI bundles stay out.
 const modules=['addons','archive','assets','debug-adapter','extension-gallery','host','notebook-budget','optional-assets','project-config','project-library','project-templates','project-watcher','python-environment','python-intelligence','python-runtimes','python-style','python','runtime-faults','tooling','vsix','window-store','workspace'];
 for(const name of modules)await copy(path.join(root,'desktop',name+'.cjs'),path.join(stage,'backend',name+'.cjs'));
 for(const name of ['native-services','native-debugger','output-buffer'])await copy(path.join(__dirname,name+'.cjs'),path.join(stage,'backend',name+'.cjs'));
 await copy(path.join(__dirname,'backend.cjs'),path.join(stage,'backend/native-host.cjs'));
 await fs.writeFile(path.join(stage,'backend/package.json'),JSON.stringify({name:'devforge-native-host',version,license:'MIT',private:true})+'\n');
 for(const name of ['addon-core','addon-packages','project-templates','project-policy','run-configurations','debugger'])await copy(path.join(root,'app/src/main/assets/ui',name+'.js'),path.join(stage,'backend/ui',name+'.js'));
 for(const name of (await fs.readdir(path.join(root,'app/src/main/assets/ui/addons'))).filter(n=>n.endsWith('.json')))await copy(path.join(root,'app/src/main/assets/ui/addons',name),path.join(stage,'backend/ui/addons',name));
 for(const name of (await fs.readdir(path.join(root,'app/src/main/assets/python'))).filter(n=>/\.(py|json)$/.test(n)))await copy(path.join(root,'app/src/main/assets/python',name),path.join(stage,'backend/python',name));
 for(const name of ['iconv-lite','safer-buffer','json5'])await copy(path.join(root,'desktop/node_modules',name),path.join(stage,'backend/node_modules',name));
 const runtime=JSON.parse(await fs.readFile(path.join(__dirname,'runtime.json'),'utf8'));
 const node=path.resolve(process.env.DEVFORGE_NODE_EXE||path.join(root,'work/native-080-20261030/runtime/node.exe'));
 const bytes=await fs.readFile(node);if(bytes.length!==runtime.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==runtime.sha256)throw Error('Node runtime does not match the pinned official checksum');
 await copy(node,path.join(stage,'runtime/node.exe'));
 await copy(path.join(__dirname,'licenses'),path.join(stage,'licenses'));await copy(path.join(root,'LICENSE'),path.join(stage,'LICENSE.txt'));
 await copy(path.join(__dirname,'README.md'),path.join(stage,'README.txt'));await copy(path.join(__dirname,'runtime.json'),path.join(stage,'runtime/runtime.json'));
 for(const name of ['AvalonEdit','AvalonDock','Markdig','Node'])if((await fs.stat(path.join(stage,'licenses',name+'-LICENSE.txt'))).size<500)throw Error('Missing third-party notice: '+name);
 const payload=await files(stage);let total=0;const manifest=[];
 for(const file of payload){const relative=path.relative(stage,file).replaceAll('\\','/');if(/(?:electron|chromium|webview2|chrome_elf|monaco|dockview|resources\.pak|icudtl\.dat|\.pdb$)/i.test(relative))throw Error('Browser/development payload prohibited: '+relative);const data=await fs.readFile(file);total+=data.length;manifest.push({path:relative,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
 await fs.writeFile(path.join(stage,'payload-manifest.json'),JSON.stringify({version,browser:false,framework:'Microsoft.WindowsDesktop.App 8+',runtime,bytes:total,files:manifest},null,2)+'\n');
 const smoke=spawnSync(path.join(stage,'runtime/node.exe'),['--test',path.join(__dirname,'backend.test.cjs')],{cwd:stage,stdio:'inherit',windowsHide:true,env:{...process.env,DEVFORGE_SOURCE_ROOT:stage,DEVFORGE_NATIVE_BACKEND:path.join(stage,'backend/native-host.cjs'),DEVFORGE_NATIVE_RUNTIME:'0',DEVFORGE_NATIVE_NETWORK:'0'}});
 if(smoke.status!==0)throw Error('Packaged backend smoke failed; installer will not be created');
 const compiler=process.env.DEVFORGE_MAKENSIS||path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe');
 const owned=(await files(stage)).map(f=>path.relative(stage,f).replaceAll('/','\\'));const directories=new Set();for(const file of owned){let d=path.dirname(file);while(d!=='.'){directories.add(d);d=path.dirname(d);}}
 const deleteFiles=owned.map(f=>' Delete "$INSTDIR\\'+nsis(f)+'"').join('\n');
 const deleteDirectories=[...directories].sort((a,b)=>b.length-a.length).map(d=>' RMDir "$INSTDIR\\'+nsis(d)+'"').join('\n');
 const uninstall=deleteFiles+'\n Delete "$INSTDIR\\Uninstall.exe"\n'+deleteDirectories+'\n RMDir "$INSTDIR"';
 let script=await fs.readFile(path.join(__dirname,'installer.nsi'),'utf8');
 script=script.replaceAll('@STAGE@',nsis(stage)).replaceAll('@ICON@',nsis(path.join(root,'desktop/icon.ico'))).replaceAll('@OUTPUT@',nsis(path.join(dist,'DevForge-Native-'+version+'-win-x64-Setup.exe'))).replace('@UNINSTALL_FILES@',uninstall);
 const generated=path.join(dist,'installer.nsi');await fs.writeFile(generated,script);run(compiler,['/V2',generated]);
 await fs.writeFile(path.join(dist,'package-report.json'),JSON.stringify({version,browser:false,payloadBytes:total,payloadFiles:manifest.length,installer:path.join(dist,'DevForge-Native-'+version+'-win-x64-Setup.exe')},null,2)+'\n');
 console.log(JSON.stringify({version,payloadBytes:total,payloadFiles:manifest.length,browser:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
