package dev.forge.ide;

import android.content.*;
import android.content.pm.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** Signed, independently installed native components. Never execute downloaded code in usr. */
final class RuntimeComponents {
    final InstalledRuntime runtime;final Context app;final Map<String,Resolved> cache=new HashMap<>();final Map<String,String> errors=new HashMap<>();
    static final class Resolved {ApplicationInfo info;JSONObject descriptor;String key;boolean ready;}
    RuntimeComponents(InstalledRuntime runtime){this.runtime=runtime;app=runtime.app;}
    boolean sharedEngine(){return runtime.manifest.optString("delivery").equals("engine-and-packs");}
    boolean dataPresent(String id){return new File(runtime.usr,".component-"+id).isFile();}
    JSONObject spec(String id)throws Exception {JSONArray entries=runtime.manifest.getJSONArray("components");for(int i=0;i<entries.length();i++)if(entries.getJSONObject(i).getString("id").equals(id))return entries.getJSONObject(i);throw new IOException("Unknown runtime component");}
    static Set<String> signers(PackageInfo info)throws Exception {Set<String> result=new TreeSet<>();if(info.signingInfo==null)throw new IOException("Missing component signer");for(Signature signer:info.signingInfo.getApkContentsSigners()){byte[] digest=MessageDigest.getInstance("SHA-256").digest(signer.toByteArray());StringBuilder value=new StringBuilder();for(byte b:digest)value.append(String.format("%02x",b&255));result.add(value.toString());}if(result.isEmpty())throw new IOException("Missing component signer");return result;}
    PackageInfo packageInfo(String name)throws PackageManager.NameNotFoundException {return app.getPackageManager().getPackageInfo(name,PackageManager.GET_SIGNING_CERTIFICATES);}
    synchronized boolean present(String id){try{packageInfo(spec(id).getString("package"));return true;}catch(Exception missing){return false;}}
    synchronized Resolved resolve(String id)throws Exception {
        JSONObject spec=spec(id);PackageInfo info;
        try{info=packageInfo(spec.getString("package"));}catch(PackageManager.NameNotFoundException missing){cache.remove(id);return null;}
        String key=info.applicationInfo.sourceDir+":"+info.getLongVersionCode();Resolved saved=cache.get(id);if(saved!=null&&saved.key.equals(key))return saved;
        if(info.getLongVersionCode()!=spec.getLong("versionCode")||!signers(info).equals(signers(packageInfo(app.getPackageName()))))throw new IOException("Runtime component has an incompatible version or signature: "+id);
        byte[] bytes;try(ZipFile apk=new ZipFile(info.applicationInfo.sourceDir)){ZipEntry entry=apk.getEntry(sharedEngine()?"assets/components/"+id+".json":"assets/devforge-component.json");if(entry==null||entry.getSize()>8*1024*1024)throw new IOException("Invalid runtime descriptor");try(InputStream in=apk.getInputStream(entry)){bytes=IdeEngine.slurp(in,8*1024*1024).getBytes(StandardCharsets.UTF_8);}}
        if(!digest(bytes).equals(spec.getString("manifestSha256")))throw new IOException("Runtime descriptor checksum mismatch: "+id);
        Resolved value=new Resolved();value.info=info.applicationInfo;value.key=key;value.descriptor=new JSONObject(new String(bytes,StandardCharsets.UTF_8));if(!value.descriptor.getString("id").equals(id)||!value.descriptor.getString("arch").equals(runtime.manifest.getString("arch")))throw new IOException("Runtime ABI/identity mismatch");cache.put(id,value);return value;
    }
    static String digest(byte[] bytes)throws Exception {StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))out.append(String.format("%02x",b&255));return out.toString();}
    synchronized void refresh()throws Exception {JSONArray entries=runtime.manifest.getJSONArray("components");for(int i=0;i<entries.length();i++){String id=entries.getJSONObject(i).getString("id");try{Resolved value=resolve(id);if(value!=null&&!value.ready&&(!sharedEngine()||dataPresent(id)))materialize(id,value,null);errors.remove(id);}catch(Exception error){cache.remove(id);errors.put(id,error.getMessage());}}}
    synchronized void installData(String id,File archive)throws Exception {Resolved value=resolve(id);if(value==null)throw new IOException("Install DevForge Native Engine first");materialize(id,value,archive);errors.remove(id);}
    void materialize(String id,Resolved value,File archive)throws Exception {
        JSONObject spec=spec(id);File marker=new File(runtime.usr,".component-"+id);String identity=spec.getString("manifestSha256")+":"+value.info.nativeLibraryDir;
        if(archive!=null||!marker.isFile()||!IdeEngine.read(marker).equals(identity)){
            Files.deleteIfExists(marker.toPath());value.ready=false;
            try(ZipFile apk=sharedEngine()?(archive==null?null:new ZipFile(archive)):new ZipFile(value.info.sourceDir)){
                JSONArray files=value.descriptor.getJSONArray("files");for(int i=0;i<files.length();i++){JSONObject f=files.getJSONObject(i);File destination=ToolPacks.child(runtime.usr,f.getString("path"));
                    if(Files.isRegularFile(destination.toPath(),LinkOption.NOFOLLOW_LINKS)&&destination.length()==f.getLong("bytes")&&PackDownload.hash(destination).equals(f.getString("sha256"))){Files.setLastModifiedTime(destination.toPath(),java.nio.file.attribute.FileTime.fromMillis(f.optLong("mtime",0)*1000));continue;}
                    ZipEntry entry=apk==null?null:apk.getEntry((sharedEngine()?"runtime/":"assets/runtime/")+f.getString("path"));if(entry==null||entry.getSize()!=f.getLong("bytes"))throw new IOException("Incomplete component data: "+id);
                    destination.getParentFile().mkdirs();Path temporary=Files.createTempFile(destination.getParentFile().toPath(),".component-",".tmp");try{try(InputStream in=apk.getInputStream(entry)){Files.copy(in,temporary,StandardCopyOption.REPLACE_EXISTING);}if(!PackDownload.hash(temporary.toFile()).equals(f.getString("sha256")))throw new IOException("Component data checksum mismatch");Files.move(temporary,destination.toPath(),StandardCopyOption.REPLACE_EXISTING);Files.setLastModifiedTime(destination.toPath(),java.nio.file.attribute.FileTime.fromMillis(f.optLong("mtime",0)*1000));}finally{Files.deleteIfExists(temporary);}}
            }
            JSONArray images=value.descriptor.getJSONArray("native");for(int i=0;i<images.length();i++){JSONObject image=images.getJSONObject(i);String name=image.getString("library");if(!name.matches("libstudio_[a-f0-9]+\\.so"))throw new IOException("Invalid native image name");File imageFile=new File(value.info.nativeLibraryDir,name);if(!imageFile.isFile())throw new IOException("Native component image unavailable: "+id);runtime.link(image.getString("path"),imageFile.toPath());}
            JSONArray links=value.descriptor.getJSONArray("links");for(int i=0;i<links.length();i++){JSONObject link=links.getJSONObject(i);String target=link.getString("target");if(target.startsWith("/data/data/com.forgex/files/usr/"))target=new File(runtime.usr,target.substring("/data/data/com.forgex/files/usr/".length())).getAbsolutePath();else if(target.startsWith("/")&&!target.equals("/system/bin/sh"))throw new IOException("Unsafe runtime link");if(link.optBoolean("hard"))target=new File(runtime.usr,target).getAbsolutePath();runtime.link(link.getString("path"),Paths.get(target));}
            File saved=new File(app.getFilesDir(),"runtime-components/"+id+".json");saved.getParentFile().mkdirs();Path staged=Files.createTempFile(saved.getParentFile().toPath(),".manifest-",".tmp");try{Files.write(staged,value.descriptor.toString().getBytes(StandardCharsets.UTF_8));Files.move(staged,saved.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}finally{Files.deleteIfExists(staged);}Files.write(marker.toPath(),identity.getBytes(StandardCharsets.UTF_8));
        }value.ready=true;
    }
    synchronized boolean available(String id){try{Resolved r=resolve(id);return r!=null&&r.ready&&runtime.locallyEnabled(id);}catch(Exception invalid){return false;}}
    synchronized void clearData(String id)throws Exception {
        Resolved resolved;try{resolved=resolve(id);}catch(Exception incompatible){resolved=null;}JSONObject descriptor=resolved==null?null:resolved.descriptor;File saved=new File(app.getFilesDir(),"runtime-components/"+id+".json");if(descriptor==null&&saved.isFile())descriptor=new JSONObject(IdeEngine.read(saved));
        if(descriptor!=null)for(String key:new String[]{"files","native","links"}){JSONArray list=descriptor.getJSONArray(key);for(int i=0;i<list.length();i++)Files.deleteIfExists(ToolPacks.child(runtime.usr,list.getJSONObject(i).getString("path")).toPath());}
        Files.deleteIfExists(new File(runtime.usr,".component-"+id).toPath());Files.deleteIfExists(saved.toPath());cache.remove(id);
    }
}
