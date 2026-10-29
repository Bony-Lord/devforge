'use strict';
// Wrap the already verified portable payload, including its original notices.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {build,Platform,Arch}=require('electron-builder');
const pkg=require('./package.json');
async function main(){
  const web=process.argv.includes('--web'),packageUrl=process.argv.find(v=>v.startsWith('--package-url='))?.slice(14);if(web){if(process.platform!=='win32'||!packageUrl||new URL(packageUrl).protocol!=='https:')throw Error('Web setup requires Windows and an explicit HTTPS --package-url= for the exact core package');}
  const folder=path.join(__dirname,'dist',`DevForge-${process.platform}-${process.arch}-${pkg.version}`);
  await fs.access(folder);await require('./package-content.cjs').assertCoreContents(folder);
  const destination=path.join(__dirname,'dist',web?'web-installers':'installers');await fs.mkdir(destination,{recursive:true});
  // Fresh staging prevents nsis-web from reusing an old same-version archive
  // whose appended blockmap cannot be updated as an ordinary 7z file.
  const output=await fs.mkdtemp(path.join(destination,'.build-'));
  const config={appId:'dev.cppstudio.desktop',productName:'DevForge',copyright:'Copyright (c) DevForge contributors',
    artifactName:'DevForge-'+pkg.version+'-${os}-${arch}-setup.${ext}',directories:{output,buildResources:__dirname},
    extraMetadata:{homepage:'https://github.com/Bony-Lord/devforge',author:'DevForge contributors'},
    publish:null,compression:'maximum',electronVersion:require('./node_modules/electron/package.json').version,
    win:{executableName:'DevForge',target:web?'nsis-web':'nsis',icon:path.join(__dirname,'icon.ico'),signAndEditExecutable:false},
    nsis:{packElevateHelper:false,oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'DevForge',runAfterFinish:false,deleteAppDataOnUninstall:false,installerLanguages:['en_US','ru_RU'],license:path.join(__dirname,'../LICENSE')},
    linux:{executableName:'devforge',target:['deb'],category:'Development',maintainer:'DevForge contributors',synopsis:'Modular development environment',description:pkg.description,icon:path.join(__dirname,'icon.png')},
    deb:{depends:['libgtk-3-0','libnss3','libxss1','libxtst6','xdg-utils','libatspi2.0-0','libuuid1','libgbm1','libasound2 | libasound2t64']},
    mac:{target:['pkg'],identity:null,category:'public.app-category.developer-tools'},pkg:{installLocation:'/Applications',allowAnywhere:false,allowCurrentUserHome:true,allowRootDirectory:true}};
  if(web)config.nsisWeb={...config.nsis,appPackageUrl:packageUrl,artifactName:'DevForge-'+pkg.version+'-win-x64-web-setup.exe'};
  const platform=process.platform==='win32'?Platform.WINDOWS:process.platform==='darwin'?Platform.MAC:Platform.LINUX;
  const artifacts=await build({projectDir:__dirname,prepackaged:process.platform==='darwin'?path.join(folder,'DevForge.app'):folder,targets:platform.createTarget(undefined,Arch[process.arch]),config});
  const manifest=[];for(const staged of artifacts){const file=path.join(destination,path.basename(staged));await fs.rename(staged,file);const hash=crypto.createHash('sha256');for await(const bytes of (await fs.open(file)).createReadStream())hash.update(bytes);const sha256=hash.digest('hex');await fs.writeFile(file+'.sha256',sha256+'  '+path.basename(file)+'\n');manifest.push({file:path.basename(file),bytes:(await fs.stat(file)).size,sha256});}
  await fs.writeFile(path.join(destination,'installers-'+process.platform+'.json'),JSON.stringify({version:pkg.version,mode:web?'web-bootstrap':'offline',packageUrl:packageUrl||null,artifacts:manifest},null,2)+'\n');console.log(JSON.stringify(manifest));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
