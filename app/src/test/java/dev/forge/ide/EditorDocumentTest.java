package dev.forge.ide;

import io.github.rosemoe.sora.text.*;
import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

/** Real Sora Content and UndoManager; these checks do not emulate Android IME or rendering. */
public class EditorDocumentTest {
    static final class Views {
        final EditorDocument doc=new EditorDocument("");final List<Content> views=new ArrayList<>();boolean applying;
        Content add(){Content c=doc.open(!views.isEmpty());views.add(c);c.addContentListener(new ContentListener(){
            public void beforeReplace(Content c){}
            public void afterInsert(Content c,int line,int col,int endLine,int endCol,CharSequence text){if(applying)return;int start=c.getIndexer().getCharIndex(line,col);applying=true;try{doc.mirror(c,views,start,start,text.toString());}finally{applying=false;}}
            public void afterDelete(Content c,int line,int col,int endLine,int endCol,CharSequence text){if(applying)return;int start=c.getIndexer().getCharIndex(line,col);applying=true;try{doc.mirror(c,views,start,start+text.length(),"");}finally{applying=false;}}
        });return c;}
        void edit(java.util.function.Consumer<Content> action){applying=true;try{doc.edit(views,action);}finally{applying=false;}}
        void same(String expected){assertEquals(expected,doc.content.toString());for(Content c:views)assertEquals(expected,c.toString());}
    }
    @Test public void tabReopenRetainsUndo(){EditorDocument d=new EditorDocument("abc");d.content.insert(0,3,"d");assertSame(d.content,d.open(false));d.open(false).undo();assertEquals("abc",d.content.toString());d.content.redo();assertEquals("abcd",d.content.toString());}
    @Test public void splitViewsHaveIndependentCursors(){Views v=new Views();Content a=v.add(),b=v.add();a.insert(0,0,"abc");a.getCursor().set(0,1);b.getCursor().set(0,3);assertNotSame(a.getCursor(),b.getCursor());assertEquals(1,a.getCursor().getLeft());assertEquals(3,b.getCursor().getLeft());assertSame(a.getUndoManager(),b.getUndoManager());}
    @Test public void splitUndoFromEitherViewRecordsOnce(){Views v=new Views();Content a=v.add(),b=v.add();b.insert(0,0,"hello");v.same("hello");a.undo();v.same("");assertFalse(a.canUndo());b.redo();v.same("hello");}
    @Test public void replaceAndUndoFromSecondView(){Views v=new Views();Content a=v.add(),b=v.add();v.edit(c->c.insert(0,0,"alpha beta"));b.replace(0,6,0,10,"gamma");v.same("alpha gamma");a.undo();v.same("alpha beta");b.redo();v.same("alpha gamma");}
    @Test public void formatterBatchIsOneUndo(){Views v=new Views();Content a=v.add(),b=v.add();v.edit(c->c.insert(0,0,"x+y"));v.edit(c->{c.insert(0,2," ");c.insert(0,1," ");});v.same("x + y");b.undo();v.same("x+y");a.redo();v.same("x + y");}
    @Test public void offlineCanonicalStaysCurrent(){Views v=new Views();Content a=v.add(),b=v.add();v.views.remove(a);b.insert(0,0,"retained\ntext");assertEquals("retained\ntext",v.doc.open(false).toString());b.undo();assertEquals("",v.doc.content.toString());}
    @Test public void unicodeOffsetsStayInSync(){Views v=new Views();Content a=v.add(),b=v.add();a.insert(0,0,"🙂 Привет\r\nnext");b.replace(0,3,0,9,"мир");v.same("🙂 мир\r\nnext");a.undo();v.same("🙂 Привет\r\nnext");}
    @Test public void multipleViewsDoNotMultiplyUndo(){Views v=new Views();Content a=v.add();v.add();Content c=v.add();c.beginBatchEdit();c.insert(0,0,"{");c.insert(0,1,"}");c.endBatchEdit();v.same("{}");a.undo();v.same("");assertFalse(c.canUndo());}
}
