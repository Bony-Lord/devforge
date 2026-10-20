package dev.forge.ide;

/** Deterministic editor scenarios: | marks the caret, not document content. */
public final class SmartTypingTest {
    static int checks;
    static void equal(String label,Object actual,Object expected){checks++;if(!actual.equals(expected))throw new AssertionError(label+"\nexpected: "+expected+"\nactual: "+actual);}
    static String type(SmartTyping typing,String marked,String key,String newline){int cursor=marked.indexOf('|');String text=marked.replace("|","");SmartTyping.Edit edit=typing.typed(text,cursor,cursor,key,newline);if(edit==null)return text.substring(0,cursor)+key+"|"+text.substring(cursor);String value=text.substring(0,edit.start)+edit.text+text.substring(edit.end);return value.substring(0,edit.caret)+"|"+value.substring(edit.caret);}
    static void type(String label,String before,String key,String after){equal(label,type(new SmartTyping("cpp"),before,key,"\n"),after);}
    static void backspace(String before,String after){int p=before.indexOf('|');String text=before.replace("|","");SmartTyping.Edit e=new SmartTyping("cpp").backspace(text,p);String value=e==null?text.substring(0,p-1)+text.substring(p):text.substring(0,e.start)+e.text+text.substring(e.end);int caret=e==null?p-1:e.caret;equal("Backspace "+before,value.substring(0,caret)+"|"+value.substring(caret),after);}
    public static void main(String[] args){
        type("empty block Enter","{|}","\n","{\n    |\n}");
        type("nested block Enter","    if (ok) {|}","\n","    if (ok) {\n        |\n    }");
        type("whitespace inside pair","if (ok) {  |  }","\n","if (ok) {\n    |\n}");
        type("continuation and closing paren","call(|)","\n","call(\n    |\n)");
        type("brackets on Enter","int values[]{|};","\n","int values[]{\n    |\n};");
        type("nested parentheses skip","outer(inner(|))",")","outer(inner()|)");
        type("repeat skip into outer pair","outer(inner()|)",")","outer(inner())|");
        type("existing balanced pair after caret navigation","call(value|)",")","call(value)|");
        type("orphan closer cannot be skipped","value|)",")","value)|)");
        type("mismatched brackets cannot be skipped","([|)",")","([)|)");
        type("nested opener adds its own pair","call(|)","(","call((|))");
        type("opening reuses orphan closer","call|)","(","call(|)");
        type("opener before identifier stays literal","a|b","(","a(|b");
        type("comparison is not a template pair","a |b","<","a <|b");
        type("include angle pair","#include |","<","#include <|>");
        type("include angle skip","#include <vector|>",">","#include <vector>|");
        type("line comment literal","// |","{","// {|");
        type("block comment literal","/* | */","(","/* (| */");
        type("string literal bracket","\"hello|\"","(","\"hello(|\"");
        type("matching quote skip","\"hello|\"","\"","\"hello\"|");
        type("escaped quote is literal","\"hello\\|\"","\"","\"hello\\\"|\"");
        type("digit separator is literal","1|000","'","1'|000");
        type("raw string literal","R\"tag(hello|)tag\"","{","R\"tag(hello{|)tag\"");
        type("raw string closing quote remains literal","R\"tag(hello|)tag\"","\"","R\"tag(hello\"|)tag\"");
        type("unindent close brace","void f() {\n    int x;\n    |}","}","void f() {\n    int x;\n}|");
        type("new manual close dedents","void f() {\n    int x;\n        |","}","void f() {\n    int x;\n}|");
        backspace("(|)","|");backspace("[|]","|");backspace("{|}","|");backspace("\"|\"","|");backspace("'|'","|");
        backspace("      |value","    |value");backspace("{\n    |\n}","{\n|\n}");backspace("// (|)","// |)");
        SmartTyping custom=new SmartTyping("cpp");custom.options.indent=2;custom.options.tab=8;custom.options.continuation=6;
        equal("custom indent 2",type(custom,"  {|}","\n","\n"),"  {\n    |\n  }");
        equal("custom continuation 6",type(custom,"call(|)","\n","\n"),"call(\n      |\n)");
        SmartTyping tabs=new SmartTyping("cpp");tabs.options.indent=4;tabs.options.tab=4;tabs.options.tabs=true;
        equal("tabs follow style",type(tabs,"\t{|}","\n","\n"),"\t{\n\t\t|\n\t}");
        equal("CRLF preserved",type(new SmartTyping("cpp"),"{|}","\r\n","\r\n"),"{\r\n    |\r\n}");
        equal("CMake comment literal",type(new SmartTyping("cmake"),"# |","(","\n"),"# (|");
        equal("CMake bracket literal",type(new SmartTyping("cmake"),"set(x [=[hello|]=])","{","\n"),"set(x [=[hello{|]=])");
        SmartTyping cached=new SmartTyping("cpp");cached.context("/* comment\n still comment\n",23);cached.changed(0);
        equal("cache invalidation after removed comment",type(cached,"int x;\ncall(|)",")","\n"),"int x;\ncall()|");
        type("Documentation comment Enter","    /**| */","\n","    /**\n     * |\n     */");
        type("Multiline block comment Enter","/* text\n * more|","\n","/* text\n * more\n * |");
        type("Continued slash comment remains literal","// comment\\\n|","{","// comment\\\n{|");
        CharSequence guarded=new CharSequence(){public int length(){return 1000000;}public char charAt(int i){if(i==500000)return 'x';if(i==499999)return 'x';throw new AssertionError("Ordinary input scanned source at "+i);}public CharSequence subSequence(int a,int b){throw new AssertionError("Scanned source");}};
        equal("Ordinary letters bypass context analysis",new SmartTyping("cpp").typed(guarded,500000,500000,"a","\n")==null,true);
        equal("Ordinary Backspace bypasses context analysis",new SmartTyping("cpp").backspace(guarded,500000)==null,true);
        System.out.println(checks+" smart typing scenarios passed");
    }
}
