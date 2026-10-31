'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function profileDirectory(data,...parts){let current=await fs.realpath(data);for(const part of parts){if(!/^[a-z0-9-]+$/i.test(part))throw Error('Invalid profile directory component');current=path.join(current,part);try{const info=await fs.lstat(current);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Extension profile storage cannot be a link');}catch(error){if(error.code!=='ENOENT')throw error;try{await fs.mkdir(current);}catch(race){if(race.code!=='EEXIST')throw race;}if((await fs.lstat(current)).isSymbolicLink())throw Error('Extension profile storage cannot be a link');}}return current;}
module.exports={profileDirectory};
