package dev.forge.ide;

import android.content.Context;
import android.os.SystemClock;
import android.view.inputmethod.InputMethodManager;
import org.json.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Switches real application tabs; run only against the runner's input-check-* fixture. */
final class TabStateChecks {
    final NativeInputInstrumentation host;
    TabStateChecks(NativeInputInstrumentation host){this.host=host;}
    void js(String expression)throws Exception{CountDownLatch done=new CountDownLatch(1);host.ui(()->{host.activity.web.evaluateJavascript(expression,result->done.countDown());return null;});if(!done.await(10,TimeUnit.SECONDS))throw new IllegalStateException("WebView did not respond");}
    void open(String path)throws Exception{
        js("forge.openFile("+JSONObject.quote(path)+").catch(console.error)");
        for(int n=0;n<400;n++){if(host.ui(()->host.activity.nativeEditors.active!=null&&host.activity.nativeEditors.active.buffer!=null&&host.activity.nativeEditors.active.buffer.path.equals(path)))return;SystemClock.sleep(10);}
        throw new IllegalStateException("Tab did not open: "+path);
    }
    int foreground(String word)throws Exception{return host.ui(()->{var e=host.activity.nativeEditors.active.editor;int offset=e.getText().toString().indexOf(word);var p=e.getText().getIndexer().getCharPosition(offset);var spans=e.getStyles().spans.read();int color=0;for(var span:spans.getSpansOnLine(p.line)){if(span.getColumn()>p.column)break;color=e.getColorScheme().getColor(span.getForegroundColorId());}return color&0xffffff;});}
    void run()throws Exception{
        var activity=host.activity;String cpp=host.ui(()->activity.nativeEditors.active.buffer.path),cmake=host.ui(()->new java.io.File(activity.engine.project(activity.engine.currentProject),"CMakeLists.txt").getAbsolutePath());
        host.ui(()->{((InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(host.editor.getWindowToken(),0);return null;});
        String text="static int unused_tab_function() { return 5; }\nint main() { auto unused_tab_variable = 1; return 0; }\n"+String.join("\n",java.util.Collections.nCopies(80,"// tab state fixture"))+"\n";
        host.ui(()->{var c=host.editor.getText();c.replace(0,0,c.getLineCount()-1,c.getColumnCount(c.getLineCount()-1),text);return null;});
        boolean ready=false;for(int n=0;n<160;n++){ready=host.ui(()->activity.nativeEditors.active.language.unusedStyles.length()>=2&&activity.nativeEditors.active.language.diagnostics.size()>=2);if(ready)break;SystemClock.sleep(50);}
        if(!ready)throw new IllegalStateException("Real clangd unused warnings did not arrive");
        SystemClock.sleep(200);host.check("Unused spans exist before switching tabs",foreground("unused_tab_function")==0x6f737a&&foreground("unused_tab_variable")==0x6f737a,"native Sora foreground #6F737A");
        host.ui(()->{host.editor.setSelection(45,2);host.editor.getScroller().startScroll(0,300,0,0,0);host.editor.getScroller().abortAnimation();host.editor.getText().insert(45,2," saved-undo ");return null;});
        for(int n=0;n<160;n++){if(host.ui(()->{var b=activity.nativeEditors.active.buffer;return b.analysisRevision==b.revision&&b.analysis.optJSONArray("unusedStyles")!=null&&b.analysis.optJSONArray("unusedStyles").length()>=2&&b.analysis.has("styles")&&b.analysis.has("hints");}))break;SystemClock.sleep(50);}
        JSONObject cached=host.ui(()->new JSONObject(activity.nativeEditors.active.buffer.analysis.toString()));
        int scroll=host.ui(()->host.editor.getOffsetY());
        open(cmake);host.check("CMake does not inherit C++ diagnostic regions",host.ui(()->activity.nativeEditors.active.language.diagnostics.stream().noneMatch(d->d.detail!=null&&String.valueOf(d.detail.getBriefMessage()).contains("unused_tab"))),"separate file analysis");
        open(cpp);
        host.check("Returning to C++ restores cached unused ranges and warnings",host.ui(()->activity.nativeEditors.active.language.unusedStyles.length()>=2&&activity.nativeEditors.active.language.diagnostics.size()>=2),"cached diagnostics, not an edit-triggered refresh");
        host.check("Semantic styles and native inlay container survive switching",host.ui(()->{var p=activity.nativeEditors.active;return p.language.styles.length()==cached.optJSONArray("styles").length()&&p.editor.getInlayHints()!=null;}),"semantic ranges and native InlayHintsContainer restored");
        SystemClock.sleep(180);host.check("Gray unused spans survive the C++ to CMake round trip",foreground("unused_tab_function")==0x6f737a&&foreground("unused_tab_variable")==0x6f737a,"native foreground #6F737A after returning");
        host.check("Caret and scroll survive switching files",host.ui(()->host.editor.getCursor().getRightLine()==45&&Math.abs(host.editor.getOffsetY()-scroll)<3),host.ui(()->new JSONObject().put("line",host.editor.getCursor().getRightLine()).put("scroll",host.editor.getOffsetY()).put("expectedScroll",scroll)));
        host.ui(()->{host.editor.undo();return null;});host.check("Undo history survives switching files",host.ui(()->!host.editor.getText().toString().contains(" saved-undo ")),"one undo after reopening removes the earlier edit");
        host.ui(()->{var c=host.editor.getText();c.replace(0,0,c.getLineCount()-1,c.getColumnCount(c.getLineCount()-1),"int main() { missing_tab_probe(); }\n");return null;});
        boolean errors=false;for(int n=0;n<160;n++){errors=host.ui(()->activity.nativeEditors.active.language.diagnostics.stream().anyMatch(d->d.detail!=null&&String.valueOf(d.detail.getBriefMessage()).contains("missing_tab_probe")));if(errors)break;SystemClock.sleep(50);}if(!errors)throw new IllegalStateException("Real clangd error did not arrive");
        open(cmake);open(cpp);host.check("Error diagnostics survive a separate CMake round trip",host.ui(()->activity.nativeEditors.active.language.diagnostics.stream().anyMatch(d->d.detail!=null&&String.valueOf(d.detail.getBriefMessage()).contains("missing_tab_probe"))),"native diagnostic regions after reopening");
        host.check("Old unused ranges are cleared after source changes",host.ui(()->activity.nativeEditors.active.language.unusedStyles.length()==0),"no stale gray ranges in the error fixture");
    }
}
