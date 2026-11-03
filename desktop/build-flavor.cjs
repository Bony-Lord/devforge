'use strict';
const fs=require('node:fs'),path=require('node:path');
function flavor(channel='release'){
 if(!['debug','release'].includes(channel))throw Error('Build channel must be debug or release');
 const debug=channel==='debug';
 return Object.freeze({channel,debug,productName:debug?'DevForge Debug':'DevForge',profileName:debug?'DevForge Debug':'DevForge',appId:debug?'dev.cppstudio.desktop.debug':'dev.cppstudio.desktop',executableName:debug?'DevForge Debug':'DevForge',packagePrefix:debug?'DevForge-Debug':'DevForge',minified:!debug,sourceMaps:debug});
}
function channelFromArgs(args=process.argv){const values=args.filter(a=>a.startsWith('--channel='));if(values.length>1)throw Error('Specify one --channel');return flavor(values[0]?.slice(10)||'release');}
function readBuildInfo(directory=__dirname,{packaged=false,env=process.env}={}){
 let manifest;try{manifest=JSON.parse(fs.readFileSync(path.join(directory,'build-info.json'),'utf8'));}catch(error){if(error.code!=='ENOENT'||packaged)throw error;}
 const value=flavor(manifest?.channel||(packaged?'release':env.DEVFORGE_BUILD_CHANNEL||'release'));
 return {...manifest,...value,version:manifest?.version||require('./package.json').version};
}
function packageFolder(directory,version,value,platform=process.platform,arch=process.arch){return path.join(directory,'dist',`${value.packagePrefix}-${platform}-${arch}-${version}`);}
module.exports={flavor,channelFromArgs,readBuildInfo,packageFolder};
