package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Pinned optional components; archive hashes and paths come from the signed APK. */
final class ToolPacks {
    final IdeEngine ide;
    final JSONObject catalog;
    final PackDownload download=new PackDownload();
    volatile boolean installing;
    final java.util.concurrent.atomic.AtomicBoolean operationBusy=new java.util.concurrent.atomic.AtomicBoolean();
    interface Operation {void run()throws Exception;}
    AutoCloseable guardBuild()throws IOException{if(!operationBusy.compareAndSet(false,true))throw new IOException("Component operation is already running");return()->operationBusy.set(false);}
    Object mutate(Operation operation)throws Exception{
        if(!operationBusy.compareAndSet(false,true))throw new IOException("Component operation is already running");installing=true;
        try{if(ide.closed||ide.building!=null&&ide.building.isAlive()||ide.execution!=null&&ide.execution.isAlive()||ide.tools.debuggerRunning())throw new IOException("Stop running tools first");operation.run();}
        finally{installing=false;operationBusy.set(false);}
        return state();
    }
    ToolPacks(IdeEngine ide)throws Exception{
        this.ide=ide;try(InputStream in=ide.app.getAssets().open("tool-packs.json")){catalog=new JSONObject(IdeEngine.slurp(in,4*1024*1024));}
    }
    JSONObject pack(String id)throws Exception{
        JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++)if(packs.getJSONObject(i).getString("id").equals(id))return packs.getJSONObject(i);
        throw new IOException("Unknown component");
    }
    boolean legacyBase(){
        try{File marker=new File(ide.usr,".studio-base-v2");return marker.isFile()&&IdeEngine.read(marker).equals(catalog.optString("legacyBaseSha256"));}catch(Exception e){return false;}
    }
    boolean installed(JSONObject p){
        String id=p.optString("id");File probe=new File(ide.usr,p.optString("probePath","bin/"+p.optString("probe")));
        if(!probe.isFile()||new File(ide.usr,".pack-"+id+"-incomplete").exists()||new File(ide.usr,".pack-"+id+"-removed").exists()||id.equals("gcc")&&new File(ide.usr,".gcc-removed").exists())return false;
        try{
            File marker=new File(ide.usr,".pack-"+id+"-installed");boolean valid=marker.isFile()?IdeEngine.read(marker).equals(p.optString("sha256")):new File(ide.usr,".forge-runtime-v1").exists()||Arrays.asList("platform","gcc","cmake").contains(id)&&legacyBase();
            if(!valid)return false;
            JSONArray requires=p.optJSONArray("requires");if(requires!=null)for(int i=0;i<requires.length();i++)if(!installed(pack(requires.getString(i))))return false;
            return true;
        }catch(Exception error){return false;}
    }
    static boolean gccPath(String path){return path.startsWith("lib/gcc/")||path.startsWith("libexec/gcc/")||path.startsWith("bin/")&&path.endsWith("-15");}
    static void removeGccFiles(File root,JSONObject base)throws Exception{Set<String> all=new HashSet<>();addPaths(all,base);for(String path:all)if(gccPath(path))Files.deleteIfExists(child(root,path).toPath());}
    JSONObject state()throws Exception{
        JSONObject result=publicFields(catalog);JSONArray packs=new JSONArray(),source=catalog.getJSONArray("packs");
        for(int i=0;i<source.length();i++){JSONObject p=source.getJSONObject(i);packs.put(publicFields(p).put("installed",installed(p)));}
        result.put("packs",packs);result.put("base",publicFields(catalog.getJSONObject("base")));
        return result.put("installing",installing);
    }
    static JSONObject publicFields(JSONObject source)throws JSONException{JSONObject result=new JSONObject();for(Iterator<String> keys=source.keys();keys.hasNext();){String key=keys.next();if(!Arrays.asList("files","links","packs","base").contains(key))result.put(key,source.get(key));}return result;}
    static String hash(File file)throws Exception{return PackDownload.hash(file);}
    void progress(String id,long done,long total,String phase){ide.app.event("toolPackProgress",NativeEditorHost.object("id",id,"done",done,"total",total,"phase",phase));}
    void cancel(){download.cancel();}
    Object install(String id)throws Exception{
        return mutate(()->{pack(id);download.reset();try{installOne(id,new HashSet<>());}catch(Exception e){if(download.cancelled){progress(id,0,1,"cancelled");throw new InterruptedIOException("Загрузка отменена");}throw e;}});
    }
    void installOne(String id,Set<String> visiting)throws Exception{
        download.check();JSONObject p=pack(id);if(!visiting.add(id))throw new IOException("Component dependency cycle");
        JSONArray requires=p.getJSONArray("requires");for(int i=0;i<requires.length();i++)installOne(requires.getString(i),visiting);
        visiting.remove(id);if(installed(p))return;
        File archive=new File(ide.tmp,"pack-"+id+".zip");
        URL address=new URL("https://github.com/Bony-Lord/devforge/releases/download/"+p.optString("release",catalog.getString("release"))+"/"+p.getString("asset"));
        long total=p.getLong("bytes");download.fetch(address,archive,total,p.getString("sha256"),(done,size)->progress(id,done,size,"download"));download.check();
        Files.write(new File(ide.usr,".pack-"+id+"-incomplete").toPath(),new byte[0]);progress(id,total,total,"extract");
        extract(ide.usr,archive,id);
        download.check();
        Files.write(new File(ide.usr,".pack-"+id+"-installed").toPath(),p.getString("sha256").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        Files.deleteIfExists(new File(ide.usr,".pack-"+id+"-incomplete").toPath());Files.deleteIfExists(new File(ide.usr,".pack-"+id+"-removed").toPath());
        if(id.equals("gcc"))Files.deleteIfExists(new File(ide.usr,".gcc-removed").toPath());
        Files.deleteIfExists(archive.toPath());progress(id,total,total,"installed");
    }
    Object remove(String id)throws Exception{return mutate(()->removeOne(id));}
    void removeOne(String id)throws Exception{
        if(ide.addons.enabled("studio.tool."+id))throw new IOException("Disable dependent addons before removing this tool");
        JSONObject p=pack(id);
        JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++){JSONObject other=packs.getJSONObject(i);JSONArray requires=other.getJSONArray("requires");for(int j=0;j<requires.length();j++)if(installed(other)&&requires.getString(j).equals(id))throw new IOException("Component is required by "+other.getString("id"));}
        Files.write(new File(ide.usr,".pack-"+id+"-removed").toPath(),new byte[0]);Files.deleteIfExists(new File(ide.usr,".pack-"+id+"-installed").toPath());
        if(id.equals("analysis")||id.equals("gcc"))ide.stopLsp();
        if(id.equals("gcc"))Files.write(new File(ide.usr,".gcc-removed").toPath(),new byte[0]);
        Set<String> keep=new HashSet<>();for(int i=0;i<packs.length();i++){JSONObject other=packs.getJSONObject(i);if(!id.equals(other.getString("id"))&&installed(other))addPaths(keep,other);}
        for(String key:new String[]{"files","links"}){JSONArray paths=p.getJSONArray(key);for(int i=0;i<paths.length();i++){String path=paths.getString(i);if(keep.contains(path))continue;File from=child(ide.usr,path);if(Files.exists(from.toPath(),LinkOption.NOFOLLOW_LINKS))Files.delete(from.toPath());}}
    }
    static void addPaths(Set<String> target,JSONObject p)throws Exception{for(String key:new String[]{"files","links"}){JSONArray values=p.getJSONArray(key);for(int i=0;i<values.length();i++)target.add(values.getString(i));}}
    static File child(File root,String path)throws Exception{
        if(path.isEmpty()||path.startsWith("/")||Arrays.asList(path.split("/")).contains(".."))throw new IOException("Invalid component path");
        File file=new File(root,path);if(!file.getParentFile().getCanonicalPath().startsWith(root.getCanonicalPath()+"/")&&!file.getParentFile().getCanonicalPath().equals(root.getCanonicalPath()))throw new IOException("Component path escapes destination");return file;
    }
    static void extract(File root,File archive,String expected)throws Exception{
        extract(root,archive,expected,null);
    }
    static void extract(File root,File archive,String expected,Set<String> selected)throws Exception{
        try(ZipFile zip=new ZipFile(archive)){
            JSONObject manifest=new JSONObject(IdeEngine.slurp(zip.getInputStream(zip.getEntry("forge-runtime.json")),4*1024*1024));if(!manifest.getString("id").equals(expected))throw new IOException("Component identity mismatch");JSONArray files=manifest.getJSONArray("files"),links=manifest.getJSONArray("links");
            // Check the entire archive before modifying the installed runtime.
            for(int i=0;i<files.length();i++){JSONObject entry=files.getJSONObject(i);child(root,entry.getString("path"));ZipEntry source=zip.getEntry(entry.getString("path"));if(source==null||source.isDirectory()||source.getSize()>256L*1024*1024)throw new IOException("Invalid component entry");}
            for(int i=0;i<links.length();i++)child(root,links.getJSONObject(i).getString("path"));
            for(int i=0;i<files.length();i++){JSONObject entry=files.getJSONObject(i);if(selected!=null&&!selected.contains(entry.getString("path")))continue;File file=child(root,entry.getString("path"));file.getParentFile().mkdirs();File temp=new File(file.getParentFile(),file.getName()+".installing");try(InputStream in=zip.getInputStream(zip.getEntry(entry.getString("path")))){Files.copy(in,temp.toPath(),StandardCopyOption.REPLACE_EXISTING);}if(!hash(temp).equals(entry.getString("sha256"))){Files.delete(temp.toPath());throw new IOException("Component file checksum mismatch");}if(entry.optBoolean("exec"))temp.setExecutable(true,true);if(entry.has("mtime"))temp.setLastModified(entry.getLong("mtime")*1000L);Files.move(temp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);}
            for(int round=0;round<2;round++)for(int i=0;i<links.length();i++){JSONObject entry=links.getJSONObject(i);if(selected!=null&&!selected.contains(entry.getString("path")))continue;File file=child(root,entry.getString("path"));String target=entry.getString("target");file.getParentFile().mkdirs();if(Files.isSymbolicLink(file.toPath()))Files.delete(file.toPath());if(Files.exists(file.toPath(),LinkOption.NOFOLLOW_LINKS))continue;if(entry.optBoolean("hard")){String relative=target.replaceFirst("^\\.?/?data/data/com.forgex/files/usr/","");File source=child(root,relative);if(source.exists())Files.createLink(file.toPath(),source.toPath());}else{if(target.startsWith("/")&&!target.equals("/system/bin/sh")&&!target.startsWith(root.getAbsolutePath()+"/")&&!target.startsWith("/data/data/com.forgex/files/usr/"))throw new IOException("Invalid link target");Files.createSymbolicLink(file.toPath(),Paths.get(target));}}
        }
    }
}
