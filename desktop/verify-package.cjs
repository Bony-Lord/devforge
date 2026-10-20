// Exercise the packaged executable with a fresh, isolated fixture directory.
'use strict';
const path=require('node:path'),cp=require('node:child_process');
const folder=path.join(__dirname,'dist','Cpp-Studio-'+process.platform+'-'+process.arch+'-1.0.0-rc.1');
const executable=path.join(folder,process.platform==='win32'?'CppStudio.exe':process.platform==='darwin'?'C++ Studio.app/Contents/MacOS/Electron':'cpp-studio');
const child=cp.spawn(executable,['--smoke','--data-dir='+path.resolve(__dirname,'../work/ci-desktop-packaged')],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
