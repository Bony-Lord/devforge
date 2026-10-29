package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** One persistent static-analysis worker per trusted Python project. */
final class PythonIntelligenceEngine {
    final IdeEngine ide;final PythonStyleEngine store;final Map<String,CompletableFuture<JSONObject>> pending=new ConcurrentHashMap<>();
    final Object administration=new Object();volatile boolean installing;Process process;String project;long sequence;CompletableFuture<JSONObject> started;
    PythonIntelligenceEngine(IdeEngine ide)throws Exception{this.ide=ide;store=new PythonStyleEngine(ide,"python-intelligence","intelligence-manifest.json","intelligence.py");}
    JSONObject info()throws Exception{return store.info();}
    JSONObject manage(String action,JSONObject d)throws Exception{synchronized(administration){installing=true;try{stop();JSONObject result=store.manage(action,d);if(action.equals("remove")){for(String name:Arrays.asList("libraries","index")){File directory=new File(store.cache,name);if(directory.exists()){Path root=store.cache.getCanonicalFile().toPath(),target=directory.getCanonicalFile().toPath();if(!target.startsWith(root)||target.equals(root))throw new IOException("Python cache escaped its root");try(java.util.stream.Stream<Path> paths=Files.walk(target)){for(Path p:(Iterable<Path>)paths.sorted(Comparator.reverseOrder())::iterator)Files.deleteIfExists(p);}}}}return result;}finally{installing=false;}}}

    synchronized CompletableFuture<JSONObject> ready()throws Exception{
        if(installing)throw new IOException("Finish the Python intelligence component operation first");ide.addons.require("studio.python-intelligence");ide.requireWorkspaceTrust();String root=ide.project(ide.currentProject).getCanonicalPath();if(process!=null&&process.isAlive()&&root.equals(project))return started;stop();store.copyScripts();File python=new File(ide.usr,"bin/python3");if(!python.isFile())throw new IOException("Install the Python runtime");store.cache.mkdirs();
        Map<String,String> env=new HashMap<>();env.put("PYTHONPATH","");env.put("PYTHONUTF8","1");Process child=ide.spawn(Arrays.asList(python.getPath(),"-B","-u",new File(ide.app.getFilesDir(),"python/intelligence.py").getPath(),"serve",store.cache.getPath()),store.cache,false,env);process=child;project=root;started=new CompletableFuture<>();CompletableFuture<JSONObject> startup=started;
        ide.pool.submit(()->{try(BufferedReader reader=new BufferedReader(new InputStreamReader(child.getInputStream(),StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null){if(line.length()>2*1024*1024)throw new IOException("Python analysis reply too large");JSONObject value=new JSONObject(line);if(value.optString("type").equals("ready")){startup.complete(value);continue;}CompletableFuture<JSONObject> request=pending.remove(value.optString("id"));if(request!=null){if(value.optBoolean("ok"))request.complete(value);else request.completeExceptionally(new IOException(value.optString("error","Python analysis failed")));}}throw new IOException("Python intelligence stopped");}catch(Exception error){startup.completeExceptionally(error);synchronized(PythonIntelligenceEngine.this){if(process==child)stop();}}});
        ide.pool.submit(()->{try{IdeEngine.slurp(child.getErrorStream(),8192);}catch(Exception ignored){}});return startup;
    }
    JSONObject request(JSONObject d)throws Exception{
        ide.addons.require("studio.python-intelligence");ide.requireWorkspaceTrust();File root=ide.project(ide.currentProject),source=ide.readable(d.getString("path"));if(!root.getCanonicalPath().equals(new File(d.getString("root")).getCanonicalPath())||!ide.inside(source,root)||!source.getName().endsWith(d.optBoolean("notebook")?".ipynb":".py")||d.getString("text").getBytes(StandardCharsets.UTF_8).length>524288||!Arrays.asList("complete","hover","signature").contains(d.optString("action")))throw new IOException("Invalid Python intelligence source");
        CompletableFuture<JSONObject> startup=ready();try{startup.get(30,TimeUnit.SECONDS);}catch(TimeoutException error){synchronized(this){if(started==startup)stop();}throw error;}String id;CompletableFuture<JSONObject> result=new CompletableFuture<>();synchronized(this){ide.addons.require("studio.python-intelligence");ide.requireWorkspaceTrust();if(process==null||started!=startup||!root.getCanonicalPath().equals(project))throw new IOException("Python project changed");if(pending.size()>32)throw new IOException("Python analysis queue is full");id=Long.toString(++sequence);pending.put(id,result);JSONObject request=new JSONObject().put("id",id).put("root",root.getCanonicalPath()).put("path",source.getCanonicalPath()).put("text",d.getString("text")).put("notebook",d.optBoolean("notebook")).put("line",d.getInt("line")).put("column",d.getInt("column")).put("action",d.getString("action"));process.getOutputStream().write((request+"\n").getBytes(StandardCharsets.UTF_8));process.getOutputStream().flush();}
        try{return result.get(20,TimeUnit.SECONDS);}catch(TimeoutException error){synchronized(this){if(started==startup)stop();}throw error;}finally{pending.remove(id);}
    }
    synchronized void stop(){Process child=process;process=null;project=null;if(child!=null)child.destroyForcibly();if(started!=null&&!started.isDone())started.completeExceptionally(new IOException("Python analysis restarted"));for(CompletableFuture<JSONObject> request:pending.values())request.completeExceptionally(new IOException("Python analysis restarted"));pending.clear();}
}
