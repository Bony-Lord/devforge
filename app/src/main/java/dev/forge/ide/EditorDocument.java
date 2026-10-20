package dev.forge.ide;

import io.github.rosemoe.sora.text.Content;
import io.github.rosemoe.sora.text.UndoManager;
import java.util.*;
import java.util.function.Consumer;

/** Retains text and undo when a tab changes, with independent selection in each split view. */
final class EditorDocument {
    final Content content;
    private final UndoManager silentHistory;
    EditorDocument(String text){content=new Content(text);Content silent=new Content();silent.setUndoEnabled(false);silentHistory=silent.getUndoManager();}
    Content open(boolean alreadyVisible){if(!alreadyVisible)return content;Content copy=new Content(content);copy.setUndoManager(content.getUndoManager());return copy;}
    void mirror(Content origin,Collection<Content> views,int start,int end,String text){
        Set<Content> copies=copies(views);copies.remove(origin);
        for(Content copy:copies)silent(copy,c->replace(c,start,end,text));
    }
    void edit(Collection<Content> views,Consumer<Content> mutation){
        content.beginBatchEdit();try{mutation.accept(content);}finally{content.endBatchEdit();}
        Set<Content> copies=copies(views);copies.remove(content);for(Content copy:copies)silent(copy,mutation);
    }
    private Set<Content> copies(Collection<Content> views){Set<Content> result=Collections.newSetFromMap(new IdentityHashMap<>());result.add(content);result.addAll(views);return result;}
    private void silent(Content copy,Consumer<Content> mutation){UndoManager history=copy.getUndoManager();copy.setUndoManager(silentHistory);copy.beginBatchEdit();try{mutation.accept(copy);}finally{copy.endBatchEdit();copy.setUndoManager(history);}}
    static void replace(Content content,int start,int end,String text){var a=content.getIndexer().getCharPosition(start);var b=content.getIndexer().getCharPosition(end);content.replace(a.line,a.column,b.line,b.column,text);}
}
