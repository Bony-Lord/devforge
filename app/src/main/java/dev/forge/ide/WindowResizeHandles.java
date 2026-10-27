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
                view.setOnTouchListener(new View.OnTouchListener(){int pointer=-1;public boolean onTouch(View target,MotionEvent event){int action=event.getActionMasked();
                    if(action==MotionEvent.ACTION_DOWN){if(active!=null&&!active.equals(key))return true;active=key;pointer=event.getPointerId(0);target.getParent().requestDisallowInterceptTouchEvent(true);}
                    if(!key.equals(active)||pointer<0)return true;int index=event.findPointerIndex(pointer);if(index<0)return true;
                    boolean released=action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_POINTER_UP&&event.getPointerId(event.getActionIndex())==pointer;
                    if(action==MotionEvent.ACTION_DOWN||action==MotionEvent.ACTION_MOVE||released||action==MotionEvent.ACTION_CANCEL){
                        int[] origin=new int[2];app.editorRoot.getLocationOnScreen(origin);float unit=app.web.getScale();if(unit<=0)unit=app.getResources().getDisplayMetrics().density;
                        float rawX=event.getRawX()+event.getX(index)-event.getX(0),rawY=event.getRawY()+event.getY(index)-event.getY(0);
                        app.event("windowResizePointer",NativeEditorHost.object("phase",action==0?"down":released?"up":action==3?"cancel":"move","pointerId",10000+pointer,"group",group,"direction",direction,"x",(rawX-origin[0])/unit,"y",(rawY-origin[1])/unit));
                        if(released||action==MotionEvent.ACTION_CANCEL){active=null;pointer=-1;}
                    }return true;
                }});app.editorRoot.addView(view,new FrameLayout.LayoutParams(1,1));views.put(token,view);
            }
            int width=Math.max(1,Math.round((float)item.optDouble("width")*scale)),height=Math.max(1,Math.round((float)item.optDouble("height")*scale));
            FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)view.getLayoutParams();int left=Math.round((float)item.optDouble("x")*scale),top=Math.round((float)item.optDouble("y")*scale);
            if(lp.width!=width||lp.height!=height||lp.leftMargin!=left||lp.topMargin!=top){lp.width=width;lp.height=height;lp.leftMargin=left;lp.topMargin=top;view.setLayoutParams(lp);}view.setVisibility(allowed?View.VISIBLE:View.GONE);
        }
        for(String token:new ArrayList<>(views.keySet()))if(!present.contains(token)){View view=views.remove(token);app.editorRoot.removeView(view);if(token.equals(active))active=null;}
    }
}
