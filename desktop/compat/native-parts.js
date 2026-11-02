import {getService} from '@codingame/monaco-vscode-api';
import {ILayoutService} from '@codingame/monaco-vscode-api/vscode/vs/platform/layout/browser/layoutService.service';

// The dock manager owns the available size. Upstream attachPart clamps to its
// full-workbench minimum, which makes a narrow detached sidebar get cropped.
export async function nativePartService(){
 const layout=await getService(ILayoutService);
 return (id,container)=>{
  const part=layout.getPart(id);container.append(part.getContainer());let frame=0,disposed=false;
  const update=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed||!container.isConnected)return;const r=container.getBoundingClientRect();if(r.width&&r.height)part.layout(Math.floor(r.width),Math.floor(r.height),r.top,r.left);});};
  const observer=new ResizeObserver(update),visibility=part.onDidVisibilityChange(update);observer.observe(container);update();
  return{dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();visibility.dispose();}};
 };
}
