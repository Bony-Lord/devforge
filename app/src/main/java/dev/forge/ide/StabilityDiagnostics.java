package dev.forge.ide;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Local-only system exit evidence. Never sends source or diagnostics over a network. */
final class StabilityDiagnostics {
    static void captureExitHistory(Context context) {
        if(Build.VERSION.SDK_INT<30)return;
        try {
            File folder=new File(context.getCacheDir(),"stability-history");folder.mkdirs();
            JSONArray entries=new JSONArray();
            for(ApplicationExitInfo exit:context.getSystemService(ActivityManager.class).getHistoricalProcessExitReasons(context.getPackageName(),0,16)){
                if(!context.getPackageName().equals(exit.getProcessName()))continue;
                JSONObject entry=new JSONObject().put("timestamp",exit.getTimestamp()).put("pid",exit.getPid()).put("reason",exit.getReason()).put("status",exit.getStatus()).put("description",exit.getDescription()).put("pssKb",exit.getPss()).put("rssKb",exit.getRss());
                File trace=new File(folder,"exit-"+exit.getTimestamp()+"-"+exit.getPid()+".txt");
                if(!trace.isFile())try(InputStream input=exit.getTraceInputStream()){
                    if(input!=null)try(OutputStream output=new FileOutputStream(trace)){
                        byte[] bytes=new byte[16384];int count,total=0;while(total<4*1024*1024&&(count=input.read(bytes,0,Math.min(bytes.length,4*1024*1024-total)))>0){output.write(bytes,0,count);total+=count;}
                    }
                }catch(IOException error){entry.put("traceError",error.toString());}
                if(trace.isFile())entry.put("trace",trace.getName());entries.put(entry);
            }
            Files.write(new File(folder,"exit-history.json").toPath(),entries.toString(2).getBytes(StandardCharsets.UTF_8));
        }catch(Exception error){android.util.Log.w("Studio","Exit history",error);}
    }
}
