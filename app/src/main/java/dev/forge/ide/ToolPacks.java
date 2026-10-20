package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;

/** Pinned optional components. Archive hashes and paths come from the signed APK. */
final class ToolPacks {
    final IdeEngine ide;final JSONObject catalog;volatile boolean installing;
    ToolPacks(IdeEngine ide)throws Exception{this.ide=ide;try(InputStream in=ide.app.getAssets().open("tool-packs.json")){catalog=new JSONObject(IdeEngine.slurp(in,4*1024*1024));}}
    JSONObject pack(String id)throws Exception{JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++)if(packs.getJSONObject(i).getString("id").equals(id))return packs.getJSONObject(i);throw new IOException("Unknown component");}
    boolean installed(JSONObject pack){String id=pack.optString("id");if(!new File(ide.usr,"bin/"+pack.optString("probe")).isFile()||new File(ide.usr,".pack-"+id+"-incomplete").exists())return false;File marker=new File(ide.usr,".pack-"+id+"-installed");try{return marker.isFile()?IdeEngine.read(marker).equals(pack.optString("sha256")):new File(ide.usr,".forge-runtime-v1").exists();}catch(Exception error){return false;}}
    JSONObject state()throws Exception{JSONObject result=new JSONObject(catalog.toString());JSONArray packs=result.getJSONArray("packs");for(int i=0;i<packs.length();i++){JSONObject pack=packs.getJSONObject(i);pack.put("installed",installed(pack));pack.remove("files");pack.remove("links");}result.getJSONObject("base").remove("files");result.getJSONObject("base").remove("links");return result.put("installing",installing);}
    static String hash(File file)throws Exception{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] buffer=new byte[131072];int n;while((n=in.read(buffer))>0)digest.update(buffer,0,n);}StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format("%02x",b&255));return out.toString();}
    void progress(String id,long done,long total,String phase){ide.app.event("toolPackProgress",NativeEditorHost.object("id",id,"done",done,"total",total,"phase",phase));}
    synchronized Object install(String id)throws Exception{
        if(installing)throw new IOException("Component operation is already running");JSONObject p=pack(id);installing=true;
        File archive=new File(ide.tmp,"pack-"+id+".zip");
        try{for(int i=0;i<p.getJSONArray("requires").length();i++)if(!installed(pack(p.getJSONArray("requires").getString(i))))throw new IOException("Install required component: "+p.getJSONArray("requires").getString(i));
            String address="https://github.com/Bony-Lord/gcc-cpp-studio/releases/download/"+catalog.getString("release")+"/"+p.getString("asset");
            URLConnection connection=new URL(address).openConnection();connection.setConnectTimeout(20000);connection.setReadTimeout(30000);connection.setRequestProperty("User-Agent","CppStudio/0.3");
            long total=p.getLong("bytes"),done=0,last=0;try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(archive)){byte[] buffer=new byte[131072];int n;while((n=in.read(buffer))>0){done+=n;if(done>total)throw new IOException("Component size mismatch");out.write(buffer,0,n);if(done-last>1024*1024){progress(id,done,total,"download");last=done;}}}
            if(done!=total||!hash(archive).equals(p.getString("sha256")))throw new IOException("Component checksum mismatch");
            Files.write(new File(ide.usr,".pack-"+id+"-incomplete").toPath(),new byte[0]);extract(ide.usr,archive,p.getString("id"));Files.write(new File(ide.usr,".pack-"+id+"-installed").toPath(),p.getString("sha256").getBytes(java.nio.charset.StandardCharsets.UTF_8));Files.deleteIfExists(new File(ide.usr,".pack-"+id+"-incomplete").toPath());progress(id,total,total,"installed");return state();
        }finally{Files.deleteIfExists(archive.toPath());installing=false;}
    }
    synchronized Object remove(String id)throws Exception{
        JSONObject p=pack(id);if(ide.building!=null&&ide.building.isAlive()||ide.execution!=null&&ide.execution.isAlive()||ide.tools.debuggerRunning())throw new IOException("Stop running tools first");
        JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++){JSONObject other=packs.getJSONObject(i);if(installed(other)&&other.getJSONArray("requires").toString().contains("\""+id+"\""))throw new IOException("Component is required by "+other.getString("id"));}
        Files.deleteIfExists(new File(ide.usr,".pack-"+id+"-installed").toPath());if(id.equals("analysis"))ide.stopLsp();Set<String> keep=new HashSet<>();addPaths(keep,catalog.getJSONObject("base"));for(int i=0;i<packs.length();i++){JSONObject other=packs.getJSONObject(i);if(!id.equals(other.getString("id"))&&installed(other))addPaths(keep,other);}
        
        for(String key:new String[]{"files","links"}){JSONArray paths=p.getJSONArray(key);for(int i=0;i<paths.length();i++){String path=paths.getString(i);if(keep.contains(path))continue;File from=child(ide.usr,path);if(!Files.exists(from.toPath(),LinkOption.NOFOLLOW_LINKS))continue;Files.delete(from.toPath());}}
        return state();
    }
    static void addPaths(Set<String> target,JSONObject p)throws Exception{for(String key:new String[]{"files","links"}){JSONArray values=p.getJSONArray(key);for(int i=0;i<values.length();i++)target.add(values.getString(i));}}
    static File child(File root,String path)throws Exception{if(path.isEmpty()||path.startsWith("/")||Arrays.asList(path.split("/")).contains(".."))throw new IOException("Invalid component path");File file=new File(root,path);if(!file.getParentFile().getCanonicalPath().startsWith(root.getCanonicalPath()+"/")&&!file.getParentFile().getCanonicalPath().equals(root.getCanonicalPath()))throw new IOException("Component path escapes destination");return file;}
    static void extract(File root,File archive,String expected)throws Exception{
        try(ZipFile zip=new ZipFile(archive)){
            JSONObject manifest=new JSONObject(IdeEngine.slurp(zip.getInputStream(zip.getEntry("forge-runtime.json")),4*1024*1024));if(!manifest.getString("id").equals(expected))throw new IOException("Component identity mismatch");JSONArray files=manifest.getJSONArray("files"),links=manifest.getJSONArray("links");
            // Check the entire archive before modifying the installed runtime.
            for(int i=0;i<files.length();i++){JSONObject entry=files.getJSONObject(i);child(root,entry.getString("path"));ZipEntry source=zip.getEntry(entry.getString("path"));if(source==null||source.isDirectory()||source.getSize()>256L*1024*1024)throw new IOException("Invalid component entry");}
            for(int i=0;i<links.length();i++)child(root,links.getJSONObject(i).getString("path"));
            for(int i=0;i<files.length();i++){JSONObject entry=files.getJSONObject(i);File file=child(root,entry.getString("path"));file.getParentFile().mkdirs();File temp=new File(file.getParentFile(),file.getName()+".installing");try(InputStream in=zip.getInputStream(zip.getEntry(entry.getString("path")))){Files.copy(in,temp.toPath(),StandardCopyOption.REPLACE_EXISTING);}if(!hash(temp).equals(entry.getString("sha256"))){Files.delete(temp.toPath());throw new IOException("Component file checksum mismatch");}if(entry.optBoolean("exec"))temp.setExecutable(true,true);if(entry.has("mtime"))temp.setLastModified(entry.getLong("mtime")*1000L);Files.move(temp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);}
            for(int round=0;round<2;round++)for(int i=0;i<links.length();i++){JSONObject entry=links.getJSONObject(i);File file=child(root,entry.getString("path"));String target=entry.getString("target");file.getParentFile().mkdirs();if(Files.isSymbolicLink(file.toPath()))Files.delete(file.toPath());if(Files.exists(file.toPath(),LinkOption.NOFOLLOW_LINKS))continue;if(entry.optBoolean("hard")){String relative=target.replaceFirst("^\\.?/?data/data/com.forgex/files/usr/","");File source=child(root,relative);if(source.exists())Files.createLink(file.toPath(),source.toPath());}else{if(target.startsWith("/")&&!target.equals("/system/bin/sh")&&!target.startsWith(root.getAbsolutePath()+"/")&&!target.startsWith("/data/data/com.forgex/files/usr/"))throw new IOException("Invalid link target");Files.createSymbolicLink(file.toPath(),Paths.get(target));}}
        }
    }
}
