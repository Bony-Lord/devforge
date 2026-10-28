package dev.forge.ide;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** Native images are immutable APK code, installed by PackageManager. */
final class InstalledRuntime {
    final Context app;final File usr,libraries;final JSONObject manifest;
    InstalledRuntime(Context context)throws Exception {
        app=context;usr=new File(app.getFilesDir(),"usr");libraries=new File(app.getApplicationInfo().nativeLibraryDir);
        try(InputStream in=app.getAssets().open("modern-runtime.json")){manifest=new JSONObject(IdeEngine.slurp(in,8*1024*1024));}
    }
    File runner(){return new File(libraries,manifest.optString("runner","libstudio_runner.so"));}
    void install()throws Exception {
        usr.mkdirs();File marker=new File(usr,".studio-installed-runtime-v1");boolean current=marker.isFile()&&IdeEngine.read(marker).equals(manifest.getString("identity"));
        if(!current){
            Map<String,JSONObject> expected=new HashMap<>();JSONArray files=manifest.getJSONArray("files");for(int i=0;i<files.length();i++)expected.put(files.getJSONObject(i).getString("path"),files.getJSONObject(i));
            File archive=new File(app.getCacheDir(),"modern-runtime-data.zip");
            try(InputStream in=app.getAssets().open("runtime-modern-data.zip")){Files.copy(in,archive.toPath(),StandardCopyOption.REPLACE_EXISTING);}
            try{
                if(!ToolPacks.hash(archive).equals(manifest.getString("dataSha256")))throw new IOException("Runtime data checksum mismatch");
                try(ZipInputStream zip=new ZipInputStream(new FileInputStream(archive))){ZipEntry entry;while((entry=zip.getNextEntry())!=null){JSONObject meta=expected.remove(entry.getName());if(meta==null)throw new IOException("Unexpected runtime data entry");File file=ToolPacks.child(usr,entry.getName());file.getParentFile().mkdirs();Path temporary=Files.createTempFile(file.getParentFile().toPath(),".studio-install-",".tmp");try{Files.copy(zip,temporary,StandardCopyOption.REPLACE_EXISTING);if(!ToolPacks.hash(temporary.toFile()).equals(meta.getString("sha256")))throw new IOException("Runtime file checksum mismatch");Files.move(temporary,file.toPath(),StandardCopyOption.REPLACE_EXISTING);file.setReadable(true,true);file.setWritable(true,true);Files.setLastModifiedTime(file.toPath(),java.nio.file.attribute.FileTime.fromMillis(meta.optLong("mtime",0)*1000));}finally{Files.deleteIfExists(temporary);}}}
                if(!expected.isEmpty())throw new IOException("Incomplete runtime data");
            }finally{Files.deleteIfExists(archive.toPath());}
        }
        // Package-manager paths change on every update, so always refresh links.
        JSONArray images=manifest.getJSONArray("native");for(int i=0;i<images.length();i++){JSONObject image=images.getJSONObject(i);File target=new File(libraries,image.getString("library"));if(!target.isFile())throw new IOException("Installed native tool unavailable: "+image.getString("path"));link(image.getString("path"),target.toPath());}
        JSONArray links=manifest.getJSONArray("links");for(int i=0;i<links.length();i++){JSONObject link=links.getJSONObject(i);String target=link.getString("target");if(link.optBoolean("hard"))target=new File(usr,target).getAbsolutePath();link(link.getString("path"),Paths.get(target));}
        if(!runner().isFile()||!runner().canExecute())throw new IOException("Installed program host unavailable");
        Files.write(marker.toPath(),manifest.getString("identity").getBytes(StandardCharsets.UTF_8));
        for(String id:new String[]{"analysis","clang","debugger","git"}){File disabled=new File(usr,".studio-disabled-"+id);if(!disabled.exists())Files.deleteIfExists(new File(usr,".pack-"+id+"-incomplete").toPath());}
    }
    void link(String path,Path target)throws Exception {File destination=ToolPacks.child(usr,path);destination.getParentFile().mkdirs();if(Files.isSymbolicLink(destination.toPath())&&Files.readSymbolicLink(destination.toPath()).equals(target))return;Files.deleteIfExists(destination.toPath());Files.createSymbolicLink(destination.toPath(),target);}
    boolean enabled(String id){return !new File(usr,".studio-disabled-"+id).exists();}
    void enabled(String id,boolean enabled)throws Exception {if(!Arrays.asList("platform","cmake","gcc","analysis","clang","debugger","git","python").contains(id))throw new IOException("Unknown tool");File marker=new File(usr,".studio-disabled-"+id);if(enabled)Files.deleteIfExists(marker.toPath());else Files.write(marker.toPath(),new byte[0]);}
    List<String> command(File program,List<String> args){List<String> command=new ArrayList<>();command.add(runner().getAbsolutePath());command.add(program.getAbsolutePath());command.addAll(args);return command;}
}
