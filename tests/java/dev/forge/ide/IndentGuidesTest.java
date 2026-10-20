package dev.forge.ide;
import java.util.*;
public final class IndentGuidesTest {
    static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("Indent guide scenario "+checks);}
    public static void main(String[] args){
        var nested=IndentGuides.scan("int main() {\n    if (true) {\n        run();\n\n    }\n}\n",4);check(nested.size()==2);check(nested.stream().anyMatch(g->g.column==4&&g.first==1&&g.last==4));check(nested.stream().anyMatch(g->g.column==0&&g.first==0&&g.last==5));
        var tabs=IndentGuides.scan("root\r\n\tchild\r\n\t\tleaf\r\nend",8);check(tabs.size()==2&&tabs.stream().anyMatch(g->g.column==8));check(IndentGuides.scan("one\ntwo\n",4).isEmpty());
        var unfinished=IndentGuides.scan("root\n    child\n        ",4);check(unfinished.size()==1&&unfinished.get(0).toBottom);check(IndentGuides.scan("root\n\n    child\n\nend",4).get(0).last==4);
        System.out.println(checks+" indent guide checks passed");
    }
}
