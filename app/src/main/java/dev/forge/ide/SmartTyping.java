package dev.forge.ide;

import java.util.*;

/** Small synchronous typing decisions. No compiler process and no WebView round trip. */
final class SmartTyping {
    static final class Options {
        int indent=4,tab=4,continuation=4;boolean tabs;
        String whitespace(int columns){int n=Math.max(0,columns);return tabs?repeat('\t',n/tab)+repeat(' ',n%tab):repeat(' ',n);}
    }
    static final class Edit {
        final int start,end,caret,anchor,blockStart,blockEnd;final String text;
        Edit(int a,int b,String s,int caret){this(a,b,s,caret,caret,-1,-1);}
        Edit(int a,int b,String s,int caret,int anchor,int blockStart,int blockEnd){start=a;end=b;text=s;this.caret=caret;this.anchor=anchor;this.blockStart=blockStart;this.blockEnd=blockEnd;}
    }
    static final class Bracket {final char ch;final int index;final Bracket parent;Bracket(char c,int i,Bracket p){ch=c;index=i;parent=p;}}
    static final class State {
        int mode;char quote;boolean escaped;String terminator;int literalStart;Bracket stack;
        State copy(){State s=new State();s.mode=mode;s.quote=quote;s.escaped=escaped;s.terminator=terminator;s.literalStart=literalStart;s.stack=stack;return s;}
    }
    static final int CODE=0,LINE_COMMENT=1,BLOCK_COMMENT=2,QUOTE=3,RAW=4,HEADER=5;
    static String repeat(char c,int count){char[] chars=new char[Math.max(0,count)];Arrays.fill(chars,c);return new String(chars);}
    boolean enabled=true;
    final String kind;final Options options=new Options();final TreeMap<Integer,State> lines=new TreeMap<>();
    SmartTyping(String kind){this.kind=kind;lines.put(0,new State());}
    boolean cpp(){return kind.equals("c")||kind.equals("cpp");}
    boolean supported(){return enabled&&(cpp()||kind.equals("cmake")||kind.equals("yaml"));}
    void changed(int start){lines.tailMap(Math.max(1,start),true).clear();if(start==0){lines.clear();lines.put(0,new State());}}
    static boolean at(CharSequence s,int i,String token,int limit){if(i<0||i+token.length()>limit)return false;for(int n=0;n<token.length();n++)if(s.charAt(i+n)!=token.charAt(n))return false;return true;}
    static char closing(char c){return c=='('?')':c=='['?']':c=='{'?'}':c=='<'?'>':c;}
    static int lineStart(CharSequence s,int p){while(p>0&&s.charAt(p-1)!='\n'&&s.charAt(p-1)!='\r')p--;return p;}
    int indentOf(CharSequence s,int p){int n=0;for(int i=lineStart(s,p);i<s.length();i++){char c=s.charAt(i);if(c==' ')n++;else if(c=='\t')n+=options.tab-n%options.tab;else break;}return n;}
    static boolean blank(CharSequence s,int a,int b){for(int i=a;i<b;i++)if(s.charAt(i)!=' '&&s.charAt(i)!='\t')return false;return true;}
    static boolean numericQuote(CharSequence s,int p){int i=p-1;while(i>=0&&(Character.isLetterOrDigit(s.charAt(i))||s.charAt(i)=='\''))i--;return i+1<p&&Character.isDigit(s.charAt(i+1));}
    boolean includeBefore(CharSequence s,int p){return cpp()&&s.subSequence(lineStart(s,p),p).toString().matches("\\s*#\\s*(?:include|include_next)\\s*");}
    State context(CharSequence s,int limit){
        var entry=lines.floorEntry(limit);State state=entry.getValue().copy();int i=entry.getKey();
        while(i<limit){char c=s.charAt(i),next=i+1<limit?s.charAt(i+1):0;
            if(state.mode==LINE_COMMENT){if((c=='\n'||c=='\r')&&!(cpp()&&(i>0&&s.charAt(i-1)=='\\'||i>1&&s.charAt(i-1)=='\r'&&s.charAt(i-2)=='\\')))state.mode=CODE;}
            else if(state.mode==BLOCK_COMMENT){if(c=='*'&&next=='/'){state.mode=CODE;i++;}}
            else if(state.mode==RAW){if(at(s,i,state.terminator,limit)){i+=state.terminator.length()-1;state.mode=CODE;}}
            else if(state.mode==HEADER){if(c=='>')state.mode=CODE;else if(c=='\n')state.mode=CODE;}
            else if(state.mode==QUOTE){
                if(state.escaped)state.escaped=false;
                else if(c=='\\'&&!(kind.equals("yaml")&&state.quote=='\''))state.escaped=true;
                else if(c==state.quote){if(kind.equals("yaml")&&c=='\''&&next=='\'')i++;else state.mode=CODE;}
                else if(c=='\n'&&cpp())state.mode=CODE;
            }else{
                if(c=='/'&&next=='/'&&cpp()){state.mode=LINE_COMMENT;i++;}
                else if(c=='/'&&next=='*'&&cpp()){state.mode=BLOCK_COMMENT;state.literalStart=i;i++;}
                else if(c=='#'&&!cpp()){
                    String end=kind.equals("cmake")?bracketLiteral(s,i+1,limit):null;
                    if(end!=null){state.mode=RAW;state.terminator=end;i+=end.length();}else state.mode=LINE_COMMENT;
                }else if(c=='['&&kind.equals("cmake")&&bracketLiteral(s,i,limit)!=null){state.mode=RAW;state.terminator=bracketLiteral(s,i,limit);i+=state.terminator.length()-1;}
                else if(c=='R'&&next=='"'&&cpp()){
                    int end=i+2;while(end<limit&&end-i<=18&&s.charAt(end)!='('&&s.charAt(end)!='\n'&&s.charAt(end)!=' ')end++;
                    if(end<limit&&s.charAt(end)=='('){state.mode=RAW;state.terminator=")"+s.subSequence(i+2,end)+"\"";state.literalStart=i;i=end;}
                }else if(c=='<'&&includeBefore(s,i)){state.mode=HEADER;state.literalStart=i;}
                else if((c=='"'||c=='\'')&&!(c=='\''&&cpp()&&numericQuote(s,i))){state.mode=QUOTE;state.quote=c;state.literalStart=i;state.escaped=false;}
                else if(c=='('||c=='['||c=='{')state.stack=new Bracket(c,i,state.stack);
                else if(c==')'||c==']'||c=='}'){if(state.stack!=null&&closing(state.stack.ch)==c)state.stack=state.stack.parent;else state.stack=null;}
            }
            if(c=='\n')lines.put(i+1,state.copy());i++;
        }
        return state;
    }
    static String bracketLiteral(CharSequence s,int p,int limit){if(p>=limit||s.charAt(p)!='[')return null;int i=p+1;while(i<limit&&s.charAt(i)=='='&&i-p<20)i++;return i<limit&&s.charAt(i)=='['?"]"+s.subSequence(p+1,i)+"]":null;}
    Edit typed(CharSequence s,int left,int right,String input,String newline){
        if(!supported()||input.length()!=1&& !input.equals("\r\n"))return null;
        char c=input.charAt(0),next=left<s.length()?s.charAt(left):0;
        if("([{<)]}>\"'\n\r".indexOf(c)<0)return null;
        State state=context(s,left);
        if(c=='\n'||input.equals("\r\n"))return enter(s,left,right,state,newline);
        if(left!=right){
            if(state.mode==CODE&&("([{\"'".indexOf(c)>=0)){String text=c+s.subSequence(left,right).toString()+closing(c);return new Edit(left,right,text,left+text.length()-1,left+1,-1,-1);}return null;
        }
        if(c=='"'||c=='\''){
            if(state.mode==QUOTE&&state.quote==c&&!state.escaped&&next==c)return new Edit(left,left,"",left+1);
            if(state.mode!=CODE||c=='\''&&cpp()&&numericQuote(s,left))return null;
            char previous=left>0?s.charAt(left-1):0;
            boolean prefix=cpp()&&s.subSequence(lineStart(s,left),left).toString().matches(".*(?:^|[^A-Za-z_0-9])(?:u8|u|U|L)$");
            if(Character.isLetterOrDigit(previous)&&!prefix||previous=='_'||previous=='\\')return null;
            if(next!=0&&!Character.isWhitespace(next)&&"),;]}:".indexOf(next)<0)return null;
            return new Edit(left,left,""+c+c,left+1);
        }
        if(state.mode==HEADER&&c=='>'&&next=='>')return new Edit(left,left,"",left+1);
        if(state.mode!=CODE)return null;
        if(")]}".indexOf(c)>=0){
            Bracket open=state.stack;if(open==null||closing(open.ch)!=c)return null;
            int start=left;String insertion=String.valueOf(c);boolean skip=next==c;
            if(c=='}'&&blank(s,lineStart(s,left),left)){start=lineStart(s,left);insertion=options.whitespace(indentOf(s,open.index))+c;}
            int end=skip?left+1:left,caret=start+insertion.length();
            if(c!='}'&&skip)return new Edit(left,left,"",left+1);
            return new Edit(start,end,insertion,caret,caret,c=='}'?open.index:-1,c=='}'?caret-1:-1);
        }
        if(c=='('||c=='['||c=='{'||c=='<'&&includeBefore(s,left)){
            char close=closing(c);
            if(next!=0&&!Character.isWhitespace(next)&&"),;]}:".indexOf(next)<0)return null;
            // An orphan closer already ahead can become the mate of the newly typed opener.
            if(next==close&&(state.stack==null||state.stack.ch!=c))return new Edit(left,left,String.valueOf(c),left+1);
            return new Edit(left,left,""+c+close,left+1);
        }
        return null;
    }
    Edit enter(CharSequence s,int left,int right,State state,String nl){
        int base=indentOf(s,left),start=left,end=right;
        if(state.mode==BLOCK_COMMENT&&cpp()){
            String indent=options.whitespace(indentOf(s,state.literalStart))+" ";String body=nl+indent+"* ";int next=right;while(next<s.length()&&(s.charAt(next)==' '||s.charAt(next)=='\t'))next++;
            String tail=at(s,next,"*/",s.length())?nl+indent:"";return new Edit(left,tail.isEmpty()?right:next,body+tail,left+body.length());
        }
        if(state.mode==QUOTE||state.mode==RAW||state.mode==HEADER)return new Edit(start,end,nl+options.whitespace(base),start+nl.length()+options.whitespace(base).length());
        int a=left-1;while(a>=lineStart(s,left)&&(s.charAt(a)==' '||s.charAt(a)=='\t'))a--;
        int b=right;while(b<s.length()&&(s.charAt(b)==' '||s.charAt(b)=='\t'))b++;
        boolean opener=a>=0&&"({[".indexOf(s.charAt(a))>=0&&state.mode==CODE;
        if(opener){
            start=a+1;
            int extra=s.charAt(a)=='{'?options.indent:options.continuation;String inner=options.whitespace(base+extra);
            if(b<s.length()&&s.charAt(b)==closing(s.charAt(a))){String tail=nl+options.whitespace(base);String insert=nl+inner+tail;return new Edit(start,b,insert,start+nl.length()+inner.length());}
            return new Edit(start,right,nl+inner,start+nl.length()+inner.length());
        }
        if(state.mode==CODE&&state.stack!=null){Bracket open=state.stack;if(open.ch=='('||open.ch=='[')base=indentOf(s,open.index)+options.continuation;else base=Math.max(base,indentOf(s,open.index)+options.indent);}
        if(b<s.length()&&s.charAt(b)=='}'&&state.mode==CODE&&state.stack!=null&&state.stack.ch=='{')base=indentOf(s,state.stack.index);
        String insert=nl+options.whitespace(base);return new Edit(left,right,insert,left+insert.length());
    }
    Edit backspace(CharSequence s,int cursor){
        if(!supported()||cursor==0)return null;char a=s.charAt(cursor-1),b=cursor<s.length()?s.charAt(cursor):0;State state="([{\"'".indexOf(a)>=0&&closing(a)==b?context(s,cursor-1):null;
        if(state!=null&&state.mode==CODE)return new Edit(cursor-1,cursor+1,"",cursor-1);
        if(a!=' '&&a!='\t')return null;
        int start=lineStart(s,cursor);if(blank(s,start,cursor)){int actual=0;for(int i=start;i<cursor;i++)actual+=s.charAt(i)=='\t'?options.tab-actual%options.tab:1;int wanted=actual==0?0:(actual-1)/options.indent*options.indent;String text=options.whitespace(wanted);return actual>0?new Edit(start,cursor,text,start+text.length()):null;}
        return null;
    }
}
