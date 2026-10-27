'use strict';
const assert=require('node:assert/strict'),layout=require('../app/src/main/assets/ui/dock-layout.js');
const leaf=(id,size=100)=>({type:'leaf',data:{id,views:[id],activeView:id},size});
const fixture={grid:{orientation:'VERTICAL',width:1000,height:800,root:{type:'branch',data:[{type:'branch',size:600,data:[leaf('project',200),{type:'branch',size:800,data:[leaf('editor',400),leaf('outline',200)]}]},leaf('output',200)]}},panels:Object.fromEntries(['project','editor','outline','output'].map(id=>[id,{id,contentComponent:'studio'}]))};
const all=l=>{const a=[];function visit(n){if(n.type==='leaf')a.push(...n.data.views);else n.data.forEach(visit);}visit(l.grid.root);for(const f of l.floatingGroups||[])if(f.data)a.push(...f.data.views);else visit(f.grid.root);return a.sort();};
let checks=0;
for(const side of ['left','right','top','bottom']){
 const copy=JSON.stringify(fixture),screen=layout.place(fixture,['output'],side),parent=layout.place(fixture,['output'],side,['editor','outline']);
 assert.equal(JSON.stringify(fixture),copy);assert.deepEqual(all(screen),['editor','outline','output','project']);assert.deepEqual(all(parent),all(screen));checks+=3;
 const rootAxis=['left','right'].includes(side)?'HORIZONTAL':'VERTICAL';assert.equal(screen.grid.orientation,rootAxis);
 const branch=screen.grid.root.data[['left','top'].includes(side)?0:screen.grid.root.data.length-1];assert.equal(branch.type,'leaf');assert.deepEqual(branch.data.views,['output']);checks+=2;
}
{
 const p=layout.place(fixture,['output'],'bottom',['editor','outline']);assert.equal(p.grid.orientation,'HORIZONTAL');assert.equal(p.grid.root.data.length,2);
 assert.deepEqual(p.grid.root.data[0].data.views,['project']);assert.equal(p.grid.root.data[0].size,200);
 const codeAndOutput=p.grid.root.data[1];assert.equal(codeAndOutput.type,'branch');assert.deepEqual(codeAndOutput.data.at(-1).data.views,['output']);checks++;
}
{
 const joined=layout.place(fixture,['output'],'center',['editor']);assert.deepEqual(all(joined),all(fixture));const find=n=>n.type==='leaf'?(n.data.views.includes('editor')?n:null):n.data.map(find).find(Boolean);const code=find(joined.grid.root);assert.deepEqual(code.data.views,['editor','output']);assert.equal(code.data.activeView,'output');checks++;
}
{
 const f=structuredClone(fixture);f.floatingGroups=[{data:{id:'float',views:['console'],activeView:'console'},position:{left:20,top:20,width:300,height:200}}];f.panels.console={id:'console',contentComponent:'studio'};
 const moved=layout.place(f,['console'],'right');assert.equal(moved.floatingGroups.length,0);assert.deepEqual(all(moved),['console','editor','outline','output','project']);checks++;
 const migrated=layout.migrate(f,['output','console']);assert.equal(all(migrated.layout).filter(id=>id==='output').length,1);assert.ok(!migrated.layout.panels.console);checks++;
}
console.log(checks+' parent-group, screen-edge, center and floating layout invariants passed');
