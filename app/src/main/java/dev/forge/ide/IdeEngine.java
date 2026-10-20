package dev.forge.ide;

import android.os.Build;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;

final class IdeEngine {
    final MainActivity app;
    final ToolsEngine tools;
    final ToolPacks toolPacks;
    final WorkspaceFiles workspace;
    final LanguageTools languages;
    final File projects,usr,tmp;
    final String version;
    final ExecutorService pool=Executors.newCachedThreadPool();
    final android.content.SharedPreferences prefs;
    final String triple=Build.SUPPORTED_ABIS[0].equals("x86_64")?"x86_64-linux-android":Build.SUPPORTED_ABIS[0].startsWith("armeabi")?"arm-linux-androideabi":"aarch64-linux-android";
    volatile String currentProject;
    volatile Process lsp,execution,building;
    volatile long lspGeneration;
    final Object lspWrite=new Object();
    final Object buildLock=new Object();
    volatile boolean buildCancelled;
    volatile String runId="";
    volatile boolean closed;

    IdeEngine(MainActivity a)throws Exception {
        app=a;version=a.getPackageManager().getPackageInfo(a.getPackageName(),0).versionName;projects=new File(a.getFilesDir(),"projects");usr=new File(a.getFilesDir(),"usr");tmp=new File(a.getFilesDir(),"tmp");
        projects.mkdirs();tmp.mkdirs();
        prefs=a.getSharedPreferences("forge",0);workspace=new WorkspaceFiles(this);languages=new LanguageTools(this);
        if(!new File(projects,"hello-cpp").exists()) createProject("hello-cpp","cpp");
        currentProject=prefs.getString("project","hello-cpp");
        if(!project(currentProject).isDirectory())currentProject="hello-cpp";
        tools=new ToolsEngine(this);toolPacks=new ToolPacks(this);
    }
    Object handle(String op,JSONObject data)throws Exception {
        JSONObject d=data==null?new JSONObject():data;
        if(op.startsWith("gdb")||op.equals("git"))return tools.handle(op,d);
        if(op.startsWith("formatter")||op.equals("formatDocument")||op.equals("cmakeSources")||op.equals("cmakeCommands")||op.equals("cmakeHelp"))return languages.handle(op,d);
        switch(op) {
            case "state":return state();
            case "settings":prefs.edit().putString("settings",d.toString()).apply();app.configureKeyboard(d);return d;
            case "session":prefs.edit().putString("session",d.toString()).apply();return true;
            case "project": {
                String name=d.getString("name");
                File p=project(name);if(!p.isDirectory())throw new IOException("Проект не найден");
                stopLsp();currentProject=name;prefs.edit().putString("project",name).apply();return state();
            }
            case "newProject":createProject(d.getString("name"),d.optString("language","cpp"));return state();
            case "tree":return tree(project(currentProject),0);
            case "browseFilesystem":return workspace.browse(d);
            case "openFolder":return workspace.open(d);
            case "storagePermission":app.requestStorageAccess();return true;
            case "newFolder": {File folder=writablePath(d.getString("path"));if(folder.exists()||!folder.mkdirs())throw new IOException("Cannot create folder");return true;}
            case "read": {
                File f=readable(d.getString("path"));
                if(f.length()>4*1024*1024)throw new IOException("Редактор открывает файлы до 4 МБ");
                String requested=d.optString("encoding",prefs.getString("fileEncoding:"+f.getAbsolutePath(),"auto"));FileCodec.Decoded decoded=FileCodec.decode(Files.readAllBytes(f.toPath()),requested);prefs.edit().putString("fileEncoding:"+f.getAbsolutePath(),decoded.encoding).apply();
                return new JSONObject().put("text",decoded.text).put("encoding",decoded.encoding).put("path",f.getAbsolutePath()).put("readonly",!inside(f,project(currentProject)));
            }
            case "convertEncoding":{if(app.nativeEditors!=null&&!app.nativeEditors.currentRevision(d.getString("path"),d.getLong("revision")))return false;return save(d.getString("path"),d.getString("text"),d.getString("encoding"));}
            case "write":return d.has("revision")?saveVersioned(d.getString("path"),d.getString("text"),d.getLong("revision")):save(d.getString("path"),d.getString("text"));
            case "templatePreview":case "createTemplate": {
                LinkedHashMap<String,String> templates=FileTemplates.create(d.getString("kind"),d.getString("name"),d.optString("namespace").trim());JSONArray result=new JSONArray();List<File> created=new ArrayList<>();
                for(String path:templates.keySet()){File file=writablePath(new File(project(currentProject),path).getAbsolutePath());if(file.exists())throw new IOException("File already exists: "+path);}
                try{for(var entry:templates.entrySet()){File file=writablePath(new File(project(currentProject),entry.getKey()).getAbsolutePath());if(op.equals("createTemplate")){file.getParentFile().mkdirs();Files.write(file.toPath(),FileCodec.encode(entry.getValue(),settings().optString("defaultEncoding","UTF-8")),StandardOpenOption.CREATE_NEW);created.add(file);}result.put(new JSONObject().put("path",op.equals("createTemplate")?file.getAbsolutePath():entry.getKey()).put("text",entry.getValue()));}}catch(Exception error){for(File file:created)Files.deleteIfExists(file.toPath());throw error;}for(File file:created)prefs.edit().putString("fileEncoding:"+file.getAbsolutePath(),settings().optString("defaultEncoding","UTF-8")).apply();return result;
            }
            case "newFile": {
                File f=writable(d.getString("path"));
                if(f.exists())throw new IOException("Файл уже существует");
                String encoding=settings().optString("defaultEncoding","UTF-8");byte[] bytes=FileCodec.encode(d.optString("text",""),encoding);f.getParentFile().mkdirs();Files.write(f.toPath(),bytes,StandardOpenOption.CREATE_NEW);prefs.edit().putString("fileEncoding:"+f.getAbsolutePath(),encoding).apply();return f.getAbsolutePath();
            }
            case "moveProjectItem":{
                File from=writablePath(d.getString("path")),to=writablePath(d.getString("to")),dataDir=workspace.data();
                if(!from.exists()||!to.getParentFile().isDirectory())throw new IOException("Source or destination folder is unavailable");
                if(inside(to,from)||inside(from,dataDir)||from.equals(dataDir))throw new IOException("Cannot move a folder inside itself or move IDE metadata");
                if(to.exists())throw new IOException("Этот путь уже существует");
                Files.move(from.toPath(),to.toPath());
                var edit=prefs.edit();String prefix="fileEncoding:"+from.getAbsolutePath();for(var entry:prefs.getAll().entrySet())if(entry.getKey().equals(prefix)||entry.getKey().startsWith(prefix+"/")){edit.remove(entry.getKey());edit.putString("fileEncoding:"+to.getAbsolutePath()+entry.getKey().substring(prefix.length()),String.valueOf(entry.getValue()));}edit.apply();
                File histories=new File(dataDir,"history");File[] records=histories.listFiles();if(records!=null)for(File record:records)try{String oldPath=new String(android.util.Base64.decode(record.getName(),android.util.Base64.URL_SAFE),StandardCharsets.UTF_8);if(oldPath.equals(from.getAbsolutePath())||oldPath.startsWith(from.getAbsolutePath()+"/")){File target=historyDir(new File(to.getAbsolutePath()+oldPath.substring(from.getAbsolutePath().length())));target.mkdirs();File[] versions=record.listFiles();if(versions!=null)for(File version:versions){File moved=new File(target,version.getName());if(moved.exists())moved=new File(target,version.getName()+"-moved-"+UUID.randomUUID());Files.move(version.toPath(),moved.toPath());}Files.deleteIfExists(record.toPath());}}catch(Exception metadataError){android.util.Log.w("Studio","Retained previous history location",metadataError);}
                return to.getAbsolutePath();
            }
            case "reportBug":{android.net.Uri uri=android.net.Uri.parse("https://github.com/Bony-Lord/gcc-cpp-studio/issues/new").buildUpon().appendQueryParameter("template","bug_report.yml").appendQueryParameter("version",version).appendQueryParameter("device",Build.MANUFACTURER+" "+Build.MODEL).appendQueryParameter("android",Build.VERSION.RELEASE+" / API "+Build.VERSION.SDK_INT).build();app.ui.post(()->{try{app.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,uri));}catch(android.content.ActivityNotFoundException e){app.event("toast",JSONObject.quote(uri.toString()));}});return uri.toString();}
            case "renameFile": {
                File from=writablePath(d.getString("path")),to=writablePath(d.getString("to"));
                if(!inside(to,project(currentProject)))throw new IOException("Выберите путь внутри проекта");
                if(to.exists())throw new IOException("Этот путь уже существует");
                to.getParentFile().mkdirs();Files.move(from.toPath(),to.toPath());String encoding=prefs.getString("fileEncoding:"+from.getAbsolutePath(),null);if(encoding!=null)prefs.edit().remove("fileEncoding:"+from.getAbsolutePath()).putString("fileEncoding:"+to.getAbsolutePath(),encoding).apply();return true;
            }
            case "deleteFile": {
                File f=writable(d.getString("path"));
                if(f.isDirectory())throw new IOException("Удаление папок отключено; экспортируйте проект перед очисткой");
                File trash=new File(project(currentProject),".forge/trash/"+System.currentTimeMillis()+"-"+f.getName());
                trash.getParentFile().mkdirs();Files.move(f.toPath(),trash.toPath());return true;
            }
            case "history":return history(d.getString("path"));
            case "toolPacks":return toolPacks.state();
            case "toolPackInstall":return toolPacks.install(d.getString("id"));
            case "toolPackRemove":return toolPacks.remove(d.getString("id"));
            case "showInFiles":{File root=project(currentProject),selected=new File(d.optString("path",root.getAbsolutePath())).getCanonicalFile();if(!inside(selected,root)||!selected.exists())throw new IOException("Project path unavailable");File directory=selected.isDirectory()?selected:selected.getParentFile();android.net.Uri uri=ProjectDocumentsProvider.directoryUri(currentProject,root,directory);app.ui.post(()->{try{android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(uri,android.provider.DocumentsContract.Document.MIME_TYPE_DIR).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);app.startActivity(intent);}catch(android.content.ActivityNotFoundException e){app.event("toast",JSONObject.quote("File manager unavailable"));}});return true;}
            case "probe":return probes();
            case "lspStart":return startLsp(d);
            case "lspSend":sendLsp(d.getJSONObject("message"));return true;
            case "lspStop":stopLsp();return true;
            case "build":return build(d);
            case "cmakeConfigure":d.put("mode","cmake").put("configureOnly",true);return build(d);
            case "run":return run(d);
            case "stdin": {
                if(tools.debuggerRunning()){tools.debugInput(d.getString("text"));return true;}
                Process p=execution;if(p==null||!p.isAlive())throw new IOException("Программа не запущена");
                synchronized(p){p.getOutputStream().write(d.getString("text").getBytes(StandardCharsets.UTF_8));p.getOutputStream().flush();}return true;
            }
            case "eof":if(tools.debuggerRunning()){tools.debugInput("\u0004");return true;}if(execution!=null)execution.getOutputStream().close();return true;
            case "stop":stopExecution();return true;
            case "shell":return shell(d);
            case "import":app.importProject();return true;
            case "importFile":app.importFile();return true;
            case "export":app.exportProject(currentProject);return true;
            case "keyboard":app.showKeyboard();return true;
            case "screen":app.ui.post(() -> {if(d.optBoolean("keep",true))app.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else app.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});return true;
            default:throw new IOException("Неизвестная операция: "+op);
        }
    }
    JSONObject state()throws Exception {
        JSONArray list=new JSONArray();File[] dirs=projects.listFiles();if(dirs!=null){Arrays.sort(dirs,Comparator.comparing(File::getName));for(File p:dirs)if(p.isDirectory())list.put(p.getName());}
        JSONObject labels=new JSONObject();JSONObject links=workspace.bindings();for(Iterator<String> keys=links.keys();keys.hasNext();){String id=keys.next();list.put(id);labels.put(id,links.getJSONObject(id).optString("label",id));}
        return new JSONObject().put("project",currentProject).put("projectLabels",labels).put("external",workspace.isExternal()).put("cache",workspace.data().getAbsolutePath()).put("root",project(currentProject).getAbsolutePath()).put("projects",list)
            .put("usr",usr.getAbsolutePath()).put("tree",tree(project(currentProject),0)).put("settings",new JSONObject(prefs.getString("settings","{}")))
            .put("session",new JSONObject(prefs.getString("session","{}"))).put("abi",Build.SUPPORTED_ABIS[0]).put("version",version);
    }
    File project(String name)throws IOException {
        File external=workspace.external(name);if(external!=null)return external;
        if(!name.matches("[a-zA-Z0-9_ .()-]{1,80}")||name.equals(".")||name.equals(".."))throw new IOException("Имя проекта: латиница, цифры, пробел, дефис");
        return new File(projects,name).getCanonicalFile();
    }
    File newProjectDir(String name)throws Exception {File p=project(name);if(p.exists())throw new IOException("Проект уже существует");p.mkdirs();return p;}
    void createProject(String name,String lang)throws Exception {
        File p=newProjectDir(name);
        boolean c=lang.equals("c");
        String source=c?"#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello from C++ Studio!\\n\");\n    return 0;\n}\n":"#include <iostream>\n#include <vector>\n#include <numeric>\n\nint main() {\n    std::vector<int> numbers{1, 2, 3, 4, 5};\n    const auto sum = std::accumulate(numbers.begin(), numbers.end(), 0);\n    std::cout << \"Hello from C++ Studio!\\n\";\n    std::cout << \"Sum = \" << sum << '\\n';\n    return 0;\n}\n";
        Files.write(new File(p,c?"main.c":"main.cpp").toPath(),source.getBytes(StandardCharsets.UTF_8));
        String cmake="cmake_minimum_required(VERSION 3.16)\nproject(forge_project LANGUAGES "+(c?"C":"CXX")+")\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\nadd_executable(app "+(c?"main.c":"main.cpp")+")\n";
        Files.write(new File(p,"CMakeLists.txt").toPath(),cmake.getBytes(StandardCharsets.UTF_8));
        Files.write(new File(p,".gitignore").toPath(),".forge/\nbuild/\n".getBytes(StandardCharsets.UTF_8));
        Files.write(new File(p,".clang-format").toPath(),languages.defaultStyle().getBytes(StandardCharsets.UTF_8));
    }
    boolean inside(File f,File root)throws IOException {String x=f.getCanonicalPath(),r=root.getCanonicalPath();return x.equals(r)||x.startsWith(r+"/");}
    File writablePath(String path)throws IOException {
        File f=new File(path).getCanonicalFile(),root=project(currentProject);
        if(!inside(f,root)||f.equals(root))throw new IOException("Путь вне файлов проекта");return f;
    }
    File writable(String path)throws IOException {File f=writablePath(path);if(f.isDirectory())throw new IOException("Choose a file");return f;}
    File readable(String path)throws IOException {
        File f=new File(path).getCanonicalFile();
        if((!inside(f,project(currentProject))&&!inside(f,usr))||!f.isFile())throw new IOException("Файл недоступен: "+f.getName());return f;
    }
    static String read(File f)throws IOException {return new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8);}
    JSONArray tree(File dir,int depth)throws Exception {
        JSONArray out=new JSONArray();if(depth>16)return out;
        File[] files=dir.listFiles();if(files==null)return out;
        Arrays.sort(files,(a,b) -> {int d=Boolean.compare(b.isDirectory(),a.isDirectory());return d==0?a.getName().compareToIgnoreCase(b.getName()):d;});
        int count=0;
        for(File f:files) {
            if(f.getName().equals(".forge")||f.getName().equals(".git")||f.getName().equals("build")||f.getName().equals(".cache"))continue;
            if(Files.isSymbolicLink(f.toPath()))continue;
            if(++count>2000)break;
            JSONObject item=new JSONObject().put("name",f.getName()).put("path",f.getAbsolutePath()).put("dir",f.isDirectory());
            if(f.isDirectory())item.put("children",tree(f,depth+1));else item.put("size",f.length());out.put(item);
        }
        return out;
    }
    synchronized boolean saveVersioned(String path,String text,long revision)throws Exception {
        if(app.nativeEditors!=null&&!app.nativeEditors.currentRevision(path,revision))return false;
        return save(path,text);
    }
    synchronized boolean save(String path,String text)throws Exception {File f=writable(path);return save(path,text,prefs.getString("fileEncoding:"+f.getAbsolutePath(),"auto"));}
    synchronized boolean save(String path,String text,String requested)throws Exception {
        File f=writable(path);String previous=prefs.getString("fileEncoding:"+f.getAbsolutePath(),"auto");
        byte[] old=f.isFile()?Files.readAllBytes(f.toPath()):new byte[0];FileCodec.Decoded decoded=FileCodec.decode(old,previous);
        String encoding=requested.equals("auto")?decoded.encoding:requested;byte[] bytes=FileCodec.encode(text,encoding);
        if(f.exists()&&Arrays.equals(old,bytes)){prefs.edit().putString("fileEncoding:"+f.getAbsolutePath(),encoding).apply();return true;}
        if(f.exists()){
            File hist=historyDir(f);hist.mkdirs();Files.write(new File(hist,System.currentTimeMillis()+".txt").toPath(),decoded.text.getBytes(StandardCharsets.UTF_8));
            File[] versions=hist.listFiles();if(versions!=null&&versions.length>30){Arrays.sort(versions,Comparator.comparing(File::getName));for(int i=0;i<versions.length-30;i++)versions[i].delete();}
        }
        f.getParentFile().mkdirs();File temporary=new File(f.getParentFile(),".forge-write-"+UUID.randomUUID());
        try{Files.write(temporary.toPath(),bytes);Files.move(temporary.toPath(),f.toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}finally{temporary.delete();}
        prefs.edit().putString("fileEncoding:"+f.getAbsolutePath(),encoding).apply();return true;
    }
    File historyDir(File f)throws Exception {
        String key=android.util.Base64.encodeToString(f.getAbsolutePath().getBytes(StandardCharsets.UTF_8),android.util.Base64.URL_SAFE|android.util.Base64.NO_WRAP|android.util.Base64.NO_PADDING);
        return new File(workspace.data(),"history/"+key);
    }
    JSONArray history(String path)throws Exception {
        File f=writable(path);File[] versions=historyDir(f).listFiles();JSONArray out=new JSONArray();
        if(versions!=null){Arrays.sort(versions,(a,b)->b.getName().compareTo(a.getName()));for(File v:versions)out.put(new JSONObject().put("time",v.getName().split("\\.")[0]).put("text",read(v)));}return out;
    }
    File uniqueImportFile(String name)throws Exception {
        File p=project(currentProject),f=new File(p,name);int i=1;while(f.exists())f=new File(p,"import-"+(i++)+"-"+name);return f;
    }
    void exportZip(String name,OutputStream output)throws Exception {
        try(ZipOutputStream z=new ZipOutputStream(output)){zipFolder(z,project(name),"");}
    }
    void zipFolder(ZipOutputStream z,File dir,String prefix)throws Exception {
        File[] fs=dir.listFiles();if(fs==null)return;
        for(File f:fs){if(f.getName().equals(".forge")||Files.isSymbolicLink(f.toPath()))continue;String path=prefix+f.getName();if(f.isDirectory())zipFolder(z,f,path+"/");else{z.putNextEntry(new ZipEntry(path));Files.copy(f.toPath(),z);z.closeEntry();}}
    }
    Process spawn(List<String> command,File cwd,boolean merge)throws IOException {
        ProcessBuilder pb=new ProcessBuilder(command);pb.directory(cwd);pb.redirectErrorStream(merge);
        Map<String,String> env=pb.environment();
        env.put("HOME",app.getFilesDir().getAbsolutePath());env.put("PREFIX",usr.getAbsolutePath());env.put("TMPDIR",tmp.getAbsolutePath());
        env.put("PATH",new File(usr,"bin").getAbsolutePath()+":/system/bin:/system/xbin");env.put("LD_LIBRARY_PATH",new File(usr,"lib").getAbsolutePath());
        env.put("PYTHONHOME",usr.getAbsolutePath());env.put("GUILE_AUTO_COMPILE","0");env.put("GIT_TERMINAL_PROMPT","0");env.put("GIT_CONFIG_NOSYSTEM","1");env.put("GIT_PAGER","cat");env.put("LANG","C.UTF-8");env.put("LC_ALL","C.UTF-8");env.put("TERM","dumb");env.put("CMAKE_ROOT",new File(usr,"share/cmake-4.4").getAbsolutePath());
        // Compiler subprocesses inherit our library path and TMPDIR. No global device changes.
        return pb.start();
    }
    String bin(String name){return new File(usr,"bin/"+name).getAbsolutePath();}
    String version(String name)throws Exception {
        Process p=spawn(Arrays.asList(bin(name),"--version"),usr,true);
        Future<String> reader=pool.submit(()->slurp(p.getInputStream(),8192));
        if(!p.waitFor(15,TimeUnit.SECONDS)){p.destroyForcibly();throw new IOException(name+" timeout");}
        return reader.get(5,TimeUnit.SECONDS).split("\n")[0];
    }
    JSONObject probes()throws Exception {
        JSONObject o=new JSONObject();for(String tool:new String[]{"g++-15","gcc-15","clang++","clangd","cmake","ninja","gdb","git"}) {
            try{o.put(tool,version(tool));}catch(Exception e){o.put(tool,"ОШИБКА: "+e.getMessage());}
        }return o;
    }
    static String slurp(InputStream in,int max)throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))>0){if(out.size()<max)out.write(b,0,Math.min(n,max-out.size()));}return out.toString("UTF-8");
    }
    JSONObject settings()throws Exception {return new JSONObject(prefs.getString("settings","{}"));}
    boolean isC(File f){return f.getName().endsWith(".c");}
    String compiler(JSONObject options,boolean c){return bin(options.optString("compiler","gcc").equals("clang")?(c?"clang":"clang++"):(c?"gcc-15":"g++-15"));}
    String standard(JSONObject options,boolean c)throws IOException {
        String s=options.optString(c?"cStandard":"cppStandard",c?"c17":"c++20");
        if(!s.matches("(gnu\\+\\+|c\\+\\+)(98|03|11|14|17|20|23|26)|(gnu|c)(89|90|99|11|17|23|2x)"))throw new IOException("Неизвестный стандарт языка");return s;
    }
    String cmakeStandard(JSONObject options,boolean c)throws IOException {
        String number=standard(options,c).replaceAll("[^0-9]","");
        return c&&number.equals("89")?"90":!c&&number.equals("03")?"98":number.equals("2")?"23":number;
    }
    static String quoteShellArgument(String value){return value.matches("[A-Za-z0-9_./:+,=@%-]+")?value:"'"+value.replace("'","'\\''")+"'";}
    String cmakeFlags(JSONObject options,boolean c)throws Exception {
        StringBuilder out=new StringBuilder();for(String flag:flags(options,c,false)){if(out.length()>0)out.append(' ');out.append(quoteShellArgument(flag));}return out.toString();
    }
    List<String> flags(JSONObject options,boolean c,boolean analysis)throws Exception {
        List<String> out=new ArrayList<>();
        out.add("-std="+standard(options,c));out.addAll(Arrays.asList("-Wall","-Wextra","-Wpedantic","-Wshadow","-Wunused","-I"+project(currentProject).getAbsolutePath(),"-I"+new File(usr,"include/forge").getAbsolutePath()));
        if(!c){out.add("-nostdinc++");out.add("-isystem");out.add(new File(usr,"include/c++/v1").getAbsolutePath());}
        if(analysis){out.add("-isystem");out.add(new File(usr,"include").getAbsolutePath());out.add("-isystem");out.add(new File(usr,"include/"+triple).getAbsolutePath());out.add("-resource-dir="+new File(usr,"lib/clang/21").getAbsolutePath());out.add("-Wunused-function");out.add("-Wunused-private-field");out.add("-Wunused-parameter");out.add("-Wunreachable-code");}
        else {out.add(options.optString("optimization","debug").equals("release")?"-O2":"-O0");out.add("-g");out.add("-fdiagnostics-color=never");out.add("-Wl,-rpath,"+new File(usr,"lib").getAbsolutePath());}
        JSONArray extra=options.optJSONArray("flags");if(extra!=null)for(int i=0;i<Math.min(extra.length(),100);i++){String f=extra.getString(i);if(!f.isEmpty())out.add(f);}
        return out;
    }
    void collectSources(File dir,List<File> out)throws IOException {
        File[] fs=dir.listFiles();if(fs==null)return;
        for(File f:fs){if(f.getName().equals(".forge")||f.getName().equals("build")||f.getName().equals(".git")||Files.isSymbolicLink(f.toPath()))continue;if(f.isDirectory())collectSources(f,out);else if(f.getName().matches(".*\\.(c|cc|cpp|cxx|C)$"))out.add(f);if(out.size()>1000)throw new IOException("Больше 1000 исходных файлов");}
    }
    synchronized JSONObject startLsp(JSONObject options)throws Exception {
        stopLsp();
        File root=project(currentProject),config=workspace.data();config.mkdirs();
        JSONArray db=new JSONArray();List<File> sources=new ArrayList<>();collectSources(root,sources);
        for(File f:sources){JSONArray args=new JSONArray();args.put(compiler(options,isC(f)));for(String flag:flags(options,isC(f),true))args.put(flag);args.put("-c");args.put(f.getAbsolutePath());db.put(new JSONObject().put("directory",root.getAbsolutePath()).put("file",f.getAbsolutePath()).put("arguments",args));}
        File cmakeDb=new File(workspace.data(),"cmake-"+options.optString("compiler","gcc")+"-"+standard(options,false).replace('+','p')+"/compile_commands.json");
        if(options.optString("buildMode").equals("cmake")&&cmakeDb.isFile())Files.copy(cmakeDb.toPath(),new File(config,"compile_commands.json").toPath(),StandardCopyOption.REPLACE_EXISTING);
        else Files.write(new File(config,"compile_commands.json").toPath(),db.toString(2).getBytes(StandardCharsets.UTF_8));
        final Process process=spawn(Arrays.asList(bin("clangd"),"--background-index","--background-index-priority=low","-j=2","--clang-tidy="+options.optBoolean("clangTidy",false),"--limit-results=100","--completion-style=detailed","--header-insertion=iwyu","--pch-storage=memory","--log=error","--compile-commands-dir="+config.getAbsolutePath(),"--query-driver="+bin("*")+","+new File(usr,"libexec/gcc/*/*/*").getAbsolutePath()),root,false);
        lsp=process;final long gen=++lspGeneration;
        pool.execute(()->readLsp(process,gen));
        pool.execute(()-> {try{String err=slurp(process.getErrorStream(),16000);if(!err.trim().isEmpty()&&gen==lspGeneration)app.event("lspLog",JSONObject.quote(err));}catch(IOException ignored){} });
        return new JSONObject().put("generation",gen).put("rootUri",root.toURI().toString()).put("root",root.getAbsolutePath());
    }
    void readLsp(Process process,long gen) {
        try(InputStream raw=process.getInputStream();BufferedInputStream in=new BufferedInputStream(raw)) {
            while(!closed&&gen==lspGeneration) {
                int length=0;String line;
                while(!(line=asciiLine(in)).isEmpty()) {if(line.toLowerCase(Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(line.substring(15).trim());}
                if(length<=0||length>16*1024*1024)throw new IOException("Invalid LSP frame");
                byte[] bytes=new byte[length];int at=0,n;while(at<length&&(n=in.read(bytes,at,length-at))>0)at+=n;
                if(at!=length)throw new EOFException();
                JSONObject message=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(gen==lspGeneration)app.event("lsp",message);
            }
        } catch(Exception e) {
            if(!closed&&gen==lspGeneration){try{app.event("lspExit",new JSONObject().put("error",e.toString()));}catch(JSONException ignored){}}
        }
    }
    static String asciiLine(InputStream in)throws IOException {ByteArrayOutputStream b=new ByteArrayOutputStream();int c;while((c=in.read())!=-1){if(c==10)break;if(c!=13)b.write(c);if(b.size()>8192)throw new IOException("LSP header too large");}if(c==-1)throw new EOFException();return b.toString("US-ASCII");}
    void sendLsp(JSONObject message)throws Exception {
        synchronized(lspWrite){Process p=lsp;if(p==null||!p.isAlive())throw new IOException("clangd остановлен");byte[] b=message.toString().getBytes(StandardCharsets.UTF_8);OutputStream out=p.getOutputStream();out.write(("Content-Length: "+b.length+"\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(b);out.flush();}
    }
    synchronized void stopLsp(){++lspGeneration;Process p=lsp;lsp=null;if(p!=null)p.destroy();}
    JSONObject build(JSONObject d)throws Exception {
        synchronized(buildLock) {
            buildCancelled=false;JSONObject options=d.has("options")?d.getJSONObject("options"):settings();
            File root=project(currentProject),outDir=new File(workspace.data(),"bin");outDir.mkdirs();
            String mode=d.optString("mode","file"),id=d.optString("id",UUID.randomUUID().toString());
            File output=new File(outDir,"program");
            List<String> cmd=new ArrayList<>();
            if(mode.equals("cmake")) {
                File cmakeDir=new File(workspace.data(),"cmake-"+options.optString("compiler","gcc")+"-"+standard(options,false).replace('+','p'));
                cmd.addAll(Arrays.asList(bin("cmake"),"-S",root.getAbsolutePath(),"-B",cmakeDir.getAbsolutePath(),"-G","Ninja","-DCMAKE_MAKE_PROGRAM="+bin("ninja"),"-DCMAKE_C_COMPILER="+compiler(options,true),"-DCMAKE_CXX_COMPILER="+compiler(options,false),"-DCMAKE_BUILD_TYPE="+(options.optString("optimization","debug").equals("release")?"Release":"Debug"),"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON","-DCMAKE_C_STANDARD="+cmakeStandard(options,true),"-DCMAKE_CXX_STANDARD="+cmakeStandard(options,false),"-DCMAKE_C_EXTENSIONS="+(standard(options,true).startsWith("gnu")?"ON":"OFF"),"-DCMAKE_CXX_EXTENSIONS="+(standard(options,false).startsWith("gnu")?"ON":"OFF"),"-DCMAKE_C_FLAGS="+cmakeFlags(options,true),"-DCMAKE_CXX_FLAGS="+cmakeFlags(options,false)));
                int rc=buildCommand(cmd,root,id);
                if(rc!=0||d.optBoolean("configureOnly"))return new JSONObject().put("code",rc).put("id",id).put("configured",rc==0);
                rc=buildCommand(Arrays.asList(bin("cmake"),"--build",cmakeDir.getAbsolutePath(),"-j2"),root,id);
                File target=new File(cmakeDir,options.optString("target","app"));
                if(!inside(target,cmakeDir))throw new IOException("Путь исполняемого файла вне каталога сборки");
                return new JSONObject().put("code",rc).put("id",id).put("executable",target.getAbsolutePath()).put("exists",target.isFile());
            }
            File file=readable(d.getString("path"));if(!inside(file,root))throw new IOException("Выберите исходный файл проекта");
            boolean c=isC(file);cmd.add(compiler(options,c));cmd.addAll(flags(options,c,false));
            if(mode.equals("project")){List<File> sources=new ArrayList<>();collectSources(root,sources);for(File s:sources)cmd.add(s.getAbsolutePath());}
            else cmd.add(file.getAbsolutePath());
            cmd.add("-o");cmd.add(output.getAbsolutePath());
            int rc=buildCommand(cmd,root,id);if(rc==0)output.setExecutable(true,true);
            return new JSONObject().put("code",rc).put("executable",output.getAbsolutePath()).put("exists",output.isFile()).put("id",id);
        }
    }
    int buildCommand(List<String> cmd,File cwd,String id)throws Exception {
        if(buildCancelled)return 130;
        app.event("output",new JSONObject().put("id",id).put("stream","command").put("text",displayCommand(cmd)+"\n"));
        final Process p=spawn(cmd,cwd,true);building=p;
        Future<?> reader=pool.submit(()->pump(p.getInputStream(),id,"build"));
        boolean done=p.waitFor(180,TimeUnit.SECONDS);
        if(!done){p.destroyForcibly();app.event("output",new JSONObject().put("id",id).put("stream","build").put("text","\nСборка остановлена: превышено 180 секунд.\n"));}
        try{reader.get(5,TimeUnit.SECONDS);}catch(Exception ignored){}
        if(building==p)building=null;
        return buildCancelled?130:done?p.exitValue():124;
    }
    static String displayCommand(List<String> cmd){StringBuilder b=new StringBuilder();for(String s:cmd){if(b.length()>0)b.append(' ');b.append(s.contains(" ")?"\""+s+"\"":s);}return b.toString();}
    JSONObject run(JSONObject d)throws Exception {
        if(execution!=null&&execution.isAlive())throw new IOException("Сначала остановите запущенную программу");
        File executable=new File(d.getString("executable")).getCanonicalFile();
        if(!workspace.canExecute(executable)||!executable.isFile())throw new IOException("Исполняемый файл не найден");
        executable.setExecutable(true,true);
        List<String> cmd=new ArrayList<>();cmd.add(executable.getAbsolutePath());
        JSONArray args=d.optJSONArray("args");if(args!=null)for(int i=0;i<args.length();i++)cmd.add(args.getString(i));
        String id=d.optString("id",UUID.randomUUID().toString());
        Process p=spawn(cmd,project(currentProject),false);attachExecution(p,id);
        return new JSONObject().put("id",id);
    }
    JSONObject shell(JSONObject d)throws Exception {
        if(execution!=null&&execution.isAlive())throw new IOException("Сначала остановите запущенную программу");
        String id=d.optString("id",UUID.randomUUID().toString());
        Process p=spawn(Arrays.asList("/system/bin/sh","-c",d.getString("command")),project(currentProject),false);attachExecution(p,id);
        return new JSONObject().put("id",id);
    }
    void attachExecution(Process p,String id) {
        execution=p;runId=id;
        Future<?> stdout=pool.submit(()->pump(p.getInputStream(),id,"stdout"));
        Future<?> stderr=pool.submit(()->pump(p.getErrorStream(),id,"stderr"));
        pool.execute(()-> {try{int code=p.waitFor();try{stdout.get(3,TimeUnit.SECONDS);stderr.get(3,TimeUnit.SECONDS);}catch(Exception ignored){}if(execution==p)execution=null;app.event("exit",new JSONObject().put("id",id).put("code",code));}catch(Exception e){android.util.Log.w("Forge","Run",e);} });
    }
    void pump(InputStream in,String id,String stream) {
        try(InputStreamReader r=new InputStreamReader(in,StandardCharsets.UTF_8)) {
            char[] b=new char[2048];int n;long total=0;
            while((n=r.read(b))>0){total+=n;if(total<=2*1024*1024)app.event("output",new JSONObject().put("id",id).put("stream",stream).put("text",new String(b,0,n)));else if(total-n<=2*1024*1024)app.event("output",new JSONObject().put("id",id).put("stream",stream).put("text","\n[Вывод ограничен 2 МБ; программа продолжает работать]\n"));}
        }catch(Exception e){android.util.Log.d("Forge","Output stream closed",e);}
    }
    void stopExecution(){if(tools!=null)tools.stopDebug();buildCancelled=true;Process a=execution,b=building;if(a!=null)a.destroyForcibly();if(b!=null)b.destroyForcibly();}
    void close(){closed=true;stopLsp();stopExecution();pool.shutdownNow();}
}
