'use strict';
// Serialized into the pinned Node host by server-patches.cjs. Keep this pure:
// its callbacks use the genuine upstream lock acquisition and stale-lock rules.
async function devforgeWaitForWorkspaceLock(lock,{primary,identity,read,isAlive,retry,sleep,now=Date.now,timeout=20000}){
 if(lock||!primary||!identity.startsWith('devforge-'))return lock;
 const deadline=now()+timeout;
 while(!lock&&now()<deadline){
  await sleep(Math.min(200,deadline-now()));const owner=await read();
  if(!owner||!isAlive(owner.pid)||owner.willReleaseAt&&owner.willReleaseAt-now()<5000)lock=await retry();
 }
 return lock;
}
module.exports={devforgeWaitForWorkspaceLock};
