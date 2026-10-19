package dev.forge.ide;

import android.os.Build;
import android.os.Environment;
import org.json.*;
import java.io.*;
import java.util.*;

/** Explicitly selected shared-storage workspaces; executable caches stay private. */
final class WorkspaceFiles {
    final IdeEngine ide;
    WorkspaceFiles(IdeEngine engine){ide=engine;}
    JSONObject bindings()throws IOException {
        try{return new JSONObject(ide.prefs.getString("externalProjects","{}"));}
        catch(JSONException e){throw new IOException("Invalid workspace registry",e);}
    }
    File external(String id)throws IOException {
        JSONObject item=bindings().optJSONObject(id);
        return item==null?null:new File(item.optString("path")).getCanonicalFile();
    }
    boolean isExternal()throws IOException{return external(ide.currentProject)!=null;}
    File data()throws IOException {
        File dir=isExternal()?new File(ide.app.getFilesDir(),"workspaces/"+ide.currentProject.substring(1)):new File(ide.project(ide.currentProject),".forge");
        if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Cannot create workspace cache");return dir;
    }
    boolean canExecute(File file)throws IOException{return ide.inside(file,ide.project(ide.currentProject))||ide.inside(file,data());}
    boolean permission(){return Build.VERSION.SDK_INT>=30?Environment.isExternalStorageManager():ide.app.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)==android.content.pm.PackageManager.PERMISSION_GRANTED;}
    List<File> roots()throws IOException {
        LinkedHashMap<String,File> roots=new LinkedHashMap<>();
        File primary=Environment.getExternalStorageDirectory().getCanonicalFile();roots.put(primary.getPath(),primary);
        for(File appDir:ide.app.getExternalFilesDirs(null))if(appDir!=null){String p=appDir.getCanonicalPath();int at=p.indexOf("/Android/data/");if(at>0){File root=new File(p.substring(0,at));roots.put(root.getPath(),root);}}
        return new ArrayList<>(roots.values());
    }
    File shared(String path)throws IOException {
        File file=new File(path).getCanonicalFile();
        for(File root:roots())if(ide.inside(file,root)){
            String relative=root.toPath().relativize(file.toPath()).toString();
            if(relative.equals("Android/data")||relative.startsWith("Android/data/")||relative.equals("Android/obb")||relative.startsWith("Android/obb/"))throw new IOException("Android restricts other applications' private storage");
            return file;
        }
        throw new IOException("Choose a folder in shared storage or on the SD card");
    }
    JSONObject browse(JSONObject request)throws Exception {
        JSONArray volumes=new JSONArray();for(File root:roots())volumes.put(root.getPath());
        if(!permission())return new JSONObject().put("permission",false).put("roots",volumes);
        File folder=shared(request.optString("path",roots().get(0).getPath()));
        if(!folder.isDirectory())throw new IOException("Folder not found");
        File[] files=folder.listFiles();if(files==null)throw new IOException("Folder is not readable");
        Arrays.sort(files,(a,b)->{int dirs=Boolean.compare(b.isDirectory(),a.isDirectory());return dirs!=0?dirs:a.getName().compareToIgnoreCase(b.getName());});
        JSONArray entries=new JSONArray();int count=0;
        for(File f:files){if(++count>3000)break;entries.put(new JSONObject().put("name",f.getName()).put("path",f.getPath()).put("dir",f.isDirectory()).put("size",f.length()));}
        boolean root=false;for(File volume:roots())if(volume.equals(folder))root=true;
        return new JSONObject().put("permission",true).put("path",folder.getPath()).put("parent",root?JSONObject.NULL:folder.getParent()).put("roots",volumes).put("entries",entries).put("writable",folder.canWrite());
    }
    synchronized JSONObject open(JSONObject request)throws Exception {
        if(!permission())throw new IOException("Allow shared-storage access first");
        File root=shared(request.getString("path"));
        if(!root.isDirectory()||!root.canRead())throw new IOException("Folder is not readable");
        JSONObject all=bindings();String id=null;
        for(Iterator<String> keys=all.keys();keys.hasNext();){String key=keys.next();if(root.getPath().equals(all.getJSONObject(key).optString("path")))id=key;}
        if(id==null){id="@"+UUID.randomUUID().toString();all.put(id,new JSONObject().put("path",root.getPath()).put("label",root.getName()));ide.prefs.edit().putString("externalProjects",all.toString()).apply();}
        return new JSONObject().put("project",id).put("label",root.getName()).put("path",root.getPath());
    }
}
