import json,pathlib,sys
source=pathlib.Path(__file__).resolve().parents[1];workspace=source;sys.path.insert(0,str(source/'tools'))
from device_cdp import Device
(source/'work').mkdir(exist_ok=True);d=Device()
try:
 result=d.evaluate(r'''(async()=>{
 if(!forge.state.project.startsWith('input-check-'))throw Error('Use an isolated test project');
 const model=forge.active.model,uri=model.uri.toString();
 for(let n=0;n<100&&!forge.lsp.ready;n++)await new Promise(r=>setTimeout(r,50));
 const original=window.native,diagnose=forge.diagnostics.bind(forge);let current=null;const samples=[];
 window.native=(op,data={})=>{if(current&&op==='editorAnalysis'&&data.uri===uri&&data.diagnostics?.some(x=>x.message.includes(current.name)))current.displayRequested=performance.now();return original(op,data);};
 forge.diagnostics=p=>{if(current&&p.uri===uri&&p.diagnostics?.some(x=>x.message.includes(current.name)))current.rawArrived=performance.now();return diagnose(p);};
 try{
   model.setValue('#include <vector>\nint main(){std::vector<int> values{1,2,3}; return values.size();}\n');await NativeEditing.sync();forge.lsp.sync(model);await new Promise(r=>setTimeout(r,2500));
   for(let k=0;k<3;k++){
    const name='missing_probe_'+k;current={name,start:performance.now()};model.setValue('#include <vector>\nint main(){std::vector<int> values{1,2,3}; '+name+'();return values.size();}\n');
    for(let n=0;n<160&&!current.displayRequested;n++)await new Promise(r=>setTimeout(r,25));
    samples.push({rawDiagnosticsMs:current.rawArrived?Math.round(current.rawArrived-current.start):null,nativeDisplayRequestMs:current.displayRequested?Math.round(current.displayRequested-current.start):null});current=null;await new Promise(r=>setTimeout(r,250));
   }
   const position={lineNumber:2,column:59};model.setValue('#include <vector>\nint main(){std::vector<int> values{1,2,3}; values.si;}\n');await NativeEditing.sync();const col=model.getLineContent(2).indexOf('values.si')+'values.si'.length+1,completion=[];
   for(let i=0;i<3;i++){const start=performance.now(),r=await forge.lsp.request('textDocument/completion',forge.lsp.at(model,{lineNumber:2,column:col}));completion.push({ms:Math.round(performance.now()-start),count:(Array.isArray(r)?r:r?.items||[]).length});}
   return {samples,completion,bytes:model.getValueLength(),incremental:forge.lsp.capabilities.textDocumentSync};
 }finally{window.native=original;forge.diagnostics=diagnose;}
})()''')
 name=sys.argv[1] if len(sys.argv)>1 else 'performance-before.json';(workspace/'work'/name).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2))
finally:d.close()
