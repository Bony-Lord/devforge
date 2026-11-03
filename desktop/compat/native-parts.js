import {getService} from '@codingame/monaco-vscode-api';
import {ILayoutService} from '@codingame/monaco-vscode-api/vscode/vs/platform/layout/browser/layoutService.service';
const mounted=new Set();
export function layoutNativeParts(){for(const resize of mounted)resize();}

// The dock manager owns the available size. Upstream attachPart clamps to its
// full-workbench minimum, which makes a narrow detached sidebar get cropped.
export async function nativePartService(){
 const layout=await getService(ILayoutService);
 return (id,container)=>{
  const part=layout.getPart(id),original=part.layout;container.append(part.getContainer());let frame=0,disposed=false;
  // Workbench commands can lay the part out again without resizing its host.
  // Every caller must use the dock's bounds, including internal lists/editors.
  const resize=(...fallback)=>{const width=container.clientWidth,height=container.clientHeight;if(!disposed&&container.isConnected&&width&&height)return original.call(part,width,height,0,0);return original.apply(part,fallback);};part.layout=resize;
  const update=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed||!container.isConnected)return;resize(container.clientWidth,container.clientHeight,0,0);});};
  const observer=new ResizeObserver(update),visibility=part.onDidVisibilityChange(update);observer.observe(container);mounted.add(resize);update();
  return{dispose(){disposed=true;cancelAnimationFrame(frame);mounted.delete(resize);observer.disconnect();visibility.dispose();if(part.layout===resize)part.layout=original;}};
 };
}
