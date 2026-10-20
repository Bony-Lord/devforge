'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {zipDirectory}=require('./archive.cjs');
const {capture}=require('./tooling.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  const sources=path.join(__dirname,'dist','Cpp-Studio-desktop-native-sources-44.9.1.zip');
  await fs.access(sources).catch(()=>{throw Error('Prepare corresponding FFmpeg sources first: python tools/prepare_desktop_sources.py --output desktop/dist/Cpp-Studio-desktop-native-sources-44.9.1.zip');});
  const electronExe=require('electron'),dist=path.resolve(electronExe,process.platform==='darwin'?'../../..':'..');
  const output=path.join(__dirname,'dist','Cpp-Studio-'+process.platform+'-'+process.arch+'-1.0.0-rc.2');
  // A new unique destination avoids deleting an earlier release or user data.
  await fs.mkdir(output,{recursive:false});
  let appFolder;
  if(process.platform==='darwin'){
    const bundle=path.join(output,'C++ Studio.app');await fs.cp(dist,bundle,{recursive:true,verbatimSymlinks:true});appFolder=path.join(bundle,'Contents','Resources','app');
    const plist=path.join(bundle,'Contents','Info.plist');for(const [key,value]of Object.entries({CFBundleName:'C++ Studio',CFBundleDisplayName:'C++ Studio',CFBundleIdentifier:'dev.cppstudio.desktop',CFBundleVersion:'1.0.0-rc.2',CFBundleShortVersionString:'1.0.0'})){const r=await capture('/usr/libexec/PlistBuddy',['-c','Set :'+key+' '+value,plist]);if(r.code)throw Error(r.error);}
  }else{
    await fs.cp(dist,output,{recursive:true});await fs.rename(path.join(output,process.platform==='win32'?'electron.exe':'electron'),path.join(output,process.platform==='win32'?'CppStudio.exe':'cpp-studio'));appFolder=path.join(output,'resources','app');
  }
  await fs.mkdir(appFolder,{recursive:true});
  for(const file of ['smoke.cjs','icon.png','main.cjs','preload.cjs','host.cjs','workspace.cjs','tooling.cjs','project-config.cjs','debug-adapter.cjs','archive.cjs'])await fs.copyFile(path.join(__dirname,file),path.join(appFolder,file));
  const pkg=JSON.parse(await fs.readFile(path.join(__dirname,'package.json'),'utf8'));delete pkg.devDependencies;delete pkg.scripts;await fs.writeFile(path.join(appFolder,'package.json'),JSON.stringify(pkg,null,2));
  for(const name of ['iconv-lite','safer-buffer'])await fs.cp(path.join(__dirname,'node_modules',name),path.join(appFolder,'node_modules',name),{recursive:true});
  await fs.cp(path.join(root,'app/src/main/assets/ui'),path.join(appFolder,'ui'),{recursive:true});await fs.copyFile(path.join(root,'LICENSE'),path.join(appFolder,'LICENSE'));
  await fs.mkdir(path.join(output,'licenses'),{recursive:true});
  if(process.platform==='darwin')for(const name of ['LICENSE','LICENSES.chromium.html'])await fs.copyFile(path.join(path.dirname(dist),name),path.join(output,name));
  await fs.copyFile(path.join(__dirname,'THIRD_PARTY.md'),path.join(output,'THIRD_PARTY.md'));
  for(const name of ['monaco-LICENSE','monaco-ThirdPartyNotices.txt','lucide-LICENSE','yaml-LICENSE'])await fs.copyFile(path.join(root,'licenses',name),path.join(output,'licenses',name));
  for(const name of ['iconv-lite','safer-buffer'])await fs.copyFile(path.join(__dirname,'node_modules',name,'LICENSE'),path.join(output,'licenses',name+'-LICENSE'));
  const instructions='C++ Studio 1.0.0-rc.2\n\nInstall GCC or Clang, CMake, clangd and clang-format using your system package manager.\nFor debugging: GDB + gdbserver, or LLDB DAP (macOS/Linux). Select executable paths in Settings > Tools.\nProject files stay in ordinary folders. Native compilers are not included in this desktop archive.\n\nWindows: MSYS2 UCRT64/MINGW64 GCC and GDB, LLVM clangd/clang-format, CMake + Ninja.\nLinux: GCC/Clang + cmake + ninja-build + clangd + clang-format + gdb + gdbserver.\nmacOS: Xcode Command Line Tools + Homebrew LLVM (clangd/clang-format) + LLDB (lldb-dap) + CMake/Ninja.\n\nLinux: if the OS requires the SUID sandbox helper, configure only the bundled helper:\n  sudo chown root:root ./chrome-sandbox\n  sudo chmod 4755 ./chrome-sandbox\nThen run ./cpp-studio as your ordinary user. Keep the Chromium sandbox enabled.\n\nThis candidate is not signed/notarized for Windows/macOS distribution.\nhttps://github.com/Bony-Lord/gcc-cpp-studio\n';
  await fs.writeFile(path.join(output,'START-HERE.txt'),instructions);
  if(process.platform==='darwin'){const signed=await capture('/usr/bin/codesign',['--force','--deep','--sign','-','--preserve-metadata=entitlements,requirements,flags',path.join(output,'C++ Studio.app')]);if(signed.code)throw Error(signed.error);}
  const zip=output+'.zip',info=await zipDirectory(output,zip,{maxBytes:2*1024*1024*1024,preserveSymlinks:true}),hash=crypto.createHash('sha256');const handle=await fs.open(zip);for await(const bytes of handle.createReadStream())hash.update(bytes);const sha256=hash.digest('hex');await fs.writeFile(zip+'.sha256',sha256+'  '+path.basename(zip)+'\n');console.log(JSON.stringify({output,zip,sha256,...info}));
}
fs.mkdir(path.join(__dirname,'dist'),{recursive:true}).then(main).catch(error=>{console.error(error);process.exitCode=1;});
