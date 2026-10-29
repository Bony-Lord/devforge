package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Reviewed, bounded file batches. No command execution; optimistic concurrency on raw bytes. */
final class ProjectTemplateFiles {
    static void validateTemplate(JSONObject template)throws Exception {
        AddonPackages.keys(template,"format","version","id","kind","name","description","category","parameters","requires","appliesTo","files","project","profile","entryFile");
        if(!template.optString("format").equals("devforge.template")||template.optInt("version")!=1||!template.optString("id").matches("[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+")||!Arrays.asList("project","attachment").contains(template.optString("kind"))||template.toString().getBytes(StandardCharsets.UTF_8).length>262144)throw new IOException("Invalid project template");
        AddonPackages.label(template.get("name"));JSONArray files=template.getJSONArray("files");if(files.length()>128||template.optJSONArray("parameters")!=null&&template.getJSONArray("parameters").length()>24)throw new IOException("Template limit exceeded");
        for(int i=0;i<files.length();i++){JSONObject file=files.getJSONObject(i);AddonPackages.keys(file,"path","text");String name=file.getString("path"),text=file.getString("text");if(name.length()>240||name.startsWith("/")||name.matches(".*[\\\\:\\x00-\\x1f].*")||text.indexOf(0)>=0)throw new IOException("Unsafe template file");for(String part:name.split("/",-1))if(part.isEmpty()||Arrays.asList(".","..",".git",".forge",".devforge").contains(part.toLowerCase(Locale.ROOT)))throw new IOException("Unsafe template path");}
        if(template.optString("kind").equals("project")&&template.optJSONObject("project")==null)throw new IOException("Missing project configuration");
    }
    static String hash(byte[] bytes)throws Exception {
        StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();
    }
    static File child(File root,String name)throws IOException {
        if(name.isEmpty()||name.length()>240||name.startsWith("/")||name.matches(".*[\\\\:\\x00-\\x1f].*")||name.toLowerCase(Locale.ROOT).startsWith(".devforge/")&&!name.equals(".devforge/project.json"))throw new IOException("Unsafe template path");
        for(String part:name.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals("..")||part.equalsIgnoreCase(".git")||part.equalsIgnoreCase(".forge"))throw new IOException("Unsafe template path");
        File file=new File(root,name).getCanonicalFile();String prefix=root.getCanonicalPath()+File.separator;if(!file.getPath().startsWith(prefix))throw new IOException("Path outside project");return file;
    }
    static byte[] bytes(File file)throws IOException {if(!file.exists())return null;if(!file.isFile()||file.length()>1048576)throw new IOException("Template file exceeds 1 MiB or is not a regular file");return Files.readAllBytes(file.toPath());}
    static void checkRoot(File root,JSONObject d)throws Exception {if(!root.getCanonicalPath().equals(new File(d.getString("root")).getCanonicalPath()))throw new IOException("Project changed; preview the template again");}
    static JSONObject snapshot(File root,JSONObject d)throws Exception {
        checkRoot(root,d);JSONArray paths=d.getJSONArray("paths");if(paths.length()>129)throw new IOException("Invalid template snapshot");JSONObject files=new JSONObject();
        for(int i=0;i<paths.length();i++){String name=paths.getString(i);byte[] content=bytes(child(root,name));files.put(name,content==null?JSONObject.NULL:new JSONObject().put("text",FileCodec.decode(content,"auto").text).put("sha256",hash(content)));}return new JSONObject().put("root",root.getCanonicalPath()).put("files",files);
    }
    static final class Change {String name;File file;byte[] before,after;}
    static void replace(File file,byte[] bytes)throws IOException {
        Path staged=Files.createTempFile(file.getParentFile().toPath(),".forge-write-",".tmp");try{Files.write(staged,bytes);try{Files.move(staged,file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException error){Files.move(staged,file.toPath(),StandardCopyOption.REPLACE_EXISTING);}}finally{Files.deleteIfExists(staged);}
    }
    static JSONObject apply(File root,File history,JSONObject d)throws Exception {
        checkRoot(root,d);JSONArray changes=d.getJSONArray("changes");if(changes.length()==0||changes.length()>129||d.toString().getBytes(StandardCharsets.UTF_8).length>2097152)throw new IOException("Invalid template batch");
        List<Change> batch=new ArrayList<>(),written=new ArrayList<>();List<File> directories=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(int i=0;i<changes.length();i++){
            JSONObject c=changes.getJSONObject(i);Change entry=new Change();entry.name=c.getString("path");entry.file=child(root,entry.name);if(!seen.add(entry.file.getPath().toLowerCase(Locale.ROOT))||!(c.get("text")instanceof String))throw new IOException("Invalid template change");String text=c.getString("text");entry.after=text.getBytes(StandardCharsets.UTF_8);if(text.indexOf(0)>=0||entry.after.length>1048576||!c.has("expected")||!c.isNull("expected")&&!c.getString("expected").matches("[a-f0-9]{64}"))throw new IOException("Invalid template change");entry.before=bytes(entry.file);String expected=c.isNull("expected")?null:c.getString("expected");if(!Objects.equals(entry.before==null?null:hash(entry.before),expected))throw new IOException("File changed since preview: "+entry.name);batch.add(entry);
        }
        // Keep exact original bytes outside the generated file set for recovery.
        File backup=new File(history,"templates/"+UUID.randomUUID());
        for(Change entry:batch)if(entry.before!=null&&!Arrays.equals(entry.before,entry.after)){File copy=new File(backup,entry.name);if(!copy.getParentFile().isDirectory()&&!copy.getParentFile().mkdirs())throw new IOException("Cannot save template backup");Files.write(copy.toPath(),entry.before,StandardOpenOption.CREATE_NEW);}
        try{
            for(Change entry:batch){byte[] actual=bytes(entry.file);if(!Arrays.equals(actual,entry.before))throw new IOException("File changed since preview: "+entry.name);List<File> missing=new ArrayList<>();File dir=entry.file.getParentFile();while(!dir.exists()){missing.add(dir);dir=dir.getParentFile();}Collections.reverse(missing);for(File folder:missing){if(!folder.mkdir())throw new IOException("Cannot create template directory");directories.add(folder);}if(!child(root,entry.name).equals(entry.file))throw new IOException("Project path changed");if(entry.before==null)Files.write(entry.file.toPath(),entry.after,StandardOpenOption.CREATE_NEW);else replace(entry.file,entry.after);written.add(entry);}
        }catch(Exception error){Collections.reverse(written);for(Change entry:written)try{if(Arrays.equals(bytes(entry.file),entry.after)){if(entry.before==null)Files.delete(entry.file.toPath());else replace(entry.file,entry.before);}}catch(Exception recovery){error.addSuppressed(recovery);}Collections.reverse(directories);for(File dir:directories)dir.delete();throw error;}
        JSONArray paths=new JSONArray();for(Change entry:batch)paths.put(entry.file.getPath());return new JSONObject().put("paths",paths);
    }
}
