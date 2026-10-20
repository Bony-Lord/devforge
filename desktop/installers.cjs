'use strict';
// Wrap the already verified portable payload, including its original notices.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {build,Platform,Arch}=require('electron-builder');
const pkg=require('./package.json');
async function main(){
  const folder=path.join(__dirname,'dist',`Cpp-Studio-${process.platform}-${process.arch}-${pkg.version}`);
  await fs.access(folder);
  const output=path.join(__dirname,'dist','installers');await fs.mkdir(output,{recursive:true});
  const config={appId:'dev.cppstudio.desktop',productName:'C++ Studio',copyright:'Copyright (c) C++ Studio contributors',
    artifactName:'Cpp-Studio-'+pkg.version+'-${os}-${arch}-setup.${ext}',directories:{output,buildResources:__dirname},
    extraMetadata:{homepage:'https://github.com/Bony-Lord/gcc-cpp-studio',author:'C++ Studio contributors'},
    publish:null,electronVersion:require('./node_modules/electron/package.json').version,
    win:{executableName:'CppStudio',target:'nsis',signAndEditExecutable:false},
    nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'C++ Studio',runAfterFinish:false,deleteAppDataOnUninstall:false,installerLanguages:['en_US','ru_RU'],license:path.join(__dirname,'../LICENSE')},
    linux:{executableName:'cpp-studio',target:['deb'],category:'Development',maintainer:'C++ Studio contributors',synopsis:'Open C and C++ IDE',description:pkg.description,icon:path.join(__dirname,'icon.png')},
    deb:{depends:['libgtk-3-0','libnss3','libxss1','libxtst6','xdg-utils','libatspi2.0-0','libuuid1','libgbm1','libasound2 | libasound2t64'],recommends:['g++','cmake','ninja-build','clangd','clang-format','gdb','gdbserver']},
    mac:{target:['pkg'],identity:null,category:'public.app-category.developer-tools'},pkg:{installLocation:'/Applications',allowAnywhere:false,allowCurrentUserHome:true,allowRootDirectory:true}};
  const platform=process.platform==='win32'?Platform.WINDOWS:process.platform==='darwin'?Platform.MAC:Platform.LINUX;
  const artifacts=await build({projectDir:__dirname,prepackaged:process.platform==='darwin'?path.join(folder,'C++ Studio.app'):folder,targets:platform.createTarget(undefined,Arch[process.arch]),config});
  const manifest=[];for(const file of artifacts){const hash=crypto.createHash('sha256');for await(const bytes of (await fs.open(file)).createReadStream())hash.update(bytes);const sha256=hash.digest('hex');await fs.writeFile(file+'.sha256',sha256+'  '+path.basename(file)+'\n');manifest.push({file:path.basename(file),bytes:(await fs.stat(file)).size,sha256});}
  await fs.writeFile(path.join(output,'installers-'+process.platform+'.json'),JSON.stringify({version:pkg.version,artifacts:manifest},null,2)+'\n');console.log(JSON.stringify(manifest));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
