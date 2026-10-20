package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Checks belong to the built artifact, not whatever settings are selected at run time. */
final class RuntimeChecks {
    final IdeEngine ide;
    final Map<String,String> probes = new HashMap<>();
    RuntimeChecks(IdeEngine ide) { this.ide=ide; }

    static boolean debug(JSONObject options) { return !options.optString("optimization","debug").equals("release"); }
    static boolean sanitizers(JSONObject options) { return debug(options) && options.optString("runtimeChecks","assertions").equals("sanitizers"); }
    static List<String> flags(JSONObject options, boolean c) {
        List<String> result=new ArrayList<>();
        if(!debug(options))return result;
        result.add("-fno-omit-frame-pointer");
        if(!options.optString("runtimeChecks","assertions").equals("none")&&!c)
            result.add("-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG");
        if(sanitizers(options)) {
            result.addAll(Arrays.asList("-fsanitize=address,undefined","-fno-sanitize-recover=all"));
            if(options.optString("compiler","gcc").equals("clang"))result.add("-shared-libasan");
        }
        return result;
    }
    File asanLibrary() throws IOException {
        String arch=ide.triple.startsWith("x86_64")?"x86_64":ide.triple.startsWith("arm-")?"arm":"aarch64";
        File lib=new File(ide.usr,"lib/clang/21/lib/linux/libclang_rt.asan-"+arch+"-android.so");
        if(!lib.isFile())throw new IOException("AddressSanitizer: библиотека выполнения не установлена. Включите компонент Clang.");
        return lib;
    }
    synchronized void verify(JSONObject options) throws Exception {
        if(!sanitizers(options))return;
        if(!options.optString("compiler","gcc").equals("clang"))
            throw new IOException("ASan/UBSan в Android-сборке требуют Clang. Выберите Clang или проверки стандартной библиотеки; проверки не были отключены автоматически.");
        asanLibrary();
        String compiler=ide.compiler(options,false),key=compiler+":"+new File(compiler).lastModified();
        if(probes.containsKey(key)) { if(!probes.get(key).isEmpty())throw new IOException(probes.get(key));return; }
        File dir=new File(ide.tmp,"sanitizer-probe");dir.mkdirs();
        File source=new File(dir,"probe.cpp"),output=new File(dir,"probe.so");
        Files.write(source.toPath(),"int main(){return 0;}\n".getBytes(StandardCharsets.UTF_8));
        List<String> command=new ArrayList<>(Arrays.asList(compiler));command.addAll(ide.flags(options,false,false));command.addAll(Arrays.asList("-x","c++",source.getAbsolutePath(),"-o",output.getAbsolutePath()));
        Process p=ide.spawn(command,dir,true);
        Future<String> reader=ide.pool.submit(()->IdeEngine.slurp(p.getInputStream(),12000));
        String error="";
        try {
            if(!p.waitFor(25,TimeUnit.SECONDS)){p.destroyForcibly();throw new IOException("AddressSanitizer: проверка компилятора превысила время ожидания");}
            String text=reader.get(3,TimeUnit.SECONDS);
            if(p.exitValue()!=0)error="Компилятор не поддерживает выбранные ASan/UBSan:\n"+text;
            probes.put(key,error);
        } finally { Files.deleteIfExists(output.toPath());Files.deleteIfExists(source.toPath()); }
        if(!error.isEmpty())throw new IOException(error);
    }
    void save(File executable,JSONObject options) throws Exception {
        JSONObject profile=new JSONObject().put("version",1).put("sanitizers",sanitizers(options))
            .put("checks",debug(options)?options.optString("runtimeChecks","assertions"):"none");
        Path target=new File(executable.getPath()+".studio-runtime.json").toPath();
        Path temp=Files.createTempFile(target.getParent(),"profile-",".tmp");
        try { Files.write(temp,profile.toString().getBytes(StandardCharsets.UTF_8));Files.move(temp,target,StandardCopyOption.REPLACE_EXISTING); }
        finally { Files.deleteIfExists(temp); }
    }
    JSONObject profile(File executable) throws Exception {
        File file=new File(executable.getPath()+".studio-runtime.json");
        if(!file.isFile()||file.length()>8192)return new JSONObject();
        return new JSONObject(new String(Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8));
    }
    Map<String,String> environment(File executable) throws Exception {
        Map<String,String> env=new HashMap<>();
        if(profile(executable).optBoolean("sanitizers")) {
            File lib=asanLibrary();
            env.put("LD_PRELOAD",lib.getAbsolutePath());
            env.put("LD_LIBRARY_PATH",new File(ide.usr,"lib").getAbsolutePath()+":"+lib.getParent());
            env.put("ASAN_OPTIONS","halt_on_error=1:abort_on_error=1:detect_leaks=0:color=never:symbolize=1");
            env.put("UBSAN_OPTIONS","halt_on_error=1:print_stacktrace=1:color=never");
            File symbolizer=new File(ide.usr,"bin/llvm-symbolizer");
            if(symbolizer.isFile())env.put("ASAN_SYMBOLIZER_PATH",symbolizer.getAbsolutePath());
        }
        return env;
    }
    JSONArray symbolize(JSONArray addresses)throws Exception {
        JSONArray frames=new JSONArray();Map<String,List<JSONObject>> groups=new LinkedHashMap<>();
        for(int i=0;i<Math.min(64,addresses.length());i++){
            JSONObject entry=addresses.getJSONObject(i);String offset=entry.optString("offset");if(!offset.matches("0x[0-9a-fA-F]{1,16}"))continue;
            File file=new File(entry.getString("path")).getCanonicalFile();if(!ide.workspace.canExecute(file)||!file.isFile())continue;
            groups.computeIfAbsent(file.getAbsolutePath(),k->new ArrayList<>()).add(entry);
        }
        for(Map.Entry<String,List<JSONObject>> group:groups.entrySet()){
            List<String> command=new ArrayList<>(Arrays.asList(ide.bin("addr2line"),"-a","-f","-C","-e",group.getKey()));for(JSONObject address:group.getValue())command.add(address.getString("offset"));
            Process process=ide.spawn(command,ide.project(ide.currentProject),true);Future<String> output=ide.pool.submit(()->IdeEngine.slurp(process.getInputStream(),128*1024));
            try{if(!process.waitFor(10,TimeUnit.SECONDS))throw new IOException("Symbolizer timeout");String[] lines=output.get(2,TimeUnit.SECONDS).split("\n");int index=0;
                for(int at=0;at+2<lines.length&&index<group.getValue().size();at+=3,index++){
                    java.util.regex.Matcher location=java.util.regex.Pattern.compile("^(.*):(\\d+)(?: \\(discriminator \\d+\\))?$").matcher(lines[at+2].trim());
                    if(location.matches()&&!location.group(1).equals("??")&&Integer.parseInt(location.group(2))>0)frames.put(new JSONObject().put("path",location.group(1)).put("line",Integer.parseInt(location.group(2))).put("func",lines[at+1]).put("level",group.getValue().get(index).optInt("level",index)));
                }
            }finally{if(process.isAlive())process.destroyForcibly();}
        }
        return frames;
    }
}
