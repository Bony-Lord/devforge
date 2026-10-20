package dev.forge.ide;

import java.util.*;

/** Whitespace guides are local and do not wait for clangd or a complete syntax tree. */
final class IndentGuides {
    static final class Guide {final int first,last,column;final boolean toBottom;Guide(int first,int last,int column,boolean bottom){this.first=first;this.last=last;this.column=column;toBottom=bottom;}}
    static List<Guide> scan(CharSequence text,int tabWidth){
        tabWidth=Math.max(1,tabWidth);List<Guide> result=new ArrayList<>();Deque<int[]> stack=new ArrayDeque<>();int line=0,previousLine=0,previousIndent=0;
        for(int start=0;start<=text.length();line++){
            int end=start;while(end<text.length()&&text.charAt(end)!='\n'&&text.charAt(end)!='\r')end++;
            int at=start,indent=0;while(at<end){char c=text.charAt(at);if(c==' ')indent++;else if(c=='\t')indent+=tabWidth-indent%tabWidth;else break;at++;}
            if(at<end){
                while(!stack.isEmpty()&&indent<=stack.peek()[1]){int[] open=stack.pop();if(line>open[0])result.add(new Guide(open[0],line,open[1],false));}
                if(indent>previousIndent)stack.push(new int[]{previousLine,previousIndent});
                previousLine=line;previousIndent=indent;
            }
            if(end==text.length())break;start=end+1;if(text.charAt(end)=='\r'&&start<text.length()&&text.charAt(start)=='\n')start++;
        }
        while(!stack.isEmpty()){int[] open=stack.pop();if(line>open[0])result.add(new Guide(open[0],line,open[1],true));}return result;
    }
}
