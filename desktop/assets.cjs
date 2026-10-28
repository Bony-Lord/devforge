'use strict';
const path=require('node:path'),fs=require('node:fs');
const assets=fs.existsSync(path.join(__dirname,'ui'))?__dirname:path.resolve(__dirname,'../app/src/main/assets');
module.exports={assets,ui:path.join(assets,'ui')};
