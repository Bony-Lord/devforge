package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Native Git operations and GDB/MI transport. Parsing and editor UI live in JS. */
final class ToolsEngine {
    final IdeEngine ide;
    volatile Process gdb,relay;
    volatile String session="";
    ToolsEngine(IdeEngine engine){ide=engine;}
    boolean debuggerRunning(){Process p=gdb;return p!=null&&p.isAlive();}
    Object handle(String op,JSONObject data)throws Exception {
        switch(op){
            case "gdbStart":return startDebug(data);
            case "gdbSend":sendDebug(data.getString("command"));return true;
            case "gdbStop":stopDebug();return true;
            case "gdbStdin":debugInput(data.getString("text"));return true;
            case "git":return git(data);
            default:throw new IOException("Unknown native tool operation");
        }
    }
    synchronized JSONObject startDebug(JSONObject d)throws Exception {
        if(debuggerRunning())throw new IOException("Отладчик уже запущен");
        if(ide.execution!=null&&ide.execution.isAlive())throw new IOException("Сначала остановите программу");
        JSONObject options=d.optJSONObject("options");if(options==null)options=ide.settings();File root=BuildProfiles.workingDirectory(ide,options),file=new File(d.getString("executable")).getCanonicalFile();Map<String,String> environment=BuildProfiles.environment(options);environment.putIfAbsent("UBSAN_OPTIONS","halt_on_error=0:print_stacktrace=0:color=never:log_to_syslog=0");environment.putIfAbsent("ASAN_OPTIONS","halt_on_error=0:detect_leaks=0:color=never:symbolize=0");
        if(!ide.workspace.canExecute(file)||!file.isFile())throw new IOException("Программа для отладки не найдена");
        file.setExecutable(true,true);
        File printers=new File(ide.app.getFilesDir(),"debug/libcxx/printers.py");printers.getParentFile().mkdirs();
        try(InputStream in=ide.app.getAssets().open("debug/libcxx/printers.py")){Files.copy(in,printers.toPath(),StandardCopyOption.REPLACE_EXISTING);}
        try(InputStream in=ide.app.getAssets().open("debug/libcxx/__init__.py")){Files.copy(in,new File(printers.getParentFile(),"__init__.py").toPath(),StandardCopyOption.REPLACE_EXISTING);}
        File loader=new File(ide.app.getFilesDir(),"debug/studio-printers.py");
        String source="import sys\nsys.path.insert(0, "+JSONObject.quote(printers.getParentFile().getParent()).replace("\\/","/")+")\nfrom libcxx.printers import register_libcxx_printer_loader\nregister_libcxx_printer_loader()\n";Files.write(loader.toPath(),source.getBytes(StandardCharsets.UTF_8));
        String id=d.optString("id",UUID.randomUUID().toString());session=id;
        Process io=ide.spawn(Arrays.asList(ide.bin("forge-pty")),root,false);relay=io;
        String tty=IdeEngine.asciiLine(io.getInputStream());
        if(!tty.startsWith("/dev/pts/")){io.destroyForcibly();relay=null;throw new IOException("Не удалось открыть терминал отладчика: "+tty);}
        ide.pool.execute(()->ide.pump(io.getInputStream(),id,"stdout"));
        ide.pool.execute(()->ide.pump(io.getErrorStream(),id,"stderr"));
        final Process debugger;
        try{debugger=ide.spawn(Arrays.asList(ide.bin("gdb"),"--quiet","--nx","--interpreter=mi2"),root,false,environment);gdb=debugger;}
        catch(IOException e){io.destroyForcibly();relay=null;throw e;}
        ide.pool.execute(()->{
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(debugger.getInputStream(),StandardCharsets.UTF_8))){
                String line;while((line=reader.readLine())!=null)ide.app.event("gdb",new JSONObject().put("session",id).put("line",line));
            }catch(Exception e){android.util.Log.d("Forge","GDB transport",e);}
            finally{if(gdb==debugger){gdb=null;io.destroy();try{ide.app.event("gdbExit",new JSONObject().put("session",id));}catch(Exception ignored){}}}
        });
        ide.pool.execute(()->ide.pump(debugger.getErrorStream(),id,"stderr"));
        return new JSONObject().put("printers",loader.getAbsolutePath()).put("tty",tty).put("session",id).put("executable",file.getAbsolutePath());
    }
    synchronized void sendDebug(String command)throws Exception {
        Process p=gdb;if(p==null||!p.isAlive())throw new IOException("GDB остановлен");
        if(command.contains("\n")||command.contains("\r")||command.length()>65536)throw new IOException("Неверная команда GDB");
        p.getOutputStream().write((command+"\n").getBytes(StandardCharsets.UTF_8));p.getOutputStream().flush();
    }
    void debugInput(String text)throws Exception {
        Process p=relay;if(p==null||!debuggerRunning())throw new IOException("Отладчик не запущен");
        p.getOutputStream().write(text.getBytes(StandardCharsets.UTF_8));p.getOutputStream().flush();
    }
    synchronized void stopDebug() {
        Process p=gdb,io=relay;gdb=null;relay=null;
        if(p!=null){
            try{p.getOutputStream().write("-gdb-set confirm off\n-interpreter-exec console \"kill\"\n-gdb-exit\n".getBytes(StandardCharsets.UTF_8));p.getOutputStream().flush();if(!p.waitFor(1500,TimeUnit.MILLISECONDS))p.destroyForcibly();}catch(Exception e){p.destroyForcibly();}
        }
        if(io!=null)io.destroyForcibly();
    }
    JSONObject gitCommand(List<String> arguments,File root)throws Exception {
        File excludes=new File(ide.app.getFilesDir(),"git-excludes");
        if(!excludes.isFile())Files.write(excludes.toPath(),".forge/\n".getBytes(StandardCharsets.UTF_8));
        List<String> command=new ArrayList<>();command.add(ide.bin("git"));command.add("--no-pager");command.add("-c");command.add("core.excludesFile="+excludes.getAbsolutePath());command.add("-c");command.add("safe.directory="+root.getCanonicalPath());command.addAll(arguments);
        Process p=ide.spawn(command,root,true);
        Future<String> output=ide.pool.submit(()->IdeEngine.slurp(p.getInputStream(),2*1024*1024));
        if(!p.waitFor(120,TimeUnit.SECONDS)){p.destroyForcibly();throw new IOException("Git: превышено время ожидания");}
        return new JSONObject().put("code",p.exitValue()).put("text",output.get(10,TimeUnit.SECONDS));
    }
    JSONObject git(JSONObject d)throws Exception {
        File root=ide.project(ide.currentProject);String action=d.getString("action");
        switch(action){
            case "status": {
                JSONObject status=gitCommand(Arrays.asList("-c","core.quotepath=false","status","--porcelain=v1","-z"),root);
                status.put("branch",gitCommand(Arrays.asList("symbolic-ref","--short","HEAD"),root).optString("text").trim());return status;
            }
            case "init":return gitCommand(Arrays.asList("init","--initial-branch=main"),root);
            case "add": {
                String path=d.optString("path",".");if(!path.equals(".")){File f=new File(root,path).getCanonicalFile();if(!ide.inside(f,root))throw new IOException("Файл вне проекта");}
                return gitCommand(Arrays.asList("add","--",path),root);
            }
            case "commit": {
                String name=d.getString("name").trim(),email=d.getString("email").trim(),message=d.getString("message").trim();
                if(name.isEmpty()||email.isEmpty()||message.isEmpty())throw new IOException("Нужны автор, email и сообщение коммита");
                if(d.optBoolean("stageAll")){JSONObject add=gitCommand(Arrays.asList("add","--all"),root);if(add.getInt("code")!=0)return add;}
                return gitCommand(Arrays.asList("-c","user.name="+name,"-c","user.email="+email,"commit","-m",message),root);
            }
            case "log":return gitCommand(Arrays.asList("log","-40","--date=iso-strict","--format=%h%x09%an%x09%ad%x09%s"),root);
            case "branches":return gitCommand(Arrays.asList("branch","--list","--format=%(refname:short)"),root);
            case "switch":return gitCommand(Arrays.asList("switch","--",d.getString("branch")),root);
            case "newBranch":return gitCommand(Arrays.asList("switch","-c",d.getString("branch")),root);
            case "diff": {
                File f=new File(d.getString("path")).getCanonicalFile();if(!ide.inside(f,root))throw new IOException("Файл вне проекта");
                String relative=root.toPath().relativize(f.toPath()).toString();
                JSONObject old=gitCommand(Arrays.asList("show","HEAD:"+relative),root);
                return new JSONObject().put("original",old.getInt("code")==0?old.getString("text"):"").put("modified",f.isFile()?IdeEngine.read(f):"").put("path",f.getAbsolutePath());
            }
            case "clone": {
                String url=d.getString("url");if(!url.startsWith("https://")||url.contains("\n"))throw new IOException("Используйте HTTPS URL репозитория");
                File dest=ide.newProjectDir(d.getString("name"));JSONObject r=gitCommand(Arrays.asList("clone","--",url,dest.getAbsolutePath()),ide.projects);r.put("project",dest.getName());return r;
            }
            default:throw new IOException("Неизвестная операция Git");
        }
    }
}
