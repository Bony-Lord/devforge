package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Optional verified pure-Python wheels. Project files are parsed, never executed. */
final class PythonStyleEngine {
    final IdeEngine ide;final File cache;final JSONObject manifest;final Map<String,Process> jobs=new ConcurrentHashMap<>();volatile boolean installing;
    PythonStyleEngine(IdeEngine ide)throws Exception{this.ide=ide;cache=new File(ide.app.getFilesDir(),"python-style");try(InputStream in=ide.app.getAssets().open("python/style-manifest.json")){manifest=new JSONObject(IdeEngine.slurp(in,65536));}}
    JSONObject info()throws Exception{JSONArray packages=new JSONArray(),source=manifest.getJSONArray("packages");long size=0;boolean installed=true;for(int i=0;i<source.length();i++){JSONObject p=new JSONObject(source.getJSONObject(i).toString());File file=new File(cache,p.getString("filename"));boolean ready=file.isFile()&&file.length()==p.getLong("bytes")&&ProjectTemplateFiles.hash(Files.readAllBytes(file.toPath())).equals(p.getString("sha256"));p.put("installed",ready);installed&=ready;size+=p.getLong("bytes");packages.put(p);}return new JSONObject().put("id","python-style").put("installed",installed).put("packages",packages).put("bytes",size).put("path",cache.getPath());}
    synchronized JSONObject manage(String action,JSONObject d)throws Exception{installing=true;stop();try{if(action.equals("remove")){JSONArray packages=manifest.getJSONArray("packages");for(int i=0;i<packages.length();i++)Files.deleteIfExists(new File(cache,packages.getJSONObject(i).getString("filename")).toPath());return info();}return run(action,d);}finally{installing=false;}}
    JSONObject request(String action,JSONObject d)throws Exception{
        if(installing)throw new IOException("Finish the Python style component operation first");ide.addons.require(action.equals("format")?"studio.python-formatting":"studio.python-diagnostics");ide.requireWorkspaceTrust();File root=ide.project(ide.currentProject),source=ide.readable(d.getString("path"));
        if(!root.getCanonicalPath().equals(new File(d.getString("root")).getCanonicalPath()))throw new IOException("Project changed; retry Python analysis");if(!ide.inside(source,root)||!source.getName().endsWith(d.optBoolean("notebook")?".ipynb":".py")||d.getString("text").getBytes(StandardCharsets.UTF_8).length>524288)throw new IOException("Invalid Python style source");return run(action,d);
    }
    JSONObject run(String action,JSONObject d)throws Exception{
        File python=new File(ide.usr,"bin/python3");if(!python.isFile())throw new IOException("PYTHON_UNAVAILABLE: Install the Python runtime");if(!cache.isDirectory()&&!cache.mkdirs())throw new IOException("Cannot create Python style cache");File scripts=new File(ide.app.getFilesDir(),"python");scripts.mkdirs();
        for(String name:Arrays.asList("style_tools.py","style-manifest.json","notebook_magics.py"))try(InputStream in=ide.app.getAssets().open("python/"+name)){byte[] bytes=IdeEngine.slurp(in,1024*1024).getBytes(StandardCharsets.UTF_8);File target=new File(scripts,name);if(!target.isFile()||!Arrays.equals(Files.readAllBytes(target.toPath()),bytes))ProjectTemplateFiles.replace(target,bytes);}
        Map<String,String> environment=new HashMap<>();environment.put("PYTHONPATH","");environment.put("PYTHONNOUSERSITE","1");environment.put("PYTHONUTF8","1");File certificate=new File(ide.usr,"etc/tls/cert.pem");if(certificate.isFile())environment.put("SSL_CERT_FILE",certificate.getPath());
        String key=action.equals("analyze")?d.optString("root")+"|"+d.optString("path")+"|"+d.optString("cell").substring(0,Math.min(128,d.optString("cell").length())):"admin-"+action;Process old=jobs.remove(key);if(old!=null)old.destroyForcibly();Process process=ide.spawn(Arrays.asList(python.getPath(),"-B","-S",new File(scripts,"style_tools.py").getPath(),action,cache.getPath()),cache,false,environment);jobs.put(key,process);
        Future<String> output=ide.pool.submit(()->IdeEngine.slurp(process.getInputStream(),4*1024*1024)),error=ide.pool.submit(()->IdeEngine.slurp(process.getErrorStream(),8192));
        try{try(OutputStream stdin=process.getOutputStream()){if(action.equals("analyze")||action.equals("format"))stdin.write(new JSONObject().put("root",d.getString("root")).put("path",d.getString("path")).put("text",d.getString("text")).put("notebook",d.optBoolean("notebook")).toString().getBytes(StandardCharsets.UTF_8));}if(!process.waitFor(action.equals("install")?180:20,TimeUnit.SECONDS))throw new IOException("Python style tool timed out");String text=output.get(5,TimeUnit.SECONDS),errors=error.get(5,TimeUnit.SECONDS);if(process.exitValue()!=0)throw new IOException(errors.isEmpty()?"Python style operation cancelled":errors);JSONObject result=new JSONObject(text);if(!result.optBoolean("ok"))throw new IOException(result.optString("error","Python style operation failed"));return result;}
        finally{jobs.remove(key,process);if(process.isAlive())process.destroyForcibly();output.cancel(true);error.cancel(true);}
    }
    void stop(){for(Process process:jobs.values())if(process.isAlive())process.destroyForcibly();jobs.clear();}
}
