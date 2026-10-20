package dev.forge.ide;

import java.util.*;

/** Platform-neutral templates; names are project-relative and never overwrite files. */
final class FileTemplates {
    static LinkedHashMap<String,String> create(String kind,String input,String namespace){
        String name=input.trim().replace('\\','/');
        if(name.startsWith("/")||name.isEmpty()||Arrays.asList(name.split("/",-1)).stream().anyMatch(p->p.isEmpty()||p.equals("..")||p.equals("."))||name.chars().anyMatch(c->c<32||c==127))throw new IllegalArgumentException("Invalid relative path");
        LinkedHashMap<String,String> files=new LinkedHashMap<>();String text="";
        if(kind.equals("class")){
            int slash=name.lastIndexOf('/');String dir=slash<0?"":name.substring(0,slash+1),type=name.substring(slash+1);
            if(!type.matches("[A-Za-z_][A-Za-z_0-9]*")||!namespace.isEmpty()&&!namespace.matches("[A-Za-z_][A-Za-z_0-9]*(::[A-Za-z_][A-Za-z_0-9]*)*"))throw new IllegalArgumentException("Invalid C++ identifier");
            String begin=namespace.isEmpty()?"":"namespace "+namespace+" {\n\n",end=namespace.isEmpty()?"":"\n} // namespace "+namespace+"\n";
            files.put(dir+type+".hpp","#pragma once\n\n"+begin+"class "+type+" {\npublic:\n    "+type+"();\n};\n"+end);
            files.put(dir+type+".cpp","#include \""+type+".hpp\"\n\n"+begin+type+"::"+type+"() = default;\n"+end);return files;
        }
        switch(kind){
            case "cpp":if(!name.endsWith(".cpp"))name+=".cpp";text="// "+name.substring(name.lastIndexOf('/')+1)+"\n\n";break;
            case "c":if(!name.endsWith(".c"))name+=".c";text="/* "+name.substring(name.lastIndexOf('/')+1)+" */\n\n";break;
            case "h":case "hpp":if(!name.endsWith("."+kind))name+="."+kind;text="#pragma once\n\n";break;
            case "cmake":if(!name.endsWith(".cmake"))name+=".cmake";text="# CMake module\n\n";break;
            case "cmakelists":if(!name.endsWith("CMakeLists.txt"))name+="/CMakeLists.txt";text="cmake_minimum_required(VERSION 3.22)\nproject(app LANGUAGES C CXX)\n\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\n\nadd_executable(app main.cpp)\n";break;
            case "empty":break;
            default:throw new IllegalArgumentException("Unsupported template");
        }
        files.put(name,text);return files;
    }
}
