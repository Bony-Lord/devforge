package dev.forge.ide;

import android.view.*;
import android.widget.FrameLayout;
import org.json.*;
import java.util.*;

/** Native touch targets above the code layers; one resize session at a time. */
final class WindowResizeHandles {
    final NativeEditorHost host;final MainActivity app;
    final Map<String,View> views=new HashMap<>();JSONArray handles=new JSONArray();String active;
    WindowResizeHandles(NativeEditorHost host){this.host=host;app=host.app;}
    void update(JSONArray value){handles=value==null?new JSONArray():value;}
    void geometry(boolean allowed,float scale){
        Set<String> present=new HashSet<>();
        for(int i=0;i<handles.length();i++){
            JSONObject item=handles.optJSONObject(i);if(item==null)continue;String token=item.optString("id"),group=item.optString("group"),direction=item.optString("direction");present.add(token);
            View view=views.get(token);if(view==null){view=new View(app);view.setTag(token);view.setZ(50*app.getResources().getDisplayMetrics().density);view.setContentDescription("Resize "+direction);final String key=token;
                view.setOnTouchListener((target,event)->{int action=event.getActionMasked();
                    if(action==android.view.MotionEvent.ACTION_DOWN){if(active!=null&&!active.equals(key))return true;active=key;target.getParent().requestDisallowInterceptTouchEvent(true);}
                    if(!key.equals(active))return true;
                    if(action==MotionEvent.ACTION_DOWN||action==MotionEvent.ACTION_MOVE||action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
                        int[] origin=new int[2];app.editorRoot.getLocationOnScreen(origin);float unit=app.web.getScale();if(unit<=0)unit=app.getResources().getDisplayMetrics().density;
                        app.event("windowResizePointer",NativeEditorHost.object("phase",action==0?"down":action==1?"up":action==3?"cancel":"move","pointerId",10000+event.getPointerId(0),"group",group,"direction",direction,"x",(event.getRawX()-origin[0])/unit,"y",(event.getRawY()-origin[1])/unit));
                        if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL)active=null;
                    }return true;
                });app.editorRoot.addView(view,new FrameLayout.LayoutParams(1,1));views.put(token,view);
            }
            int width=Math.max(1,Math.round((float)item.optDouble("width")*scale)),height=Math.max(1,Math.round((float)item.optDouble("height")*scale));
            FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)view.getLayoutParams();int left=Math.round((float)item.optDouble("x")*scale),top=Math.round((float)item.optDouble("y")*scale);
            if(lp.width!=width||lp.height!=height||lp.leftMargin!=left||lp.topMargin!=top){lp.width=width;lp.height=height;lp.leftMargin=left;lp.topMargin=top;view.setLayoutParams(lp);}view.setVisibility(allowed?View.VISIBLE:View.GONE);
        }
        for(String token:new ArrayList<>(views.keySet()))if(!present.contains(token)){View view=views.remove(token);app.editorRoot.removeView(view);if(token.equals(active))active=null;}
    }
}
