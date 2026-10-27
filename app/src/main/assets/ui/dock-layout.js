'use strict';
// Explicit split axes make parent-group docking independent of Dockview's
// alternating serialized branch depth. No private Dockview methods are used.
const StudioDockLayout={
  sequence:0,
  other(axis){return axis==='HORIZONTAL'?'VERTICAL':'HORIZONTAL';},
  decode(node,axis){if(!node)return null;if(node.type==='leaf')return{state:structuredClone(node.data),weight:node.size||1};return{axis,weight:node.size||1,children:(node.data||[]).map(n=>this.decode(n,this.other(axis)))};},
  ids(node){return node?.state?[...node.state.views]:(node?.children||[]).flatMap(n=>this.ids(n));},
  normalize(node){
    if(!node)return null;if(node.state)return node.state.views.length?node:null;
    node.children=node.children.map(n=>this.normalize(n)).filter(Boolean);if(!node.children.length)return null;
    if(node.children.length===1){const child=node.children[0];child.weight=node.weight;return child;}
    const children=[];for(const child of node.children){if(child.axis===node.axis){const total=child.children.reduce((n,c)=>n+c.weight,0);for(const part of child.children){part.weight=child.weight*part.weight/total;children.push(part);}}else children.push(child);}node.children=children;return node;
  },
  encode(node,width,height){
    if(node.state)return{type:'leaf',data:node.state};
    const total=node.children.reduce((sum,n)=>sum+Math.max(.001,n.weight),0),span=node.axis==='HORIZONTAL'?width:height;
    return{type:'branch',data:node.children.map(child=>{const size=span*Math.max(.001,child.weight)/total;return{...this.encode(child,node.axis==='HORIZONTAL'?size:width,node.axis==='VERTICAL'?size:height),size};})};
  },
  branches(layout,groupId){
    const root=this.decode(layout.grid.root,layout.grid.orientation),path=[];
    const find=node=>{if(node.state)return node.state.id===groupId;if(node.children.some(child=>find(child))){path.push({ids:this.ids(node),groups:this.groups(node)});return true;}return false;};
    find(root);return path;
  },
  groups(node){return node?.state?[node.state.id]:(node?.children||[]).flatMap(n=>this.groups(n));},
  place(original,moving,side,targetIds=null){
    const layout=structuredClone(original),movingSet=new Set(moving);if(!moving.length||moving.some(id=>!layout.panels[id]))throw Error('Unknown window');
    let root=this.decode(layout.grid.root,layout.grid.orientation),targetSet=new Set((targetIds||this.ids(root)).filter(id=>!movingSet.has(id)));
    const remove=node=>{if(node?.state){node.state.views=node.state.views.filter(id=>!movingSet.has(id));if(!node.state.views.includes(node.state.activeView))node.state.activeView=node.state.views[0];return node;}if(node)node.children=node.children.map(remove);return node;};
    root=this.normalize(remove(root));
    layout.floatingGroups=(layout.floatingGroups||[]).map(entry=>{if(entry.data){entry.data.views=entry.data.views.filter(id=>!movingSet.has(id));if(!entry.data.views.includes(entry.data.activeView))entry.data.activeView=entry.data.views[0];return entry.data.views.length?entry:null;}if(entry.grid){const n=this.normalize(remove(this.decode(entry.grid.root,entry.grid.orientation)));if(!n)return null;entry.grid.orientation=n.axis||entry.grid.orientation;entry.grid.root=this.encode(n,entry.grid.width,entry.grid.height);}return entry;}).filter(Boolean);
    const groupId='studio-dock-'+Date.now().toString(36)+'-'+(++this.sequence),newLeaf={state:{id:groupId,views:[...moving],activeView:moving[0]},weight:.28};
    if(side==='center'){
      const find=node=>{if(!node)return null;if(node.state)return node.state.views.some(id=>targetSet.has(id))?node:null;return node.children.map(find).find(Boolean);};
      const target=find(root);if(target){target.state.views.push(...moving);target.state.activeView=moving[0];layout.activeGroup=target.state.id;}else root=newLeaf;
    }else{
      const axis=['left','right'].includes(side)?'HORIZONTAL':'VERTICAL',before=['left','top'].includes(side);
      // The deepest branch containing every selected target is their original
      // parent region, even after its children have been split again.
      const targetExists=node=>this.ids(node).filter(id=>targetSet.has(id));
      let target=root;if(root&&targetSet.size){while(!target.state){const child=target.children.find(n=>targetExists(n).length===targetSet.size);if(!child)break;target=child;}}
      const wrap=node=>{if(node!==target){if(node.children)node.children=node.children.map(wrap);return node;}const weight=node.weight;node.weight=.72;return{axis,weight,children:before?[newLeaf,node]:[node,newLeaf]};};
      root=root?wrap(root):newLeaf;layout.activeGroup=groupId;
    }
    root=this.normalize(root);if(root.state)root={axis:layout.grid.orientation,children:[root],weight:1};
    layout.grid.orientation=root.axis;layout.grid.root={...this.encode(root,layout.grid.width,layout.grid.height),size:root.axis==='VERTICAL'?layout.grid.width:layout.grid.height};
    return layout;
  },
  migrate(original,outputNames,target='output',fallback='console'){
    const layout=structuredClone(original),modes=new Set(outputNames);let selected=fallback,retained=false;
    const map=state=>{state.locked=false;state.hideHeader=false;const active=state.activeView;if(modes.has(active))selected=active;const views=[];for(const id of state.views){if(modes.has(id)){if(!retained){views.push(target);retained=true;}if(state.activeView===id)state.activeView=target;}else views.push(id);}state.views=views;if(!views.includes(state.activeView))state.activeView=views[0];return views.length;};
    const walk=node=>{if(node.type==='leaf')return map(node.data)?node:null;node.data=node.data.map(walk).filter(Boolean);return node.data.length?node:null;};
    layout.grid.root=walk(layout.grid.root)||{type:'branch',data:[],size:layout.grid.width};
    layout.floatingGroups=(layout.floatingGroups||[]).filter(f=>f.data?map(f.data):f.grid?!!(f.grid.root=walk(f.grid.root)):false);
    for(const id of modes)delete layout.panels[id];
    if(retained)layout.panels[target]={id:target,contentComponent:'studio',tabComponent:'studio-tool',title:'Console',params:{mode:selected},minimumWidth:150,minimumHeight:90};
    return{layout,mode:selected};
  }
};
if(typeof module!=='undefined')module.exports=StudioDockLayout;
