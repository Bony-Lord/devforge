package dev.forge.ide;

import android.app.*;
import android.content.*;
import android.os.*;
import android.graphics.Rect;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import org.json.*;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicReference;
import io.github.rosemoe.sora.widget.CodeEditor;

/** Real injected Android gestures against an isolated input-check project on the device. */
public final class NativeInputInstrumentation extends Instrumentation {
    JSONArray checks=new JSONArray();MainActivity activity;CodeEditor editor;
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    <T>T ui(Callable<T> task)throws Exception{AtomicReference<T> result=new AtomicReference<>();AtomicReference<Exception> error=new AtomicReference<>();runOnMainSync(()->{try{result.set(task.call());}catch(Exception e){error.set(e);}});if(error.get()!=null)throw error.get();return result.get();}
    void check(String name,boolean passed,Object evidence)throws Exception{JSONObject r=new JSONObject().put("test",name).put("passed",passed).put("evidence",evidence);checks.put(r);Bundle progress=new Bundle();progress.putString("stream",(passed?"PASS ":"FAIL ")+name+"\n");sendStatus(0,progress);}
    void touch(long down,long now,int action,float x,float y){MotionEvent e=MotionEvent.obtain(down,now,action,x,y,0);e.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);getUiAutomation().injectInputEvent(e,true);e.recycle();}
    void swipe(float x1,float y1,float x2,float y2,int duration){long start=SystemClock.uptimeMillis();touch(start,start,0,x1,y1);for(int n=1;n<=12;n++){SystemClock.sleep(duration/12);touch(start,SystemClock.uptimeMillis(),2,x1+(x2-x1)*n/12,y1+(y2-y1)*n/12);}touch(start,SystemClock.uptimeMillis(),1,x2,y2);}
    void pinch(float cx,float cy,float from,float to){
        long start=SystemClock.uptimeMillis();touch(start,start,0,cx-from,cy);
        MotionEvent.PointerProperties[] props={new MotionEvent.PointerProperties(),new MotionEvent.PointerProperties()};MotionEvent.PointerCoords[] coords={new MotionEvent.PointerCoords(),new MotionEvent.PointerCoords()};for(int i=0;i<2;i++){props[i].id=i;props[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i].pressure=1;coords[i].size=1;}
        for(int n=0;n<=16;n++){float r=from+(to-from)*n/16;coords[0].x=cx-r;coords[1].x=cx+r;coords[0].y=coords[1].y=cy;int action=n==0?MotionEvent.ACTION_POINTER_DOWN|256:MotionEvent.ACTION_MOVE;MotionEvent e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,2,props,coords,0,0,1,1,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);getUiAutomation().injectInputEvent(e,true);e.recycle();SystemClock.sleep(20);}
        MotionEvent e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),MotionEvent.ACTION_POINTER_UP|256,2,props,coords,0,0,1,1,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);getUiAutomation().injectInputEvent(e,true);e.recycle();touch(start,SystemClock.uptimeMillis(),1,cx-to,cy);
    }
    @Override public void onStart(){Bundle result=new Bundle();int status=Activity.RESULT_OK;
        try{
            activity=(MainActivity)startActivitySync(new Intent(Intent.ACTION_MAIN).setClassName("com.forgex","dev.forge.ide.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            for(int i=0;i<150;i++){if(ui(()->activity.nativeEditors!=null&&activity.nativeEditors.active!=null&&activity.nativeEditors.active.buffer!=null))break;SystemClock.sleep(100);}
            if(!ui(()->activity.engine.currentProject.startsWith("input-check-")))throw new IllegalStateException("Select an isolated input-check-* project first; user projects are never changed by this test");
            editor=ui(()->activity.nativeEditors.active.editor);
            ui(()->{((InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(editor.getWindowToken(),0);return null;});SystemClock.sleep(500);
            String unused="static int unused_function(int unused_parameter) { return 10; }\nint main() { int unused_variable = 5; return 0; }\n";
            ui(()->{var t=editor.getText();t.replace(0,0,t.getLineCount()-1,t.getColumnCount(t.getLineCount()-1),unused);editor.setSelection(0,0);editor.notifyIMEExternalCursorChange();return null;});
            for(int i=0;i<100;i++){if(ui(()->activity.nativeEditors.active.language.unusedStyles.length()>=2))break;SystemClock.sleep(100);}
            SystemClock.sleep(200);JSONObject gray=ui(()->{JSONObject colors=new JSONObject();for(String name:new String[]{"unused_function","unused_variable"}){int index=unused.indexOf(name);var pos=editor.getText().getIndexer().getCharPosition(index);var reader=editor.getStyles().spans.read();int color=0;for(var span:reader.getSpansOnLine(pos.line)){if(span.getColumn()>pos.column)break;color=editor.getColorScheme().getColor(span.getForegroundColorId());}colors.put(name,String.format("#%06X",color&0xffffff));}return colors;});
            check("Actual native spans gray unused function and variable",gray.optString("unused_function").equals("#6F737A")&&gray.optString("unused_variable").equals("#6F737A"),gray);
            String invalid="int main() { missing_native_probe(); }\n";long diagnosticStart=SystemClock.uptimeMillis();
            ui(()->{var t=editor.getText();t.replace(0,0,t.getLineCount()-1,t.getColumnCount(t.getLineCount()-1),invalid);return null;});
            boolean received=false;for(int i=0;i<100;i++){received=ui(()->activity.nativeEditors.active.language.diagnostics.stream().anyMatch(d->d.detail!=null&&String.valueOf(d.detail.getBriefMessage()).contains("missing_native_probe")));if(received)break;SystemClock.sleep(25);}
            check("Real clangd error reaches native diagnostic regions",received,new JSONObject().put("nativeDiagnosticMs",SystemClock.uptimeMillis()-diagnosticStart));
            StringBuilder large=new StringBuilder();for(int i=0;i<6000;i++)large.append("// input fixture line ").append(i).append(" abcdefghijklmnopqrstuvwxyz\n");
            ui(()->{var t=editor.getText();t.replace(0,0,t.getLineCount()-1,t.getColumnCount(t.getLineCount()-1),large);editor.setSelection(0,0);editor.notifyIMEExternalCursorChange();return null;});SystemClock.sleep(500);
            ui(()->{editor.getScroller().forceFinished(true);editor.getScroller().startScroll(0,0,0,0,0);editor.getScroller().abortAnimation();return null;});
            Rect rect=ui(()->{int[] pos=new int[2];editor.getLocationOnScreen(pos);return new Rect(pos[0],pos[1],pos[0]+editor.getWidth(),pos[1]+editor.getHeight());});int before=ui(()->editor.getOffsetY());swipe(rect.centerX(),rect.top+rect.height()*.8f,rect.centerX(),rect.top+rect.height()*.25f,350);SystemClock.sleep(200);int after=ui(()->editor.getOffsetY());check("One-finger swipe scrolls a 6000-line document",after>before,new JSONObject().put("before",before).put("after",after));
            java.util.List<String> touches=new java.util.concurrent.CopyOnWriteArrayList<>();ui(()->{editor.setOnTouchListener((v,event)->{touches.add(event.getActionMasked()+":"+event.getPointerCount());return false;});return null;});
            float font=ui(()->editor.getTextSizePx());pinch(rect.centerX(),rect.centerY(),160,350);SystemClock.sleep(300);float zoom=ui(()->editor.getTextSizePx());check("Two-finger pinch increases native code font",zoom>font+2,new JSONObject().put("beforePx",font).put("afterPx",zoom).put("scalable",ui(()->editor.isScalable())).put("rect",rect.toShortString()).put("events",new JSONArray(touches)));ui(()->{editor.setOnTouchListener(null);return null;});
            ui(()->{editor.setSelection(0,0);editor.notifyIMEExternalCursorChange();activity.web.evaluateJavascript("window.__inputBusyStarted=true;const busyUntil=performance.now()+2200;while(performance.now()<busyUntil){};window.__inputBusyFinished=true;",null);return null;});SystemClock.sleep(250);
            long start=SystemClock.uptimeMillis();sendStringSync("q");boolean immediate=ui(()->editor.getText().charAt(0)=='q');long elapsed=SystemClock.uptimeMillis()-start;check("Native input accepts a key while WebView JavaScript is blocked",immediate&&elapsed<1000,new JSONObject().put("nativeInputMs",elapsed).put("webViewBlockMs",2200));
            SystemClock.sleep(2500);ui(()->{activity.nativeEditors.pause();return null;});
        }catch(Throwable error){status=Activity.RESULT_CANCELED;result.putString("error",error.toString());}
        result.putString("checks",checks.toString());result.putString("stream",checks.toString()+"\n");finish(status,result);
    }
}
