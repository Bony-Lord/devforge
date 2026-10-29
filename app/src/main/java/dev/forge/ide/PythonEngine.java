package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** A trusted-project Python runner and one disposable notebook session. */
final class PythonEngine {
    final IdeEngine ide;
    Process kernel;
    String notebook,contextKey;
    long generation;
    boolean busy;
    PythonEngine(IdeEngine ide){this.ide=ide;}
    String executable()throws Exception {
        ide.addons.require("studio.python");
        File file=new File(ide.usr,"bin/python3");
        if(!file.isFile())throw new IOException("PYTHON_UNAVAILABLE: Install or enable the Python runtime");
        return file.getAbsolutePath();
    }
    JSONObject info()throws Exception {
        File file=new File(ide.usr,"bin/python3");return new JSONObject().put("available",file.isFile()).put("path",file.getAbsolutePath()).put("delivery",ide.app.installedRuntime==null?"tool-pack":"packaged");
    }
    JSONObject run(JSONObject d)throws Exception {
        ide.requireWorkspaceTrust();File source=ide.readable(d.getString("path"));
        if(!ide.inside(source,ide.project(ide.currentProject))||!source.getName().endsWith(".py"))throw new IOException("Select a Python file in the project");
        if(ide.execution!=null&&ide.execution.isAlive())throw new IOException("Stop the current program first");
        JSONObject options=d.optJSONObject("options");if(options==null)options=ide.settings();
        List<String> command=new ArrayList<>(Arrays.asList(executable(),"-u",source.getAbsolutePath()));JSONArray args=d.optJSONArray("args");if(args!=null)for(int i=0;i<Math.min(256,args.length());i++)command.add(args.getString(i));
        String id=d.getString("id");Process p=ide.spawn(command,BuildProfiles.workingDirectory(ide,options),false,BuildProfiles.environment(options));ide.attachExecution(p,id);return new JSONObject().put("id",id);
    }
    JSONObject check(JSONObject d)throws Exception {
        ide.requireWorkspaceTrust();File file=ide.readable(d.getString("path"));if(!ide.inside(file,ide.project(ide.currentProject))||!file.getName().endsWith(".py"))throw new IOException("Select a project Python file");
        return ide.languages.capture(Arrays.asList(executable(),"-c","import sys, tokenize; p=sys.argv[1]; f=tokenize.open(p); s=f.read(); f.close(); compile(s,p,'exec'); print('Python syntax OK')",file.getAbsolutePath()),"");
    }
    synchronized JSONObject start(JSONObject d)throws Exception {
        ide.requireWorkspaceTrust();String path=ide.readable(d.getString("path")).getCanonicalPath();
        if(!path.endsWith(".ipynb")||!ide.inside(new File(path),ide.project(ide.currentProject)))throw new IOException("Select a project notebook");
        JSONObject options=d.optJSONObject("options");if(options==null)options=ide.settings();File cwd=BuildProfiles.workingDirectory(ide,options);Map<String,String> environment=BuildProfiles.environment(options);String key=cwd.getCanonicalPath()+new TreeMap<>(environment).toString();
        if(kernel!=null&&kernel.isAlive()&&path.equals(notebook)&&key.equals(contextKey))return info().put("session",generation);
        stop();String python=executable();File script=new File(ide.app.getFilesDir(),"python/kernel.py");script.getParentFile().mkdirs();
        for(String asset:Arrays.asList("kernel.py","notebook_magics.py"))try(InputStream in=ide.app.getAssets().open("python/"+asset)){byte[] bytes=IdeEngine.slurp(in,1024*1024).getBytes(StandardCharsets.UTF_8);File target=new File(script.getParentFile(),asset);if(!target.isFile()||!Arrays.equals(Files.readAllBytes(target.toPath()),bytes))ProjectTemplateFiles.replace(target,bytes);}
        Process process=ide.spawn(Arrays.asList(python,"-B","-u",script.getAbsolutePath()),cwd,false,environment);kernel=process;notebook=path;contextKey=key;long session=++generation;
        ide.pool.execute(()->read(process,session,path));ide.pool.execute(()->ide.pump(process.getErrorStream(),"notebook","stderr"));
        return info().put("session",session);
    }
    synchronized JSONObject execute(JSONObject d)throws Exception {
        ide.requireWorkspaceTrust();if(kernel==null||!kernel.isAlive()||!notebook.equals(ide.readable(d.getString("path")).getCanonicalPath()))throw new IOException("Notebook kernel is stopped");
        if(busy)throw new IOException("Notebook kernel is busy");String id=d.getString("id"),code=d.getString("code");if(id.length()>128||code.length()>2*1024*1024)throw new IOException("Notebook input exceeds limits");
        JSONObject message=new JSONObject().put("id",id).put("code",code).put("filename",notebook+"#cell-"+d.optInt("cell",0));busy=true;
        try{kernel.getOutputStream().write((message.toString()+"\n").getBytes(StandardCharsets.UTF_8));kernel.getOutputStream().flush();}catch(Exception e){busy=false;throw e;}
        return new JSONObject().put("session",generation);
    }
    void read(Process process,long session,String path){
        try(BufferedReader in=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8))){String line;while((line=in.readLine())!=null){if(line.length()>3*1024*1024)throw new IOException("Kernel message too large");JSONObject value=new JSONObject(line);synchronized(this){if(session!=generation)return;if(value.optString("type").equals("idle"))busy=false;}value.put("session",session).put("path",path);ide.app.event("notebook",value);}}
        catch(Exception e){android.util.Log.w("DevForge","Notebook session",e);}
        finally{synchronized(this){if(session==generation){kernel=null;busy=false;ide.app.event("notebook",NativeEditorHost.object("type","stopped","session",session,"path",path));}}}
    }
    synchronized boolean stopSession(long session){if(session!=generation)return false;stop();return true;}
    synchronized void stop(){generation++;Process p=kernel;kernel=null;notebook=null;busy=false;if(p!=null){p.destroy();if(p.isAlive())p.destroyForcibly();}}
}
