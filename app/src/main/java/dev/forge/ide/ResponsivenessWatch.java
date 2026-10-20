package dev.forge.ide;

import android.os.*;
import org.json.*;
import java.util.ArrayDeque;

/** Small local diagnostic ring. No source text, key presses, file paths or network. */
final class ResponsivenessWatch implements AutoCloseable {
    final Handler ui=new Handler(Looper.getMainLooper());
    final ArrayDeque<JSONObject> events=new ArrayDeque<>();
    volatile boolean running=true,foreground,pingPending;
    volatile long heartbeat=SystemClock.uptimeMillis();
    boolean reported;
    ResponsivenessWatch(){Thread thread=new Thread(()->{
        while(running){try{Thread.sleep(400);}catch(InterruptedException e){return;}
            long now=SystemClock.uptimeMillis();if(!foreground){heartbeat=now;reported=false;continue;}
            long delay=now-heartbeat;
            if(delay>1000&&!reported){reported=true;StringBuilder stack=new StringBuilder();StackTraceElement[] frames=Looper.getMainLooper().getThread().getStackTrace();for(int i=0;i<Math.min(24,frames.length);i++)stack.append(frames[i]).append('\n');record("Android UI",delay,stack.toString());}
            if(delay<600)reported=false;
            if(!pingPending){pingPending=true;ui.post(()->{heartbeat=SystemClock.uptimeMillis();pingPending=false;});}
        }
    },"Studio-responsiveness");thread.setDaemon(true);thread.start();}
    synchronized void record(String area,long delay,String detail){try{events.add(new JSONObject().put("area",area).put("delayMs",delay).put("uptimeMs",SystemClock.uptimeMillis()).put("stack",detail));while(events.size()>16)events.removeFirst();}catch(JSONException ignored){}}
    synchronized JSONArray report(){JSONArray result=new JSONArray();for(JSONObject event:events)result.put(event);return result;}
    void foreground(boolean value){foreground=value;heartbeat=SystemClock.uptimeMillis();}
    @Override public void close(){running=false;foreground=false;}
}
