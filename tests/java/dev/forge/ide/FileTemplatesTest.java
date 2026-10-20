package dev.forge.ide;

public final class FileTemplatesTest {
    static int checks;
    static void require(boolean value){checks++;if(!value)throw new AssertionError("Template case "+checks);}
    static void reject(String path){try{FileTemplates.create("cpp",path,"");throw new AssertionError("Accepted "+path);}catch(IllegalArgumentException expected){checks++;}}
    public static void main(String[] args){
        var pair=FileTemplates.create("class","src/model/Point","demo::geometry");require(pair.size()==2);require(pair.get("src/model/Point.hpp").contains("namespace demo::geometry"));require(pair.get("src/model/Point.cpp").contains("#include \"Point.hpp\""));require(pair.get("src/model/Point.cpp").contains("Point::Point() = default;"));
        require(FileTemplates.create("cpp","src/main.cpp","").containsKey("src/main.cpp"));require(FileTemplates.create("hpp","include/api","").get("include/api.hpp").startsWith("#pragma once"));require(FileTemplates.create("cmakelists","subdir","").containsKey("subdir/CMakeLists.txt"));require(FileTemplates.create("cmakelists","CMakeLists.txt","").size()==1);
        reject("../outside");reject("src/../../outside");reject("/absolute");reject("src//bad");reject("src/./bad");reject("src/bad\nname");reject("src/bad\tname");
        try{FileTemplates.create("class","src/Bad-Type","");throw new AssertionError();}catch(IllegalArgumentException expected){checks++;}
        try{FileTemplates.create("class","Point","bad namespace");throw new AssertionError();}catch(IllegalArgumentException expected){checks++;}
        System.out.println(checks+" file template checks passed");
    }
}
