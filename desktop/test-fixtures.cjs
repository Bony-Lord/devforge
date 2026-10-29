'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
// Windows runner TEMP can be a junction onto another drive. Compare real paths,
// while retaining the guard that prevents any test from moving user projects.
async function assertFixturePath(directory,file){const [root,target]=await Promise.all([fs.realpath(directory),fs.realpath(file)]),relative=path.relative(root,target);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Only the fresh fixture project may be moved');return target;}
module.exports={assertFixturePath};
