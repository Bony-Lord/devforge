package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Project-local profiles and CMake's public codemodel API. */
final class BuildProfiles {
    static JSONObject defaults(boolean c)throws JSONException {
        JSONArray profiles=new JSONArray(),configs=new JSONArray();
        for(String id:new String[]{"debug","release"})profiles.put(new JSONObject().put("id",id).put("name",id.equals("debug")?"Debug":"Release").put("compiler","gcc").put("optimization",id).put("cppStandard","c++20").put("cStandard","c17").put("flags",new JSONArray()).put("cmakeOptions",new JSONArray()).put("environment",new JSONObject()).put("runtimeChecks",id.equals("debug")?"undefined":"off").put("buildDirectory",".forge/cmake-"+id));
        for(String type:new String[]{"cmake","file","project"})configs.put(new JSONObject().put("id",type.equals("cmake")?"cmake-debug":type).put("name",type.equals("cmake")?"app":type.equals("file")?"Current file":"Project").put("type",type).put("profile","debug").put("target","app").put("source",type.equals("file")?"":c?"main.c":"main.cpp").put("args",new JSONArray()).put("environment",new JSONObject()).put("workingDirectory",".").put("executable","").put("buildBeforeRun",true));
        return new JSONObject().put("version",1).put("active","cmake-debug").put("profiles",profiles).put("configurations",configs);
    }
    static void create(File root,boolean c)throws Exception {File file=new File(root,".cpp-studio/configurations.json");file.getParentFile().mkdirs();Files.write(file.toPath(),defaults(c).toString(2).getBytes(StandardCharsets.UTF_8),StandardOpenOption.CREATE_NEW);}
    static File cmakeDirectory(IdeEngine ide,JSONObject options)throws Exception {
        String configured=options.optString("buildDirectory");if(configured.isEmpty())return new File(ide.workspace.data(),"cmake-"+options.optString("compiler","gcc")+"-"+ide.standard(options,false).replace('+','p'));
        File root=ide.project(ide.currentProject),file=new File(root,configured).getCanonicalFile();
        if(new File(configured).isAbsolute()||file.equals(root)||!ide.inside(file,root))throw new IOException("Build directory must be inside the project");
        // External storage cannot execute generated programs. Keep its cache private.
        return ide.workspace.isExternal()?new File(ide.workspace.data(),"profile-"+options.optString("cmakeProfile","default").replaceAll("[^A-Za-z0-9_.-]","_")):file;
    }
    static File workingDirectory(IdeEngine ide,JSONObject options)throws Exception {
        File root=ide.project(ide.currentProject);String name=options.optString("workingDirectory",".");File dir=(new File(name).isAbsolute()?new File(name):new File(root,name)).getCanonicalFile();if(!ide.inside(dir,root)||!dir.isDirectory())throw new IOException("Working directory is unavailable or outside the project");return dir;
    }
    static Map<String,String> environment(JSONObject options)throws JSONException,IOException {
        Map<String,String> result=new HashMap<>();JSONObject env=options.optJSONObject("environment");if(env==null)return result;Iterator<String> keys=env.keys();while(keys.hasNext()){String key=keys.next(),value=env.getString(key);if(!key.matches("[A-Za-z_][A-Za-z_0-9]*")||value.indexOf(0)>=0)throw new IOException("Invalid environment variable");result.put(key,value);}return result;
    }
    static void query(File directory)throws IOException {File file=new File(directory,".cmake/api/v1/query/client-cpp-studio/codemodel-v2");file.getParentFile().mkdirs();if(!file.exists())Files.createFile(file.toPath());}
    static JSONObject json(File directory,String name)throws Exception {File file=new File(directory,name).getCanonicalFile();if(!file.toPath().startsWith(directory.getCanonicalFile().toPath())||file.length()>16*1024*1024)throw new IOException("Invalid CMake reply");return new JSONObject(IdeEngine.read(file));}
    static JSONArray targets(File directory)throws Exception {
        File reply=new File(directory,".cmake/api/v1/reply");File[] indices=reply.listFiles(f->f.getName().startsWith("index-")&&f.getName().endsWith(".json"));JSONArray result=new JSONArray();if(indices==null||indices.length==0)return result;Arrays.sort(indices,Comparator.comparing(File::getName).reversed());JSONObject index=json(reply,indices[0].getName()),responses=index.optJSONObject("reply");if(responses==null)return result;JSONObject client=responses.optJSONObject("client-cpp-studio");if(client==null)return result;JSONObject reference=client.optJSONObject("codemodel-v2");if(reference==null)return result;JSONObject model=json(reply,reference.getString("jsonFile"));JSONArray configurations=model.getJSONArray("configurations");
        for(int i=0;i<configurations.length();i++){JSONArray refs=configurations.getJSONObject(i).optJSONArray("targets");if(refs==null)continue;for(int j=0;j<refs.length();j++){JSONObject target=json(reply,refs.getJSONObject(j).getString("jsonFile"));if(!target.optString("type").equals("EXECUTABLE"))continue;JSONArray artifacts=target.optJSONArray("artifacts");String artifact=artifacts!=null&&artifacts.length()>0?artifacts.getJSONObject(0).getString("path"):"";result.put(new JSONObject().put("name",target.getString("name")).put("artifact",artifact));}}
        return result;
    }
    static File executable(IdeEngine ide,File directory,JSONObject options)throws Exception {String override=options.optString("executable"),targetName=options.optString("target","app");if(!override.isEmpty()){File file=new File(override);if(!file.isAbsolute())file=new File(directory,override);if(!ide.workspace.canExecute(file))throw new IOException("Executable outside project");return file.getCanonicalFile();}JSONArray targets=targets(directory);for(int i=0;i<targets.length();i++){JSONObject target=targets.getJSONObject(i);if(targetName.isEmpty()||targetName.equals(target.getString("name"))){File file=new File(directory,target.getString("artifact")).getCanonicalFile();if(!ide.inside(file,directory))throw new IOException("CMake artifact outside build directory");return file;}}return new File(directory,targetName.isEmpty()?"app":targetName);}
}
