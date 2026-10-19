package dev.forge.ide;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

final class LanguageTools {
    static final String DEFAULT_STYLE="BasedOnStyle: LLVM\nIndentWidth: 4\nTabWidth: 4\nUseTab: Never\nColumnLimit: 120\nBreakBeforeBraces: Attach\nAccessModifierOffset: -4\nNamespaceIndentation: None\nAllowShortFunctionsOnASingleLine: Empty\nAllowShortIfStatementsOnASingleLine: Never\nAllowShortLoopsOnASingleLine: false\nDerivePointerAlignment: false\nPointerAlignment: Right\nReferenceAlignment: Left\nSpaceBeforeParens: ControlStatements\nSpaceBeforeRangeBasedForLoopColon: true\n";
    final IdeEngine ide;
    LanguageTools(IdeEngine engine){ide=engine;}
    Object handle(String op,JSONObject data)throws Exception {
        switch(op){
            case "formatterConfig":return config();
            case "formatterPreview":return preview(data);
            case "formatterSchema":return capture(Arrays.asList(ide.bin("clang-format"),"--style=LLVM","--dump-config"),"");
            case "cmakeCommands":return capture(Arrays.asList(ide.bin("cmake"),"--help-command-list"),"");
            case "cmakeHelp": {
                String name=data.getString("name");if(!name.matches("[A-Za-z_][A-Za-z_0-9]*"))throw new IOException("Invalid CMake command");
                return capture(Arrays.asList(ide.bin("cmake"),"--help-command",name),"");
            }
            case "cmakeSources": {
                JSONObject options=ide.settings();File file=new File(ide.workspace.data(),"cmake-"+options.optString("compiler","gcc")+"-"+ide.standard(options,false).replace('+','p')+"/compile_commands.json");
                JSONArray files=new JSONArray();if(file.isFile()&&file.length()<16*1024*1024){JSONArray entries=new JSONArray(IdeEngine.read(file));for(int i=0;i<entries.length();i++){JSONObject entry=entries.getJSONObject(i);File source=new File(entry.getString("file"));if(!source.isAbsolute())source=new File(entry.getString("directory"),source.getPath());files.put(source.getCanonicalPath());}}
                return new JSONObject().put("configured",file.isFile()).put("files",files).put("time",file.lastModified());
            }
            case "formatDocument": {
                File file=ide.readable(data.getString("path"));config();
                return capture(Arrays.asList(ide.bin("clang-format"),"--style=file","--assume-filename="+file.getAbsolutePath()),data.getString("text"));
            }
            default:throw new IOException("Unknown language tool operation");
        }
    }
    JSONObject config()throws Exception {
        File root=ide.project(ide.currentProject),file=new File(root,".clang-format");
        File alternate=new File(root,"_clang-format");if(!file.isFile()&&alternate.isFile())file=alternate;
        String old="BasedOnStyle: LLVM\nIndentWidth: 4\nColumnLimit: 100\n";
        if(!file.exists()||(file.isFile()&&IdeEngine.read(file).replace("\r\n","\n").equals(old)))ide.save(file.getAbsolutePath(),DEFAULT_STYLE);
        return new JSONObject().put("path",file.getAbsolutePath()).put("text",IdeEngine.read(file)).put("defaults",DEFAULT_STYLE);
    }
    JSONObject preview(JSONObject request)throws Exception {
        String text=request.optString("text"),style=request.getString("style");
        if(style.length()>256*1024||text.length()>2*1024*1024)throw new IOException("Formatter preview input is too large");
        File file=new File(ide.app.getCacheDir(),"format-"+UUID.randomUUID()+".yaml");
        try{
            Files.write(file.toPath(),style.getBytes(StandardCharsets.UTF_8));
            return capture(Arrays.asList(ide.bin("clang-format"),"--style=file:"+file.getAbsolutePath(),"--assume-filename=preview.cpp"),text);
        }finally{file.delete();}
    }
    JSONObject capture(List<String> command,String input)throws Exception {
        Process process=ide.spawn(command,ide.project(ide.currentProject),false);
        Future<String> out=ide.pool.submit(()->IdeEngine.slurp(process.getInputStream(),4*1024*1024));
        Future<String> err=ide.pool.submit(()->IdeEngine.slurp(process.getErrorStream(),65536));
        try{
            try(OutputStream stream=process.getOutputStream()){stream.write(input.getBytes(StandardCharsets.UTF_8));}
            if(!process.waitFor(15,TimeUnit.SECONDS))throw new IOException("clang-format timeout");
            return new JSONObject().put("code",process.exitValue()).put("text",out.get(3,TimeUnit.SECONDS)).put("error",err.get(3,TimeUnit.SECONDS));
        }finally{if(process.isAlive())process.destroyForcibly();}
    }
}
