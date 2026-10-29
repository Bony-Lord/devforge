'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic,inside}=require('./workspace.cjs');
class OptionalAssets {
  constructor(host){this.host=host;this.assets=require('./assets.cjs').assets;this.catalog=require(this.assets+'/ui/addons/optional-assets.json');this.cache=path.join(host.ws.data,'optional-assets');this.jobs=new Map();}
  entry(id){const pack=this.catalog.find(p=>p.id===id);if(!pack)throw Error('Unknown optional asset pack');return pack;}
  cached(pack,file){return path.join(this.cache,pack.id,file.sha256+'-'+path.basename(file.path));}
  async valid(file,record){try{if((await fs.stat(file)).size!==record.bytes)return false;return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')===record.sha256;}catch{return false;}}
  async info(){const result=[];for(const pack of this.catalog){let installed=true,bundled=true;for(const file of pack.files){const own=await this.valid(path.join(this.assets,'ui',file.path),file);bundled&&=own;installed&&=own||await this.valid(this.cached(pack,file),file);}result.push({...pack,name:pack.name[this.host.ws.prefs.settings.language||'en']||pack.name.en,installed,bundled,optional:true,bytes:pack.files.reduce((n,f)=>n+f.bytes,0)});}return result;}
  install(id){if(this.jobs.has(id))return this.jobs.get(id);const operation=this.installPack(this.entry(id)).finally(()=>this.jobs.delete(id));this.jobs.set(id,operation);return operation;}
  async installPack(pack){for(const file of pack.files){if(await this.valid(path.join(this.assets,'ui',file.path),file)||await this.valid(this.cached(pack,file),file))continue;const response=await fetch(file.url,{signal:AbortSignal.timeout(60000)});if(!response.ok||!response.url.startsWith('https://raw.githubusercontent.com/'))throw Error('Optional asset download failed: '+response.status);const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>file.bytes)throw Error('Optional asset exceeds pinned size');chunks.push(chunk);}const bytes=Buffer.concat(chunks);if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Optional asset checksum mismatch');const destination=this.cached(pack,file);if(!inside(path.resolve(destination),path.resolve(this.cache)))throw Error('Optional asset cache escaped root');await atomic(destination,bytes);}return this.info();}
  async remove(id){const pack=this.entry(id);if(this.jobs.has(id))throw Error('Wait for the optional asset download');for(const file of pack.files)await fs.unlink(this.cached(pack,file)).catch(error=>{if(error.code!=='ENOENT')throw error;});return this.info();}
  async read(relative){for(const pack of this.catalog)for(const file of pack.files)if(file.path===relative){const target=this.cached(pack,file);if(!await this.valid(target,file))return null;return fs.readFile(target);}return null;}
}
module.exports={OptionalAssets};
