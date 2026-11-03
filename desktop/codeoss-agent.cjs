'use strict';
// The stdin pipe is a lifetime lease from the owning Electron main process.
// A crash or forced close must not leave an orphaned agent consuming memory.
const {pathToFileURL}=require('node:url');
require('./download-progress.cjs').install(value=>process.stdout.write('\x1eDEVFORGE_DOWNLOAD '+JSON.stringify(value)+'\n'));
const server=process.argv.splice(2,1)[0];process.argv[1]=server;
process.stdin.resume();process.stdin.once('end',()=>process.exit(0));
import(pathToFileURL(server).href).catch(error=>{console.error(error);process.exit(1);});
