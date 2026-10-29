'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic,portable,canonical,exists}=require('./workspace.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// The renderer supplies an explicit reviewed batch, never executable template code.
class ProjectTemplateFiles {
  constructor(ws){this.ws=ws;this.queue=Promise.resolve();}
  handle(op,d){const task=this.queue.catch(()=>{}).then(()=>op==='projectTemplateSnapshot'?this.snapshot(d):this.apply(d));this.queue=task;return task;}
  async root(d){if(!d.root||await canonical(d.root)!==await canonical(this.ws.root))throw Error('Project changed; preview the template again');}
  async file(name){if(typeof name!=='string'||!name||name.length>240||/[\\:\x00-\x1f]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'||['.git','.forge'].includes(p.toLowerCase()))||name.toLowerCase().startsWith('.devforge/')&&name!=='.devforge/project.json')throw Error('Unsafe template path');return this.ws.writable(name);}
  async bytes(file){try{const stat=await fs.stat(file);if(!stat.isFile()||stat.size>1048576)throw Error('Template file exceeds 1 MiB or is not a regular file');return await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async snapshot(d){await this.root(d);if(!Array.isArray(d.paths)||d.paths.length>129)throw Error('Invalid template snapshot');const files={};for(const name of d.paths){const file=await this.file(name),bytes=await this.bytes(file);files[name]=bytes===null?null:{text:require('./workspace.cjs').decode(bytes).text,sha256:hash(bytes)};}return {root:portable(this.ws.root),files};}
  async apply(d){
    await this.root(d);if(!Array.isArray(d.changes)||!d.changes.length||d.changes.length>129||JSON.stringify(d).length>2097152)throw Error('Invalid template batch');
    const seen=new Set(),batch=[];
    for(const change of d.changes){const file=await this.file(change.path),identity=process.platform==='win32'?file.toLowerCase():file;if(seen.has(identity)||typeof change.text!=='string'||change.text.includes('\0')||Buffer.byteLength(change.text)>1048576||change.expected!==null&&!/^[a-f0-9]{64}$/.test(change.expected||''))throw Error('Invalid template change');seen.add(identity);const before=await this.bytes(file);if((before===null?null:hash(before))!==change.expected)throw Error('File changed since preview: '+change.path);batch.push({file,before,after:Buffer.from(change.text),path:change.path});}
    // All paths and original bytes are checked before the first write. Retain originals
    // in normal local history too, so an intentional replacement remains recoverable.
    for(const entry of batch)if(entry.before!==null&&!entry.before.equals(entry.after)){const dir=this.ws.historyDir(entry.file);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,Date.now()+'-template-'+crypto.randomUUID()+'.json'),JSON.stringify({text:require('./workspace.cjs').decode(entry.before).text,time:Date.now()}));}
    const written=[],directories=[];
    try{
      for(const entry of batch){await this.root(d);const actual=await this.bytes(entry.file);if((actual===null?null:hash(actual))!==(entry.before===null?null:hash(entry.before)))throw Error('File changed since preview: '+entry.path);
        const missing=[];let dir=path.dirname(entry.file);while(!await exists(dir)){missing.push(dir);dir=path.dirname(dir);}for(const folder of missing.reverse()){await fs.mkdir(folder);directories.push(folder);}
        // Resolve again after directory creation; never follow a newly introduced escape.
        if(await this.file(entry.path)!==entry.file)throw Error('Project path changed');
        if(entry.before===null)await fs.writeFile(entry.file,entry.after,{flag:'wx'});else await atomic(entry.file,entry.after);written.push(entry);
      }
    }catch(error){for(const entry of written.reverse()){const actual=await this.bytes(entry.file);if(actual!==null&&hash(actual)===hash(entry.after)){if(entry.before===null)await fs.unlink(entry.file);else await atomic(entry.file,entry.before);}}for(const dir of directories.reverse())await fs.rmdir(dir).catch(()=>{});throw error;}
    for(const entry of batch){delete this.ws.prefs.encodings[entry.file];this.ws.readState.delete(entry.file);}await this.ws.persist();return {paths:batch.map(e=>portable(e.file))};
  }
}
module.exports={ProjectTemplateFiles};
