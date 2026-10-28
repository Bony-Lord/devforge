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
        if(ide.app.installedRuntime!=null){if(!ide.app.installedRuntime.enabled(p.optString("id")))return false;if(ide.app.installedRuntime.components!=null){JSONArray dependencies=p.optJSONArray("requires");if(dependencies!=null)try{for(int i=0;i<dependencies.length();i++)if(!installed(pack(dependencies.getString(i))))return false;}catch(Exception e){return false;}}return true;}
        if(p.has("aliasOf"))try{return installed(pack(p.getString("aliasOf")));}catch(Exception e){return false;}
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
        boolean components=ide.app.installedRuntime!=null&&ide.app.installedRuntime.components!=null;if(components)ide.app.installedRuntime.components.refresh();JSONObject result=publicFields(catalog);if(ide.app.installedRuntime!=null)result.put("delivery",components?catalog.optString("delivery","component-apks"):"bundled");JSONArray packs=new JSONArray(),source=catalog.getJSONArray("packs");
        for(int i=0;i<source.length();i++){JSONObject p=source.getJSONObject(i);String id=p.getString("id");JSONObject item=publicFields(p).put("installed",installed(p)).put("bundled",ide.app.installedRuntime!=null&&!components).put("bytes",ide.app.installedRuntime!=null&&!components||p.has("aliasOf")?0:p.optLong("bytes"));if(components){RuntimeComponents c=ide.app.installedRuntime.components;item.put("installedPackage",c.sharedEngine()?c.dataPresent(id):c.present(id));if(c.sharedEngine()&&id.equals("platform")&&!engineAvailable())item.put("bytes",item.getLong("bytes")+catalog.getJSONObject("engine").getLong("bytes"));if(c.errors.containsKey(id))item.put("error",c.errors.get(id));}packs.put(item);}
        result.put("packs",packs);result.put("base",publicFields(catalog.getJSONObject("base")));
        return result.put("installing",installing);
    }
    static JSONObject publicFields(JSONObject source)throws JSONException{JSONObject result=new JSONObject();for(Iterator<String> keys=source.keys();keys.hasNext();){String key=keys.next();if(!Arrays.asList("files","links","packs","base").contains(key))result.put(key,source.get(key));}return result;}
    static String hash(File file)throws Exception{return PackDownload.hash(file);}
    void progress(String id,long done,long total,String phase){ide.app.event("toolPackProgress",NativeEditorHost.object("id",id,"done",done,"total",total,"phase",phase));}
    void cancel(){download.cancel();ide.app.componentInstaller.cancel();}
    boolean engineAvailable(){try{return ide.app.installedRuntime.components.resolve("platform")!=null;}catch(Exception incompatible){return false;}}
    File fetchComponent(JSONObject p,String cache,String id)throws Exception{File file=new File(ide.tmp,cache);URL address=new URL("https://github.com/Bony-Lord/devforge/releases/download/"+p.getString("release")+"/"+p.getString("asset"));download.fetch(address,file,p.getLong("bytes"),p.getString("sha256"),(done,total)->progress(id,done,total,"download"));return file;}
    Object install(String id)throws Exception{
        if(ide.app.installedRuntime!=null)return mutate(()->{if(ide.app.installedRuntime.components==null)ide.app.installedRuntime.enabled(id,true);else{download.reset();installComponents(new JSONArray().put(id));}});
        return mutate(()->{pack(id);download.reset();try{installOne(id,new HashSet<>());}catch(Exception e){if(download.cancelled){progress(id,0,1,"cancelled");throw new InterruptedIOException("Загрузка отменена");}throw e;}});
    }
    Object importComponent(android.net.Uri uri)throws Exception {return mutate(()->{
        if(ide.app.installedRuntime==null||ide.app.installedRuntime.components==null)throw new IOException("Native APK components require the modern Android host");File temporary=new File(ide.tmp,"import-runtime.apk");
        try{long max=catalog.has("engine")?catalog.getJSONObject("engine").getLong("bytes"):0;JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++)max=Math.max(max,packs.getJSONObject(i).getLong("bytes"));try(InputStream in=ide.app.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(temporary)){if(in==null)throw new IOException("Cannot read component document");byte[] buffer=new byte[131072];long total=0;int n;while((n=in.read(buffer))!=-1){total+=n;if(total>max)throw new IOException("Component file is too large");out.write(buffer,0,n);}}
            if(ide.app.installedRuntime.components.sharedEngine()){String checksum=hash(temporary);JSONObject engine=catalog.getJSONObject("engine");if(temporary.length()==engine.getLong("bytes")&&checksum.equals(engine.getString("sha256"))){ide.app.componentInstaller.install(temporary,engine);ide.app.installedRuntime.components.refresh();return;}for(int i=0;i<packs.length();i++){JSONObject p=packs.getJSONObject(i);if(temporary.length()==p.getLong("bytes")&&checksum.equals(p.getString("sha256"))){ide.app.installedRuntime.components.installData(p.getString("id"),temporary);ide.app.installedRuntime.enabled(p.getString("id"),true);return;}}throw new IOException("This is not a compatible official engine or .studio-toolpack");}
            android.content.pm.PackageInfo archive=ide.app.getPackageManager().getPackageArchiveInfo(temporary.getAbsolutePath(),android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES);JSONObject selected=null;if(archive!=null)for(int i=0;i<packs.length();i++)if(packs.getJSONObject(i).getString("package").equals(archive.packageName))selected=packs.getJSONObject(i);if(selected==null||temporary.length()!=selected.getLong("bytes")||!hash(temporary).equals(selected.getString("sha256")))throw new IOException("This is not a compatible official runtime component");ide.app.componentInstaller.install(temporary,selected);ide.app.installedRuntime.enabled(selected.getString("id"),true);ide.app.installedRuntime.components.refresh();
        }finally{Files.deleteIfExists(temporary.toPath());}
    });}
    Object installMany(JSONArray ids)throws Exception{return mutate(()->{if(ide.app.installedRuntime==null||ide.app.installedRuntime.components==null)throw new IOException("Batch components require the modern host");download.reset();installComponents(ids);});}
    void componentOrder(String id,Set<String> visiting,LinkedHashSet<String> order)throws Exception{if(order.contains(id))return;if(!visiting.add(id))throw new IOException("Component dependency cycle");JSONObject p=pack(id);JSONArray dependencies=p.getJSONArray("requires");for(int i=0;i<dependencies.length();i++)componentOrder(dependencies.getString(i),visiting,order);visiting.remove(id);order.add(id);}
    void installComponents(JSONArray ids)throws Exception {
        if(ids.length()>32)throw new IOException("Too many component requests");LinkedHashSet<String> order=new LinkedHashSet<>();for(int i=0;i<ids.length();i++)componentOrder(ids.getString(i),new HashSet<>(),order);InstalledRuntime runtime=ide.app.installedRuntime;runtime.components.refresh();List<File> apks=new ArrayList<>();List<JSONObject> specs=new ArrayList<>();
        if(runtime.components.sharedEngine()){
            if(order.isEmpty())return;
            if(!engineAvailable()){JSONObject engine=catalog.getJSONObject("engine");File apk=fetchComponent(engine,"native-engine.apk","platform");download.check();progress("platform",0,1,"confirm");ide.app.componentInstaller.install(apk,engine);if(!engineAvailable())throw new IOException("Native engine verification failed");Files.deleteIfExists(apk.toPath());}
            runtime.components.refresh();for(String id:order){download.check();if(!runtime.components.available(id)){JSONObject p=pack(id);if(!runtime.components.dataPresent(id)||runtime.components.errors.containsKey(id)){File data=fetchComponent(p,"tool-"+id+".studio-toolpack",id);download.check();progress(id,p.getLong("bytes"),p.getLong("bytes"),"extract");runtime.components.installData(id,data);Files.deleteIfExists(data.toPath());}runtime.enabled(id,true);}if(!installed(pack(id)))throw new IOException("Runtime dependencies are incomplete: "+id);progress(id,1,1,"installed");}return;
        }
        for(String id:order){download.check();JSONObject p=pack(id);RuntimeComponents.Resolved existing;try{existing=runtime.components.resolve(id);}catch(Exception incompatible){existing=null;}if(existing==null){File apk=new File(ide.tmp,"runtime-"+id+".apk");URL address=new URL("https://github.com/Bony-Lord/devforge/releases/download/"+p.getString("release")+"/"+p.getString("asset"));download.fetch(address,apk,p.getLong("bytes"),p.getString("sha256"),(done,total)->progress(id,done,total,"download"));apks.add(apk);specs.add(p);}}
        download.check();if(!apks.isEmpty()){progress(specs.get(0).getString("id"),0,1,"confirm");ide.app.componentInstaller.installMany(apks,specs);}runtime.components.refresh();for(String id:order){if(runtime.components.resolve(id)==null||runtime.components.errors.containsKey(id))throw new IOException("Runtime component is incomplete: "+id+" "+runtime.components.errors.get(id));runtime.enabled(id,true);if(!installed(pack(id)))throw new IOException("Runtime dependencies are incomplete: "+id);progress(id,1,1,"installed");}for(File apk:apks)Files.deleteIfExists(apk.toPath());
    }
    void installOne(String id,Set<String> visiting)throws Exception{
        download.check();JSONObject p=pack(id);if(p.has("aliasOf")){installOne(p.getString("aliasOf"),visiting);return;}if(!visiting.add(id))throw new IOException("Component dependency cycle");
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
    Object removeEngine()throws Exception{return mutate(()->{InstalledRuntime r=ide.app.installedRuntime;if(r==null||r.components==null||!r.components.sharedEngine())throw new IOException("No shared native engine");JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++)if(ide.addons.enabled("studio.tool."+packs.getJSONObject(i).getString("id")))throw new IOException("Disable native tool addons first");if(r.components.present("platform"))ide.app.componentInstaller.remove(catalog.getJSONObject("engine"));for(int i=0;i<packs.length();i++){String id=packs.getJSONObject(i).getString("id");r.components.clearData(id);r.enabled(id,false);}});}
    Object remove(String id)throws Exception{return mutate(()->{if(ide.addons.enabled("studio.tool."+id))throw new IOException("Disable dependent addons first");if(ide.app.installedRuntime!=null){InstalledRuntime runtime=ide.app.installedRuntime;if(runtime.components==null){runtime.enabled(id,false);return;}JSONArray entries=catalog.getJSONArray("packs");for(int i=0;i<entries.length();i++){JSONObject other=entries.getJSONObject(i);if(!installed(other))continue;JSONArray deps=other.getJSONArray("requires");for(int j=0;j<deps.length();j++)if(deps.getString(j).equals(id))throw new IOException("Component is required by "+other.getString("id"));}if(!runtime.components.sharedEngine()&&runtime.components.present(id))ide.app.componentInstaller.remove(pack(id));runtime.components.clearData(id);runtime.enabled(id,false);return;}removeOne(id);});}
    void removeOne(String id)throws Exception{
        if(ide.addons.enabled("studio.tool."+id))throw new IOException("Disable dependent addons before removing this tool");
        JSONObject p=pack(id);
        JSONArray packs=catalog.getJSONArray("packs");for(int i=0;i<packs.length();i++){JSONObject other=packs.getJSONObject(i);JSONArray requires=other.getJSONArray("requires");for(int j=0;j<requires.length();j++)if(!other.has("aliasOf")&&installed(other)&&requires.getString(j).equals(id))throw new IOException("Component is required by "+other.getString("id"));}
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
