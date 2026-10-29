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
    int timeoutSeconds,totalSeconds,diskMb;
    long totalUsed,cellStarted;
    File budgetRoot;
    java.util.concurrent.ScheduledFuture<?> totalTimer,diskTimer;
    java.util.concurrent.ScheduledFuture<?> cellTimer;
    final java.util.concurrent.ScheduledExecutorService timer=java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
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
        JSONObject options=d.optJSONObject("options");if(options==null)options=ide.settings();File cwd=BuildProfiles.workingDirectory(ide,options);Map<String,String> environment=BuildProfiles.environment(options);int memory=options.optInt("notebookMemoryMb",0),seconds=options.optInt("notebookTimeoutSeconds",0);if(memory<0||memory>1048576||memory>0&&memory<64||seconds<0||seconds>86400)throw new IOException("Invalid notebook resource limits");int cpu=options.optInt("notebookCpuPercent",0),disk=options.optInt("notebookDiskMb",0),total=options.optInt("notebookTotalSeconds",0);if(cpu<0||cpu>100||disk<0||disk>1048576||total<0||total>604800)throw new IOException("Invalid notebook resource limits");String gpu=options.optString("notebookGpuMode","allow");if(options.has("notebookGpuPercent")&&options.optInt("notebookGpuPercent")!=100&&!(options.optInt("notebookGpuPercent")==0&&gpu.equals("disabled")))throw new IOException("GPU percentage quota is unsupported by the local runner");if(!Arrays.asList("allow","disabled").contains(gpu))throw new IOException("Invalid notebook GPU mode");if(gpu.equals("disabled")){environment.put("CUDA_VISIBLE_DEVICES","");environment.put("HIP_VISIBLE_DEVICES","-1");environment.put("ROCR_VISIBLE_DEVICES","");environment.put("JAX_PLATFORMS","cpu");}environment.put("DEVFORGE_NOTEBOOK_CPU_PERCENT",String.valueOf(cpu));environment.put("DEVFORGE_NOTEBOOK_MEMORY_MB",String.valueOf(memory));String key=cwd.getCanonicalPath()+new TreeMap<>(environment).toString()+seconds+":"+disk+":"+total;
        if(kernel!=null&&kernel.isAlive()&&path.equals(notebook)&&key.equals(contextKey))return info().put("session",generation);
        stop();timeoutSeconds=seconds;totalSeconds=total;diskMb=disk;totalUsed=0;budgetRoot=cwd;if(diskMb>0&&diskBytes(cwd,(long)diskMb*1048576)>(long)diskMb*1048576)throw new IOException("Notebook disk budget already exceeded");String python=executable();File script=new File(ide.app.getFilesDir(),"python/kernel.py");script.getParentFile().mkdirs();
        for(String asset:Arrays.asList("kernel.py","notebook_magics.py","notebook_limits.py"))try(InputStream in=ide.app.getAssets().open("python/"+asset)){byte[] bytes=IdeEngine.slurp(in,1024*1024).getBytes(StandardCharsets.UTF_8);File target=new File(script.getParentFile(),asset);if(!target.isFile()||!Arrays.equals(Files.readAllBytes(target.toPath()),bytes))ProjectTemplateFiles.replace(target,bytes);}
        Process process=ide.spawn(Arrays.asList(python,"-B","-u",script.getAbsolutePath()),cwd,false,environment);kernel=process;notebook=path;contextKey=key;long session=++generation;
        ide.pool.execute(()->read(process,session,path));ide.pool.execute(()->ide.pump(process.getErrorStream(),"notebook","stderr"));
        if(diskMb>0)diskTimer=timer.scheduleWithFixedDelay(()->{try{if(diskBytes(budgetRoot,(long)diskMb*1048576)>(long)diskMb*1048576)budgetExceeded(session,"Notebook disk budget exceeded; files retained");}catch(Exception error){budgetExceeded(session,"Notebook disk monitor failed: "+error.getMessage());}},750,750,java.util.concurrent.TimeUnit.MILLISECONDS);return info().put("session",session);
    }
    synchronized JSONObject execute(JSONObject d)throws Exception {
        ide.requireWorkspaceTrust();if(kernel==null||!kernel.isAlive()||!notebook.equals(ide.readable(d.getString("path")).getCanonicalPath()))throw new IOException("Notebook kernel is stopped");
        if(busy)throw new IOException("Notebook kernel is busy");String id=d.getString("id"),code=d.getString("code");if(id.length()>128||code.length()>2*1024*1024)throw new IOException("Notebook input exceeds limits");
        JSONObject message=new JSONObject().put("id",id).put("code",code).put("filename",notebook+"#cell-"+d.optInt("cell",0));busy=true;final long session=generation;final String source=notebook;cellStarted=System.nanoTime();if(totalSeconds>0){long remaining=totalSeconds*1000L-totalUsed;if(remaining<=0){budgetExceeded(session,"Notebook execution time limit exceeded");throw new IOException("Notebook execution time limit exceeded");}totalTimer=timer.schedule(()->budgetExceeded(session,"Notebook execution time limit exceeded"),remaining,java.util.concurrent.TimeUnit.MILLISECONDS);}if(cellTimer!=null)cellTimer.cancel(false);if(timeoutSeconds>0)cellTimer=timer.schedule(()->{synchronized(this){if(session!=generation||!busy)return;ide.app.event("notebook",NativeEditorHost.object("type","error","ename","TimeoutError","evalue","Cell time limit exceeded","traceback",new JSONArray(),"id",id,"session",session,"path",source));ide.app.event("notebook",NativeEditorHost.object("type","stopped","session",session,"path",source));stop();}},timeoutSeconds,java.util.concurrent.TimeUnit.SECONDS);
        try{kernel.getOutputStream().write((message.toString()+"\n").getBytes(StandardCharsets.UTF_8));kernel.getOutputStream().flush();}catch(Exception e){busy=false;throw e;}
        return new JSONObject().put("session",generation);
    }
    void read(Process process,long session,String path){
        try(BufferedReader in=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8))){String line;while((line=in.readLine())!=null){if(line.length()>3*1024*1024)throw new IOException("Kernel message too large");JSONObject value=new JSONObject(line);if(value.optString("type").equals("environmentChanged"))ide.pythonIntelligence.stop();synchronized(this){if(session!=generation)return;if(value.optString("type").equals("idle")){busy=false;if(cellStarted>0){totalUsed+=(System.nanoTime()-cellStarted)/1000000;cellStarted=0;}if(totalTimer!=null)totalTimer.cancel(false);if(cellTimer!=null)cellTimer.cancel(false);}}value.put("session",session).put("path",path);ide.app.event("notebook",value);}}
        catch(Exception e){android.util.Log.w("DevForge","Notebook session",e);}
        finally{synchronized(this){if(session==generation){kernel=null;busy=false;ide.app.event("notebook",NativeEditorHost.object("type","stopped","session",session,"path",path));}}}
    }
    long diskBytes(File folder,long max)throws IOException{long size=0;int entries=0;try(java.util.stream.Stream<Path> walk=Files.walk(folder.toPath())){Iterator<Path> it=walk.iterator();while(it.hasNext()){Path file=it.next();if(++entries>200000)throw new IOException("Notebook disk scan exceeds 200000 entries");if(Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)){try{size+=Files.size(file);}catch(NoSuchFileException ignored){}if(size>max)break;}}}return size;}
    synchronized void budgetExceeded(long session,String message){if(generation!=session||kernel==null)return;ide.app.event("notebook",NativeEditorHost.object("type","stopped","session",session,"path",notebook,"message",message));stop();}
    synchronized boolean stopSession(long session){if(session!=generation)return false;stop();return true;}
    synchronized void stop(){if(totalTimer!=null)totalTimer.cancel(false);if(diskTimer!=null)diskTimer.cancel(false);cellStarted=0;if(cellTimer!=null)cellTimer.cancel(false);generation++;Process p=kernel;kernel=null;notebook=null;busy=false;if(p!=null){p.destroy();if(p.isAlive())p.destroyForcibly();}}
}
