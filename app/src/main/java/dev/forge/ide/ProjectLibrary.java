package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Project-list removal and recoverable, same-volume folder moves. */
final class ProjectLibrary {
    final IdeEngine ide;
    ProjectLibrary(IdeEngine engine){ide=engine;}
    JSONObject hidden()throws Exception{return new JSONObject(ide.prefs.getString("hiddenProjects","{}"));}
    JSONObject archive()throws Exception{return new JSONObject(ide.prefs.getString("removedProjects","{}"));}
    boolean visible(String id)throws Exception{return !hidden().optBoolean(id,false);}
    JSONObject describe(String id)throws Exception{
        File file=ide.project(id);if(!visible(id)||!file.isDirectory())throw new IOException("Project unavailable");boolean canTrash=true;try{checkTrash(id,file);}catch(IOException error){canTrash=false;}
        return new JSONObject().put("id",id).put("label",file.getName()).put("path",file.getCanonicalPath()).put("canTrash",canTrash);
    }
    void checkTrash(String id,File root)throws Exception{
        for(File protectedFile:Arrays.asList(ide.app.getFilesDir(),ide.projects))if(ide.inside(protectedFile,root))throw new IOException("Protected folder cannot be moved to project trash");
        if(ide.workspace.external(id)!=null){ide.workspace.shared(root.getPath());for(File volume:ide.workspace.roots())if(volume.equals(root))throw new IOException("Storage root cannot be moved");}
        JSONObject links=ide.workspace.bindings();for(Iterator<String> keys=links.keys();keys.hasNext();){String other=keys.next();if(!other.equals(id)&&ide.inside(ide.project(other),root))throw new IOException("Folder contains another project");}
        if(!root.isDirectory()||Files.isSymbolicLink(root.toPath()))throw new IOException("Select a regular project folder");
    }
    void requireIdle()throws IOException{if(ide.building!=null&&ide.building.isAlive()||ide.execution!=null&&ide.execution.isAlive()||ide.tools.debuggerRunning()||ide.python.busy)throw new IOException("Stop the running program or notebook cell first");}
    synchronized JSONObject remove(JSONObject request)throws Exception{
        requireIdle();String id=request.getString("id"),mode=request.getString("mode");JSONObject description=describe(id);File root=ide.project(id);if(!description.getString("path").equals(request.getString("path"))||!Arrays.asList("forget","trash").contains(mode))throw new IOException("Project changed; reopen its menu");
        JSONObject hidden=hidden(),archive=archive(),links=ide.workspace.bindings();String token=UUID.randomUUID().toString();JSONObject record=new JSONObject().put("id",token).put("projectId",id).put("label",root.getName()).put("path",root.getCanonicalPath()).put("mode",mode).put("time",System.currentTimeMillis());
        JSONObject binding=links.optJSONObject(id);if(binding!=null)record.put("binding",binding);
        if(mode.equals("trash")){checkTrash(id,root);File base=new File(root.getParentFile(),".devforge-project-trash");if(!base.isDirectory()&&!base.mkdirs())throw new IOException("Cannot create project trash");if(!base.getCanonicalFile().equals(base.getAbsoluteFile()))throw new IOException("Project trash cannot be a symbolic link");File folder=new File(base,token);if(!folder.mkdir())throw new IOException("Cannot create project trash entry");File stored=new File(folder,root.getName()).getCanonicalFile();if(!ide.inside(stored,base))throw new IOException("Invalid project trash path");Files.move(root.toPath(),stored.toPath());record.put("stored",stored.getPath());}
        hidden.put(id,true);links.remove(id);archive.put(token,record);var edit=ide.prefs.edit().putString("hiddenProjects",hidden.toString()).putString("externalProjects",links.toString()).putString("removedProjects",archive.toString()).remove("trustedWorkspace:"+root.getCanonicalPath());
        if(id.equals(ide.currentProject)){ide.python.stop();ide.pythonStyle.stop();ide.pythonIntelligence.stop();ide.stopLsp();ide.currentProject="";edit.putString("project","").putString("session","{}").putBoolean("projectSelectionCleared",true);}
        if(!edit.commit()){if(record.has("stored")&&!root.exists())Files.move(new File(record.getString("stored")).toPath(),root.toPath());ide.currentProject=ide.prefs.getString("project","");throw new IOException("Cannot save project list");}return new JSONObject().put("removed",token).put("state",ide.state());
    }
    synchronized JSONArray list()throws Exception{JSONArray result=new JSONArray();JSONObject all=archive();for(Iterator<String> keys=all.keys();keys.hasNext();)result.put(all.getJSONObject(keys.next()));return result;}
    synchronized JSONObject delete(JSONObject request)throws Exception{
        JSONObject project=describe(request.getString("id"));if(!project.getString("label").equals(request.optString("confirmName")))throw new IOException("Type the project name to confirm permanent deletion");
        request.put("mode","trash");JSONObject result=remove(request),all=archive(),record=all.getJSONObject(result.getString("removed"));File stored=new File(record.getString("stored")).getCanonicalFile(),base=new File(new File(record.getString("path")).getParentFile(),".devforge-project-trash").getCanonicalFile();if(stored.equals(base)||!ide.inside(stored,base))throw new IOException("Invalid project trash path");
        try(java.util.stream.Stream<Path> paths=Files.walk(stored.toPath())){for(Path p:(Iterable<Path>)paths.sorted(Comparator.reverseOrder())::iterator)Files.delete(p);}catch(IOException error){return result.put("deleteError",error.getMessage());}
        all.remove(record.getString("id"));if(!ide.prefs.edit().putString("removedProjects",all.toString()).commit())throw new IOException("Cannot save project list");return new JSONObject().put("deleted",true).put("state",ide.state());
    }
    synchronized JSONObject restore(String token)throws Exception{
        requireIdle();JSONObject all=archive(),record=all.getJSONObject(token),hidden=hidden(),links=ide.workspace.bindings();String id=record.getString("projectId");File root=new File(record.getString("path")).getCanonicalFile();
        if(record.getString("mode").equals("trash")){File base=new File(root.getParentFile(),".devforge-project-trash").getCanonicalFile(),stored=new File(record.getString("stored")).getCanonicalFile();if(!ide.inside(stored,base)||stored.equals(base)||root.exists())throw new IOException("Original project folder is occupied or trash path changed");Files.move(stored.toPath(),root.toPath());}else if(!root.isDirectory())throw new IOException("Project folder unavailable");
        if(record.has("binding"))links.put(id,record.getJSONObject("binding"));hidden.remove(id);all.remove(token);if(!ide.prefs.edit().putString("hiddenProjects",hidden.toString()).putString("externalProjects",links.toString()).putString("removedProjects",all.toString()).commit())throw new IOException("Cannot save project list");return ide.state();
    }
}
