package dev.forge.ide;

import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import io.github.rosemoe.sora.widget.CodeEditor;
import io.github.rosemoe.sora.widget.component.EditorAutoCompletion;
import io.github.rosemoe.sora.widget.schemes.EditorColorScheme;
import io.github.rosemoe.sora.event.*;
import io.github.rosemoe.sora.lang.EmptyLanguage;
import io.github.rosemoe.sora.lang.analysis.*;
import io.github.rosemoe.sora.lang.completion.*;
import io.github.rosemoe.sora.lang.completion.snippet.parser.CodeSnippetParser;
import io.github.rosemoe.sora.lang.diagnostic.*;
import io.github.rosemoe.sora.lang.styling.*;
import io.github.rosemoe.sora.lang.styling.inlayHint.*;
import io.github.rosemoe.sora.graphics.inlayHint.TextInlayHintRenderer;
import io.github.rosemoe.sora.text.*;

/** Native input and rendering. WebView receives batched edits, never drives an IME session. */
final class NativeEditorHost {
    final MainActivity app;
    final Map<String,Pane> panes=new LinkedHashMap<>();
    final Map<String,Buffer> buffers=new ConcurrentHashMap<>();
    final Map<String,CompletableFuture<JSONArray>> completions=new ConcurrentHashMap<>();
    Pane active;
    JSONObject settings=new JSONObject();
    HorizontalScrollView accessory;
    boolean visible=true,applying=false;
    JSONArray occlusions=new JSONArray();
    final java.util.concurrent.atomic.AtomicLong requestSequence=new java.util.concurrent.atomic.AtomicLong();
    final int UNUSED=512,TYPE=513,STRING=514,NUMBER=515;
    NativeEditorHost(MainActivity app){this.app=app;createAccessory();}
    static final class RevisionStyles extends Styles {
        final Content owner;final long revision;final Object language;
        RevisionStyles(Spans spans,Content owner,long revision,Object language){super(spans);this.owner=owner;this.revision=revision;this.language=language;}
    }
    static final class StudioCodeEditor extends CodeEditor {
        @Override protected io.github.rosemoe.sora.widget.EditorRenderer onCreateRenderer(){return new io.github.rosemoe.sora.widget.EditorRenderer(this){@Override public boolean hasSideHintIcons(){return true;}};}
        List<RectF> occlusions=Collections.emptyList(),touchOcclusions=Collections.emptyList();Runnable dismissPopover;
        @Override public void draw(Canvas canvas){int save=canvas.save();for(RectF rect:occlusions)canvas.clipOutRect(rect);super.draw(canvas);canvas.restoreToCount(save);}
        @Override public boolean dispatchTouchEvent(MotionEvent event){if(event.getActionMasked()==MotionEvent.ACTION_DOWN){for(RectF rect:touchOcclusions)if(rect.contains(event.getX(),event.getY()))return false;if(dismissPopover!=null)dismissPopover.run();}return super.dispatchTouchEvent(event);}
        InputConnection currentInput;
        SmartTyping typing;boolean pasting;java.util.function.Consumer<SmartTyping.Edit> blockCompleted;
        java.util.function.Consumer<Float> fontChanged;boolean configuringFont;
        StudioCodeEditor(Context context){super(context);
            // Sora still asks its animator for geometry before mutations even when animation is off.
            // A selected range can be edited before the first draw; do not consult the renderer then.
            setCursorAnimator(new io.github.rosemoe.sora.widget.style.CursorAnimator(){public void markStartPos(){}public void markEndPos(){}public void start(){}public void cancel(){}public boolean isRunning(){return false;}public float animatedX(){return 0;}public float animatedY(){return 0;}public float animatedLineHeight(){return 0;}public float animatedLineBottom(){return 0;}});
        }
        @Override public boolean onKeyDown(int key,KeyEvent event){if(key==KeyEvent.KEYCODE_SPACE&&event.isCtrlPressed()&&!event.isShiftPressed()&&!event.isAltPressed())return false;return super.onKeyDown(key,event);}
        @Override public InputConnection onCreateInputConnection(EditorInfo info){InputConnection base=super.onCreateInputConnection(info);currentInput=base==null?null:Build.VERSION.SDK_INT>=33?new StudioInputConnection33(base):new StudioInputConnection(base);info.imeOptions|=EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;return currentInput;}
        class StudioInputConnection extends InputConnectionWrapper {
            StudioInputConnection(InputConnection base){super(base,false);}
            @Override public boolean commitText(CharSequence text,int position){
                if(text!=null&&(text.toString().equals("\n")||text.toString().equals("\r\n"))){
                    if(currentInput!=this||!isEditable())return false;
                    finishComposingText();StudioCodeEditor.this.commitText(getLineSeparator().getContent(),true,true);notifyIMEExternalCursorChange();return true;
                }
                return super.commitText(text,position);
            }
        }
        @android.annotation.TargetApi(33) final class StudioInputConnection33 extends StudioInputConnection {
            StudioInputConnection33(InputConnection base){super(base);}
            @Override public boolean commitText(CharSequence text,int position,android.view.inputmethod.TextAttribute attributes){return commitText(text,position);}
        }
        @Override public void setStyles(Styles styles){
            // Sora checks the analyzer before posting its result, but a tab or edit may change
            // before that UI callback runs. Never attach another document's or revision's spans.
            if(styles instanceof RevisionStyles){RevisionStyles value=(RevisionStyles)styles;if(value.language!=getEditorLanguage())return;if(value.owner!=getText()||value.revision!=getText().getDocumentVersion()||value.spans.getLineCount()!=getText().getLineCount()){getEditorLanguage().getAnalyzeManager().rerun();return;}}
            super.setStyles(styles);
        }
        @Override protected void setTextSizePxDirect(float size){super.setTextSizePxDirect(size);if(!configuringFont&&fontChanged!=null)fontChanged.accept(size);}
        @Override public void pasteText(CharSequence text){
            // A keyboard may mark the surrounding word as composing after a cursor jump.
            // Clipboard insertion must replace the selection, not that surrounding word.
            if(currentInput!=null)currentInput.finishComposingText();
            pasting=true;try{super.pasteText(normalizeLineBreaks(text));}finally{pasting=false;}
        }
        CharSequence normalizeLineBreaks(CharSequence text){String value=text.toString();if(value.indexOf('\r')<0&&value.indexOf('\n')<0)return text;return value.replace("\r\n","\n").replace('\r','\n').replace("\n",getLineSeparator().getContent());}
        @Override public void commitText(CharSequence text,boolean autoIndent,boolean pairs){
            text=normalizeLineBreaks(text);
            if(typing!=null&&isEditable()&&!pasting&&pairs&&autoIndent){var c=getCursor();SmartTyping.Edit edit=typing.typed(getText(),c.getLeft(),c.getRight(),text.toString(),getLineSeparator().getContent());if(edit!=null){smartEdit(edit);return;}}
            super.commitText(text,pasting?false:autoIndent,typing==null&&pairs);
        }
        void smartEdit(SmartTyping.Edit edit){
            Content text=getText();if(edit.start!=edit.end||!edit.text.isEmpty()){text.beginBatchEdit();try{replace(text,edit.start,edit.end,edit.text);}finally{text.endBatchEdit();}}
            var a=text.getIndexer().getCharPosition(edit.anchor);var b=text.getIndexer().getCharPosition(edit.caret);
            if(edit.anchor!=edit.caret)setSelectionRegion(a.line,a.column,b.line,b.column);else setSelection(b.line,b.column);
            if(edit.blockStart>=0&&blockCompleted!=null)blockCompleted.accept(edit);
        }
        @Override public void deleteText(){if(typing!=null&&!getCursor().isSelected()){var edit=typing.backspace(getText(),getCursor().getLeft());if(edit!=null){smartEdit(edit);return;}}super.deleteText();}
        @Override public String createTabString(){if(typing==null)return super.createTabString();if(typing.options.tabs)return "\t";int columns=0;var c=getCursor();String line=getText().getLineString(c.getLeftLine());for(int i=0;i<c.getLeftColumn();i++)columns+=line.charAt(i)=='\t'?typing.options.tab-columns%typing.options.tab:1;return typing.options.whitespace(typing.options.indent-columns%typing.options.indent);}
        @Override public void indentLines(boolean onlyIfSelected){if(typing==null){super.indentLines(onlyIfSelected);return;}indentSmart(onlyIfSelected,false);}
        @Override public void unindentSelection(){if(typing==null){super.unindentSelection();return;}indentSmart(false,true);}
        void indentSmart(boolean onlySelected,boolean reverse){
            var c=getCursor();boolean selected=c.isSelected();if(onlySelected&&!selected)return;Content text=getText();int left=c.getLeft(),right=c.getRight(),first=c.getLeftLine(),last=c.getRightLine();if(selected&&c.getRightColumn()==0&&last>first)last--;
            text.beginBatchEdit();try{for(int line=last;line>=first;line--){String old=text.getLineString(line);int n=0;while(n<old.length()&&(old.charAt(n)==' '||old.charAt(n)=='\t'))n++;int columns=typing.indentOf(old,0),width=typing.options.indent,target=reverse?Math.max(0,(columns-1)/width*width):(columns/width+1)*width;String indent=typing.options.whitespace(target);int start=text.getIndexer().getCharIndex(line,0),end=start+n;replace(text,start,end,indent);left=mapOffset(left,start,end,indent.length());right=mapOffset(right,start,end,indent.length());}}finally{text.endBatchEdit();}
            var a=text.getIndexer().getCharPosition(left);var b=text.getIndexer().getCharPosition(right);if(selected)setSelectionRegion(a.line,a.column,b.line,b.column);else setSelection(a.line,a.column);notifyIMEExternalCursorChange();
        }
        static int mapOffset(int index,int a,int b,int size){return index<a?index:index<=b?a+size:index+size-(b-a);}
        void typingOptions(JSONObject options){if(typing==null||options==null)return;typing.options.indent=Math.max(1,Math.min(16,options.optInt("indent",4)));typing.options.tab=Math.max(1,Math.min(16,options.optInt("tab",4)));typing.options.continuation=Math.max(1,Math.min(32,options.optInt("continuation",4)));typing.options.tabs=options.optBoolean("tabs");int previousTab=getTabWidth();setTabWidth(typing.options.tab);if(previousTab!=typing.options.tab)getEditorLanguage().getAnalyzeManager().rerun();}
    }
    static JSONObject object(Object... pairs){JSONObject o=new JSONObject();try{for(int i=0;i<pairs.length;i+=2)o.put((String)pairs[i],pairs[i+1]);}catch(JSONException e){throw new IllegalStateException(e);}return o;}
    final class Buffer {
        String uri,path,text;volatile long revision;JSONArray pending=new JSONArray();boolean scheduled;
        long textRevision=0;final EditorDocument document;final Content content;JSONObject analysis=new JSONObject();long analysisRevision=-1;
        Buffer(JSONObject d){uri=d.optString("uri");path=d.optString("path");text=d.optString("text");document=new EditorDocument(text);content=document.content;}
    }
    static final class ViewState {int left,right,x,y;ViewState(CodeEditor e){left=e.getCursor().getLeft();right=e.getCursor().getRight();x=e.getOffsetX();y=e.getOffsetY();}}
    final class Pane {
        String id;CodeEditor editor;Buffer buffer;StudioLanguage language;boolean muted;
        final Map<String,ViewState> views=new HashMap<>();
        float x,y,w,h;String configured="";boolean viewportScheduled;
        Pane(String id){
            this.id=id;
            Configuration config=new Configuration(app.getResources().getConfiguration());config.setLocale(Locale.forLanguageTag(settings.optString("language","ru")));
            editor=new StudioCodeEditor(app.createConfigurationContext(config));
            editor.getProps().sideIconSizeFactor=.76f;
            ((StudioCodeEditor)editor).dismissPopover=()->app.event("editorDismissPopover",new JSONObject());
            ((StudioCodeEditor)editor).fontChanged=size->{float scale=app.web.getScale();if(scale>0)app.event("editorScale",object("id",id,"percent",Math.round(size/scale/settings.optDouble("fontSize",14)*100)));};
            editor.setTag("studio-editor-"+id);editor.setContentDescription("Code editor "+id);
            editor.setTypefaceText(Typeface.createFromAsset(app.getAssets(),"ui/fonts/JetBrainsMono-Regular.ttf"));
            // Some IMEs ignore NO_SUGGESTIONS on an ordinary text field. Visible-password
            // variation also suppresses autocorrection/capitalization, without hiding source.
            editor.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            // disallowSuggestions in Sora spoofs random selection offsets. Keep the full IME protocol.
            editor.getProps().disallowSuggestions=false;editor.getProps().allowFullscreen=false;
            editor.registerInlayHintRenderer(new TextInlayHintRenderer());
            editor.getProps().scrollAnimationDurationMs=0;editor.setCursorAnimationEnabled(false);
            editor.setScalable(true);
            editor.setVerticalExtraSpaceFactor(0.15f);editor.setTabWidth(4);
            editor.setOnFocusChangeListener((v,focused)->{if(focused){active=this;emitSelection(this);geometry();}});
            editor.subscribeEvent(ContentChangeEvent.class,(e,unsubscribe)->{var smart=((StudioCodeEditor)editor).typing;if(smart!=null)smart.changed(e.getChangeStart().index);changed(this,e);});
            ((StudioCodeEditor)editor).blockCompleted=edit->{if(buffer==null||!settings.optBoolean("smartFormatOnClose",true)||!Arrays.asList("c","cpp").contains(language.kind))return;flush(buffer);app.event("editorFormatOnType",object("id",id,"uri",buffer.uri,"revision",buffer.revision,"start",edit.blockStart,"end",edit.blockEnd+1));};
            editor.subscribeEvent(SelectionChangeEvent.class,(e,unsubscribe)->{if(!muted){active=this;emitSelection(this);reveal(this);}});
            editor.subscribeEvent(ScrollEvent.class,(e,unsubscribe)->{if(!viewportScheduled){viewportScheduled=true;app.ui.postDelayed(()->{viewportScheduled=false;if(buffer!=null)app.event("editorViewport",object("id",id,"uri",buffer.uri,"first",editor.getFirstVisibleLine(),"last",editor.getLastVisibleLine()));},80);}});
            editor.subscribeEvent(ClickEvent.class,(e,unsubscribe)->{active=this;if(e.getMotionRegion()==EditorMotionEvent.REGION_LINE_NUMBER||e.getMotionRegion()==EditorMotionEvent.REGION_SIDE_ICON)app.event("editorGutter",object("id",id,"uri",buffer==null?"":buffer.uri,"line",e.getLine()+1));});
            app.editorRoot.addView(editor,new FrameLayout.LayoutParams(1,1));configure(this);
        }
    }
    void changed(Pane pane,ContentChangeEvent event){
        if(applying||pane.muted||pane.buffer==null||event.getAction()==ContentChangeEvent.ACTION_SET_NEW_TEXT)return;
        Buffer b=pane.buffer;int start=event.getChangeStart().index;
        int end=event.getAction()==ContentChangeEvent.ACTION_DELETE?event.getChangeEnd().index:start;
        String text=event.getAction()==ContentChangeEvent.ACTION_INSERT?event.getChangedText().toString():"";
        // Do not read the entire document on each keystroke. Deltas are applied to the shadow off the input path.
        mapViews(b,start,end,text.length());b.revision++;b.pending.put(object("start",start,"end",end,"text",text));
        if(!b.scheduled){b.scheduled=true;app.ui.postDelayed(()->flush(b),32);}
        // Views use independent cursors and one undo history. Mirroring must not record an edit twice.
        applying=true;try{b.document.mirror(pane.editor.getText(),views(b),start,end,text);}finally{applying=false;}
    }
    void mapViews(Buffer b,int start,int end,int size){for(Pane p:panes.values()){ViewState v=p.views.get(b.uri);if(v!=null){v.left=StudioCodeEditor.mapOffset(v.left,start,end,size);v.right=StudioCodeEditor.mapOffset(v.right,start,end,size);}}}
    List<Content> views(Buffer b){List<Content> result=new ArrayList<>();for(Pane p:panes.values())if(p.buffer==b)result.add(p.editor.getText());return result;}
    void flush(Buffer b){
        if(b.pending.length()>0){app.event("editorChanges",object("uri",b.uri,"revision",b.revision,"changes",b.pending));b.pending=new JSONArray();}
        b.scheduled=false;
    }
    Pane source(Buffer b){for(Pane p:panes.values())if(p.buffer==b)return p;return null;}
    boolean currentRevision(String path,long revision){for(Buffer b:buffers.values())if(b.path.equals(path))return revision==b.revision;return true;}
    JSONObject snapshot(Buffer b){if(b.textRevision!=b.revision){b.text=b.content.toString();b.textRevision=b.revision;}flush(b);return object("uri",b.uri,"revision",b.revision,"text",b.text);}
    void emitSelection(Pane p){if(p.buffer==null)return;var c=p.editor.getCursor();app.event("editorSelection",object("id",p.id,"uri",p.buffer.uri,"revision",p.buffer.revision,"line",c.getRightLine()+1,"column",c.getRightColumn()+1,"startLine",c.getLeftLine()+1,"startColumn",c.getLeftColumn()+1,"focused",p.editor.hasFocus()));}
    Object handle(String op,JSONObject d)throws Exception{
        switch(op){
            case "editorReset":{for(Pane p:panes.values()){p.editor.release();app.editorRoot.removeView(p.editor);}panes.clear();buffers.clear();active=null;return true;}
            case "editorLayout":{
                occlusions=d.optJSONArray("occlusions");if(occlusions==null)occlusions=new JSONArray();
                visible=d.optBoolean("visible",true);JSONArray list=d.optJSONArray("panes");Set<String> present=new HashSet<>();
                settings=d.optJSONObject("settings")==null?settings:d.getJSONObject("settings");
                if(list!=null)for(int i=0;i<list.length();i++){JSONObject rect=list.getJSONObject(i);String id=rect.getString("id");present.add(id);Pane p=panes.get(id);if(p==null){p=new Pane(id);panes.put(id,p);}p.x=(float)rect.optDouble("x");p.y=(float)rect.optDouble("y");p.w=(float)rect.optDouble("width");p.h=(float)rect.optDouble("height");configure(p);}
                for(String id:new ArrayList<>(panes.keySet()))if(!present.contains(id)){Pane p=panes.remove(id);if(p.buffer!=null)flush(p.buffer);p.editor.release();app.editorRoot.removeView(p.editor);if(active==p)active=null;}
                geometry();return true;
            }
            case "editorOpen":{
                Pane p=panes.get(d.getString("id"));if(p==null)return false;
                if(p.buffer!=null){if(((StudioCodeEditor)p.editor).currentInput!=null)((StudioCodeEditor)p.editor).currentInput.finishComposingText();flush(p.buffer);p.views.put(p.buffer.uri,new ViewState(p.editor));}
                String uri=d.optString("uri");if(uri.isEmpty()){p.buffer=null;p.editor.setVisibility(View.GONE);return true;}
                Buffer b=buffers.get(uri);if(b==null){b=new Buffer(d);buffers.put(uri,b);}
                if(p.buffer!=b){StudioLanguage next=new StudioLanguage(p,d.optString("language"));p.muted=true;try{((StudioCodeEditor)p.editor).typing=next.typing;p.editor.setEditorLanguage(next);Pane previous=source(b);Content content=b.document.open(previous!=null);p.editor.setText(content);var separator=content.getLine(0).getLineSeparator();p.editor.setLineSeparator(separator.getLength()>0?separator:LineSeparator.LF);p.editor.setDiagnostics(new DiagnosticsContainer());p.language=next;p.buffer=b;if(b.analysisRevision==b.revision)next.analysis(b.analysis);ViewState v=p.views.get(uri);if(v==null&&previous!=null)v=new ViewState(previous.editor);if(v!=null){var a=content.getIndexer().getCharPosition(Math.min(v.left,content.length()));var z=content.getIndexer().getCharPosition(Math.min(v.right,content.length()));p.editor.setSelectionRegion(a.line,a.column,z.line,z.column);p.editor.getScroller().startScroll(v.x,v.y,0,0,0);p.editor.getScroller().abortAnimation();}}finally{p.muted=false;}}
                ((StudioCodeEditor)p.editor).typingOptions(d.optJSONObject("typing"));
                p.editor.setEditable(!d.optBoolean("readonly"));geometry();emitSelection(p);return snapshot(b);
            }
            case "editorSnapshot":{JSONArray result=new JSONArray();JSONObject known=d.optJSONObject("known");for(Buffer b:buffers.values())if(!d.has("uri")||d.optString("uri").equals(b.uri)){if(known!=null&&known.optLong(b.uri,-1)==b.revision)flush(b);else result.put(snapshot(b));}return result;}
            case "editorForget":{Buffer b=buffers.remove(d.optString("uri"));if(b!=null)for(Pane p:panes.values()){p.views.remove(b.uri);if(p.buffer==b){p.buffer=null;p.editor.setVisibility(View.GONE);}}return true;}
            case "editorEdits":{
                Buffer b=buffers.get(d.optString("uri"));if(b==null)return true;
                if(b.revision!=d.optLong("revision")){app.event("editorResync",snapshot(b));return false;}
                JSONArray edits=d.getJSONArray("edits");for(int i=0;i<edits.length();i++){JSONObject e=edits.getJSONObject(i);mapViews(b,e.getInt("start"),e.getInt("end"),e.getString("text").length());}applying=true;
                try{b.document.edit(views(b),c->{try{for(int i=0;i<edits.length();i++){JSONObject e=edits.getJSONObject(i);replace(c,e.getInt("start"),e.getInt("end"),e.getString("text"));}}catch(JSONException error){throw new IllegalArgumentException(error);}});for(Pane p:panes.values())if(p.buffer==b)p.editor.notifyIMEExternalCursorChange();}finally{applying=false;}
                b.revision++;snapshot(b);return b.revision;
            }
            case "editorSelection":{Pane p=panes.get(d.optString("id"));if(p==null||p.buffer==null)return false;int line=d.optInt("line",1)-1,col=d.optInt("column",1)-1;Content c=p.editor.getText();line=Math.max(0,Math.min(c.getLineCount()-1,line));col=Math.max(0,Math.min(c.getColumnCount(line),col));if(d.has("endLine")){int el=Math.max(0,Math.min(c.getLineCount()-1,d.getInt("endLine")-1));p.editor.setSelectionRegion(line,col,el,Math.min(c.getColumnCount(el),Math.max(0,d.optInt("endColumn",1)-1)));}else p.editor.setSelection(line,col);p.editor.notifyIMEExternalCursorChange();return true;}
            case "editorFocus":{Pane p=panes.get(d.optString("id"));if(p!=null){active=p;p.editor.requestFocus();if(d.optBoolean("keyboard"))showKeyboard();}return true;}
            case "editorAction":{Pane p=panes.get(d.optString("id"));if(p!=null){active=p;action(d.optString("action"));}return true;}
            case "editorAnalysis":{Buffer b=buffers.get(d.optString("uri"));if(b==null||b.revision!=d.optLong("revision"))return false;if(b.analysisRevision!=b.revision){b.analysis=new JSONObject();b.analysisRevision=b.revision;}for(String field:new String[]{"styles","unusedStyles","diagnostics","hints"})if(d.has(field))b.analysis.put(field,d.get(field));for(Pane p:panes.values())if(p.buffer==b&&p.language!=null)p.language.analysis(d);return true;}
            case "editorTypingOptions":{for(Pane p:panes.values())if(p.buffer!=null&&p.buffer.uri.equals(d.optString("uri")))((StudioCodeEditor)p.editor).typingOptions(d.optJSONObject("typing"));return true;}
            case "editorFormatEdits":{
                Pane p=panes.get(d.optString("id"));if(p==null||p.buffer==null||!p.buffer.uri.equals(d.optString("uri")))return false;Buffer b=p.buffer;var cursor=p.editor.getCursor();
                if(b.revision!=d.optLong("revision")||cursor.getLeft()!=d.optInt("expectedStart")||cursor.getRight()!=d.optInt("expectedEnd"))return false;
                handle("editorEdits",d);var pos=p.editor.getText().getIndexer().getCharPosition(Math.max(0,Math.min(p.editor.getText().length(),d.optInt("cursor"))));p.editor.setSelection(pos.line,pos.column);p.editor.notifyIMEExternalCursorChange();app.event("editorResync",snapshot(b));return true;
            }
            case "editorDecorations":{for(Pane p:panes.values())if(p.buffer!=null&&p.buffer.uri.equals(d.optString("uri"))&&p.language!=null){p.language.breakpoints=d.optJSONArray("breakpoints");p.language.execution=d.optInt("execution",0)-1;p.language.lexer.rerun();}return true;}
            case "editorCapture":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)return false;int[] point=new int[2];app.editorRoot.getLocationInWindow(point);Bitmap bitmap=Bitmap.createBitmap(app.editorRoot.getWidth(),app.editorRoot.getHeight(),Bitmap.Config.ARGB_8888);android.graphics.Rect rect=new android.graphics.Rect(point[0],point[1],point[0]+bitmap.getWidth(),point[1]+bitmap.getHeight());java.io.File file=new java.io.File(app.getCacheDir(),"studio-window.png");android.view.PixelCopy.request(app.getWindow(),rect,bitmap,result->{try{if(result==android.view.PixelCopy.SUCCESS){try(java.io.OutputStream out=new java.io.FileOutputStream(file)){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}app.event("editorCaptureReady",object("path",file.getAbsolutePath()));}else app.event("editorCaptureReady",object("error",result));}catch(Exception e){app.event("editorCaptureReady",object("error",e.toString()));}finally{bitmap.recycle();}},app.ui);return file.getAbsolutePath();}
            case "editorVisualState":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;Styles styles=p.editor.getStyles();return object("indent",((StudioCodeEditor)p.editor).typing==null?0:((StudioCodeEditor)p.editor).typing.options.indent,"tabWidth",p.editor.getTabWidth(),"sideIcons",p.editor.getRenderer().hasSideHintIcons(),"textOffset",p.editor.measureTextRegionOffset(),"guides",styles==null||styles.blocks==null?0:styles.blocks.size(),"guideColor",p.editor.getColorScheme().getColor(EditorColorScheme.BLOCK_LINE));}
            case "editorCompletionResult":{CompletableFuture<JSONArray> future=completions.remove(d.optString("request"));if(future!=null)future.complete(d.optJSONArray("items"));return true;}
        }
        throw new IllegalArgumentException(op);
    }
    static void replace(Content c,int start,int end,String text){var a=c.getIndexer().getCharPosition(start);var z=c.getIndexer().getCharPosition(end);c.replace(a.line,a.column,z.line,z.column,text);}
    void configure(Pane p){
        String key=settings.toString();if(key.equals(p.configured))return;p.configured=key;
        float scale=app.web.getScale();if(scale<=0)scale=app.getResources().getDisplayMetrics().density;
        ((StudioCodeEditor)p.editor).configuringFont=true;p.editor.setTextSizePx((float)(settings.optDouble("fontSize",14)*settings.optDouble("codeScale",100)/100*scale));((StudioCodeEditor)p.editor).configuringFont=false;
        p.editor.setScaleTextSizes((float)(settings.optDouble("fontSize",14)*scale*.5),(float)(settings.optDouble("fontSize",14)*scale*2.5));
        p.editor.setWordwrap(settings.optBoolean("wordWrap"));p.editor.setBlockLineEnabled(settings.optBoolean("indentGuides",true));p.editor.setBlockLineWidth(.65f);
        boolean light=settings.optString("theme").equals("forge-light");EditorColorScheme c=p.editor.getColorScheme();
        int fg=Color.parseColor(light?"#1E1F22":"#BCBEC4"),bg=Color.parseColor(light?"#FFFFFF":"#1E1F22");
        c.setColor(EditorColorScheme.WHOLE_BACKGROUND,bg);c.setColor(EditorColorScheme.LINE_NUMBER_BACKGROUND,bg);c.setColor(EditorColorScheme.TEXT_NORMAL,fg);
        c.setColor(EditorColorScheme.LINE_NUMBER,Color.parseColor("#6F737A"));c.setColor(EditorColorScheme.LINE_NUMBER_CURRENT,fg);c.setColor(EditorColorScheme.LINE_DIVIDER,Color.TRANSPARENT);
        c.setColor(EditorColorScheme.BLOCK_LINE,Color.parseColor(light?"#304E5157":"#354E5157"));c.setColor(EditorColorScheme.BLOCK_LINE_CURRENT,Color.parseColor(light?"#805480A8":"#90758CA8"));
        c.setColor(EditorColorScheme.CURRENT_LINE,Color.parseColor(light?"#F0F2F5":"#26282E"));c.setColor(EditorColorScheme.SELECTED_TEXT_BACKGROUND,Color.parseColor(light?"#B5D5FF":"#214283"));
        c.setColor(EditorColorScheme.SELECTION_INSERT,Color.parseColor("#548AF7"));c.setColor(EditorColorScheme.SELECTION_HANDLE,Color.parseColor("#548AF7"));
        c.setColor(EditorColorScheme.COMMENT,Color.parseColor(light?"#8C8C8C":"#7A7E85"));c.setColor(EditorColorScheme.KEYWORD,Color.parseColor(light?"#0033B3":"#CF8E6D"));
        c.setColor(EditorColorScheme.TEXT_INLAY_HINT_FOREGROUND,Color.parseColor(light?"#737373":"#868A91"));c.setColor(EditorColorScheme.TEXT_INLAY_HINT_BACKGROUND,Color.parseColor(light?"#F0F2F5":"#2B2D30"));
        c.setColor(EditorColorScheme.TEXT_SELECTED,fg);c.setColor(EditorColorScheme.DIAGNOSTIC_TOOLTIP_BACKGROUND,Color.parseColor(light?"#F7F8FA":"#2B2D30"));c.setColor(EditorColorScheme.DIAGNOSTIC_TOOLTIP_BRIEF_MSG,fg);c.setColor(EditorColorScheme.DIAGNOSTIC_TOOLTIP_DETAILED_MSG,fg);c.setColor(EditorColorScheme.DIAGNOSTIC_TOOLTIP_ACTION,Color.parseColor("#548AF7"));
        c.setColor(EditorColorScheme.COMPLETION_WND_CORNER,Color.parseColor(light?"#CED0D6":"#4E5157"));c.setColor(EditorColorScheme.SCROLL_BAR_THUMB,Color.parseColor(light?"#B8BBC2":"#4E5157"));
        c.setColor(EditorColorScheme.FUNCTION_NAME,Color.parseColor(light?"#00627A":"#56A8F5"));c.setColor(EditorColorScheme.IDENTIFIER_VAR,fg);
        c.setColor(EditorColorScheme.OPERATOR,fg);c.setColor(UNUSED,Color.parseColor(light?"#A0A0A0":"#6F737A"));
        c.setColor(TYPE,Color.parseColor(light?"#000000":"#BCBEC4"));c.setColor(STRING,Color.parseColor(light?"#067D17":"#6AAB73"));c.setColor(NUMBER,Color.parseColor(light?"#1750EB":"#2AACB8"));
        c.setColor(EditorColorScheme.COMPLETION_WND_BACKGROUND,Color.parseColor(light?"#FFFFFF":"#2B2D30"));c.setColor(EditorColorScheme.COMPLETION_WND_TEXT_PRIMARY,fg);c.setColor(EditorColorScheme.COMPLETION_WND_TEXT_SECONDARY,Color.parseColor("#868A91"));c.setColor(EditorColorScheme.COMPLETION_WND_ITEM_CURRENT,Color.parseColor(light?"#D4E4FA":"#2E436E"));
        c.setColor(EditorColorScheme.TEXT_ACTION_WINDOW_BACKGROUND,Color.parseColor(light?"#F7F8FA":"#393B40"));c.setColor(EditorColorScheme.TEXT_ACTION_WINDOW_ICON_COLOR,fg);
    }
    void geometry(){
        float scale=app.web.getScale();if(scale<=0)scale=app.getResources().getDisplayMetrics().density;
        boolean resized=false;int bar=app.imeHeight>0&&visible&&active!=null&&active.editor.hasFocus()&&settings.optBoolean("keyboardExtraKeys",true)?Math.round(42*app.getResources().getDisplayMetrics().density):0;
        int bottom=app.editorRoot.getHeight()-app.imeHeight-bar;
        for(Pane p:panes.values()){
            int left=Math.round(p.x*scale),top=Math.round(p.y*scale),width=Math.round(p.w*scale),height=Math.round(p.h*scale);
            List<RectF> holes=new ArrayList<>(),touchHoles=new ArrayList<>();for(int i=0;i<occlusions.length();i++){JSONObject r=occlusions.optJSONObject(i);if(r!=null){RectF rect=new RectF((float)r.optDouble("x")*scale-left,(float)r.optDouble("y")*scale-top,(float)(r.optDouble("x")+r.optDouble("width"))*scale-left,(float)(r.optDouble("y")+r.optDouble("height"))*scale-top);touchHoles.add(rect);if(r.optBoolean("paint",true))holes.add(rect);}}((StudioCodeEditor)p.editor).occlusions=holes;((StudioCodeEditor)p.editor).touchOcclusions=touchHoles;p.editor.invalidate();
            // The shell keeps its selected overlay percentage; only the input viewport avoids the IME.
            height=Math.min(height,Math.max(0,bottom-top));
            boolean show=visible&&p.buffer!=null&&width>1&&height>1;p.editor.setVisibility(show?View.VISIBLE:View.GONE);
            FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)p.editor.getLayoutParams();
            if(lp.leftMargin!=left||lp.topMargin!=top||lp.width!=width||lp.height!=height){resized=true;lp.leftMargin=left;lp.topMargin=top;lp.width=Math.max(1,width);lp.height=Math.max(1,height);p.editor.setLayoutParams(lp);}
        }
        accessory.setVisibility(bar>0?View.VISIBLE:View.GONE);
        if(bar>0){FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)accessory.getLayoutParams();lp.height=bar;lp.gravity=Gravity.TOP;lp.topMargin=Math.max(0,bottom);accessory.setLayoutParams(lp);accessory.bringToFront();}
        if(resized&&active!=null)reveal(active);
    }
    void reveal(Pane p){Buffer expected=p.buffer;if(p.editor.hasFocus()&&app.imeHeight>0)p.editor.post(()->{if(p.buffer==expected&&expected!=null)p.editor.ensureSelectionVisible();});}
    void showKeyboard(){if(active==null)return;active.editor.requestFocus();((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(active.editor,InputMethodManager.SHOW_IMPLICIT);geometry();}
    void createAccessory(){
        accessory=new HorizontalScrollView(app);accessory.setHorizontalScrollBarEnabled(false);accessory.setFillViewport(false);accessory.setBackgroundColor(Color.rgb(43,45,48));
        LinearLayout row=new LinearLayout(app);row.setOrientation(LinearLayout.HORIZONTAL);accessory.addView(row);app.editorRoot.addView(accessory,new FrameLayout.LayoutParams(-1,1));accessory.setVisibility(View.GONE);
        String[][] keys={{"Tab","tab"},{"arrow_left","left"},{"arrow_down","down"},{"arrow_up","up"},{"arrow_right","right"},{"braces","{}"},{"parentheses","()"},{"brackets","[]"},{";",";"},{"\"","\""},{"&","&"},{"*","*"},{"undo_2","undo"},{"redo_2","redo"},{"copy","copy"},{"clipboard_paste","paste"}};
        for(String[] k:keys){View key;int icon=app.getResources().getIdentifier("ic_"+k[0],"drawable",app.getPackageName());
            if(icon!=0){ImageView image=new ImageView(app);image.setImageResource(icon);image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);int pad=Math.round(11*app.getResources().getDisplayMetrics().density);image.setPadding(pad,pad,pad,pad);key=image;}else{TextView text=new TextView(app);text.setText(k[0]);text.setTextColor(Color.rgb(188,190,196));text.setTextSize(16);text.setGravity(Gravity.CENTER);key=text;}
            key.setContentDescription(k[1]);key.setBackgroundResource(android.R.drawable.list_selector_background);int dp=Math.round(44*app.getResources().getDisplayMetrics().density);row.addView(key,new LinearLayout.LayoutParams(dp,-1));
            final Runnable repeat=new Runnable(){public void run(){action(k[1]);app.ui.postDelayed(this,65);}};
            key.setOnTouchListener((v,e)->{switch(e.getActionMasked()){case MotionEvent.ACTION_DOWN: v.setPressed(true);action(k[1]);if(Arrays.asList("left","right","up","down").contains(k[1]))app.ui.postDelayed(repeat,380);return true;case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:v.setPressed(false);app.ui.removeCallbacks(repeat);return true;}return true;});
        }
    }
    void action(String action){
        if(active==null||active.buffer==null)return;CodeEditor e=active.editor;e.requestFocus();
        int key=action.equals("left")?KeyEvent.KEYCODE_DPAD_LEFT:action.equals("right")?KeyEvent.KEYCODE_DPAD_RIGHT:action.equals("up")?KeyEvent.KEYCODE_DPAD_UP:action.equals("down")?KeyEvent.KEYCODE_DPAD_DOWN:action.equals("home")?KeyEvent.KEYCODE_MOVE_HOME:action.equals("end")?KeyEvent.KEYCODE_MOVE_END:0;
        if(key!=0){e.getComponent(EditorAutoCompletion.class).hide();e.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,key));e.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,key));return;}
        switch(action){case "copy":e.copyText();break;case "cut":e.cutText();break;case "paste":e.pasteText();break;case "selectAll":e.selectAll();break;case "undo":e.undo();break;case "redo":e.redo();break;case "suggest":e.getComponent(EditorAutoCompletion.class).requireCompletion();break;case "duplicate":e.duplicateSelection();break;case "deleteLine":{var c=e.getCursor();int line=c.getLeftLine();if(line+1<e.getText().getLineCount())e.getText().delete(line,0,line+1,0);else e.getText().delete(line,0,line,e.getText().getColumnCount(line));break;}case "tab":e.indentOrCommitTab();break;default:e.commitText(action.equals("{}")?"{":action.equals("()")?"(":action.equals("[]")?"[":action);}
    }
    void pause(){for(Buffer b:buffers.values()){Pane p=source(b);if(p==null)continue;String text=p.editor.getText().toString(),path=b.path;long revision=b.revision;if(!p.editor.isEditable())continue;app.workers.execute(()->{try{app.engine.saveVersioned(path,text,revision);}catch(Exception error){android.util.Log.w("Studio","Save on pause",error);}});}}
    void close(){for(Pane p:panes.values())p.editor.release();for(var f:completions.values())f.cancel(true);completions.clear();}

    final class StudioLanguage extends EmptyLanguage {
        final Pane pane;final String kind;final Lexer lexer=new Lexer();final SmartTyping typing;
        volatile List<DiagnosticRegion> diagnostics=Collections.emptyList();volatile JSONArray styles=new JSONArray(),unusedStyles=new JSONArray(),breakpoints=new JSONArray();volatile int execution=-1;
        final Set<String> keywords=new HashSet<>(Arrays.asList(("alignas alignof and asm auto bool break case catch char char8_t char16_t char32_t class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while override final import module _Atomic _Bool _Complex _Generic _Noreturn _Static_assert _Thread_local if endif elseif else foreach endforeach function endfunction macro endmacro set unset option project cmake_minimum_required add_executable add_library target_sources target_link_libraries target_include_directories find_package include add_subdirectory message return while endwhile").split(" ")));
        StudioLanguage(Pane p,String kind){pane=p;this.kind=kind;typing=new SmartTyping(kind);}
        final io.github.rosemoe.sora.widget.SymbolPairMatch pairs=new io.github.rosemoe.sora.widget.SymbolPairMatch.DefaultSymbolPairs();
        @Override public io.github.rosemoe.sora.widget.SymbolPairMatch getSymbolPairs(){return pairs;}
        @Override public AnalyzeManager getAnalyzeManager(){return lexer;}
        @Override public int getIndentAdvance(ContentReference content,int line,int column){String s=content.getLine(line).substring(0,column).trim();return s.endsWith("{")||s.endsWith("(")?typing.options.indent:0;}
        void analysis(JSONObject d){
            JSONArray ds=d.optJSONArray("diagnostics");
            if(ds!=null){List<DiagnosticRegion> regions=new ArrayList<>();for(int i=0;i<ds.length();i++){JSONObject v=ds.optJSONObject(i);if(v==null)continue;regions.add(new DiagnosticRegion(v.optInt("start"),v.optInt("end"),(short)(v.optInt("severity")==1?3:v.optInt("severity")==2?2:1),i,new DiagnosticDetail(v.optString("message"),null,null,null)));}diagnostics=regions;DiagnosticsContainer container=new DiagnosticsContainer();container.addDiagnostics(regions);pane.editor.setDiagnostics(container);}
            if(d.has("styles"))styles=d.optJSONArray("styles");
            if(d.has("unusedStyles"))unusedStyles=d.optJSONArray("unusedStyles");
            if(d.has("styles")||d.has("unusedStyles"))lexer.rerun();
            JSONArray hs=d.optJSONArray("hints");if(hs!=null){InlayHintsContainer hints=new InlayHintsContainer();for(int i=0;i<hs.length();i++){JSONObject h=hs.optJSONObject(i);if(h!=null)hints.add(new TextInlayHint(h.optInt("line"),h.optInt("column"),h.optString("text")));}pane.editor.setInlayHints(hints);}
        }
        @Override public void requireAutoComplete(ContentReference content,CharPosition pos,CompletionPublisher publisher,Bundle args){
            String request=String.valueOf(requestSequence.incrementAndGet());CompletableFuture<JSONArray> f=new CompletableFuture<>();completions.put(request,f);
            app.ui.post(()->{if(pane.buffer!=null){flush(pane.buffer);app.event("editorCompletion",object("request",request,"uri",pane.buffer.uri,"revision",pane.buffer.revision,"line",pos.line,"column",pos.column));}});
            try{JSONArray items=f.get(3000,TimeUnit.MILLISECONDS);if(items!=null)for(int i=0;i<items.length();i++){publisher.checkCancelled();JSONObject item=items.getJSONObject(i);final JSONObject value=item;
                CompletionItem completion=new CompletionItem(item.optString("label"),item.optString("detail")){
                    @Override public void performCompletion(CodeEditor editor,Content text,int line,int column){performCompletion(editor,text,text.getIndexer().getCharPosition(line,column));}
                    @Override public void performCompletion(CodeEditor editor,Content text,CharPosition position){
                        try{int end=value.optInt("end",position.index),start=value.optInt("start",position.index),index=start;String insert=value.optString("text");replace(text,start,end,"");
                            JSONArray extra=value.optJSONArray("additional");if(extra!=null)for(int j=0;j<extra.length();j++){JSONObject e=extra.getJSONObject(j);int a=e.getInt("start"),z=e.getInt("end");String s=e.getString("text");replace(text,a,z,s);if(a<=index)index+=s.length()-(z-a);}
                            if(value.optBoolean("snippet"))editor.getSnippetController().startSnippet(index,CodeSnippetParser.parse(insert),null);else{var p=text.getIndexer().getCharPosition(index);text.insert(p.line,p.column,insert);var c=text.getIndexer().getCharPosition(index+insert.length());editor.setSelection(c.line,c.column);}
                        }catch(Exception error){android.util.Log.w("Studio","Completion",error);}
                    }
                };completion.sortText=item.optString("sortText");publisher.addItem(completion);
            }}catch(InterruptedException e){Thread.currentThread().interrupt();}catch(Exception ignored){}finally{completions.remove(request);app.ui.post(()->app.event("editorCompletionCancel",object("request",request)));}
        }
        final class Lexer extends SimpleAnalyzeManager<Void> {
            final Pattern tokens=Pattern.compile("//[^\\n]*|/\\*[\\s\\S]*?(?:\\*/|$)|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\\b(?:0[xX][0-9a-fA-F']+|[0-9][0-9a-zA-Z'.]*)\\b|[a-zA-Z_][a-zA-Z_0-9]*|#[^\\n]*|\\$\\{[^}]*\\}");
            @Override protected Styles analyze(StringBuilder text,Delegate<Void> delegate){
                Content owner=pane.editor.getText();long revision=owner.getDocumentVersion();int[] colors=new int[text.length()+1];Arrays.fill(colors,EditorColorScheme.TEXT_NORMAL);Matcher m=tokens.matcher(text);
                while(m.find()){if(delegate.isCancelled())return null;String token=m.group();int color=EditorColorScheme.TEXT_NORMAL;
                    if(token.startsWith("//")||token.startsWith("/*")||(token.startsWith("#")&&!kind.equals("cpp")&&!kind.equals("c")))color=EditorColorScheme.COMMENT;
                    else if(token.startsWith("\"")||token.startsWith("'"))color=STRING;
                    else if(Character.isDigit(token.charAt(0)))color=NUMBER;
                    else if(keywords.contains(token)||token.startsWith("#"))color=EditorColorScheme.KEYWORD;
                    else if(token.startsWith("${"))color=TYPE;
                    else{int i=m.end();while(i<text.length()&&Character.isWhitespace(text.charAt(i)))i++;if(i<text.length()&&text.charAt(i)=='(')color=EditorColorScheme.FUNCTION_NAME;}
                    Arrays.fill(colors,m.start(),m.end(),color);
                }
                for(JSONArray ranges:new JSONArray[]{styles,unusedStyles}){if(ranges==null)continue;for(int i=0;i<ranges.length();i++){JSONObject r=ranges.optJSONObject(i);if(r==null)continue;int a=Math.max(0,Math.min(text.length(),r.optInt("start"))),z=Math.max(a,Math.min(text.length(),r.optInt("end")));String type=r.optString("type");int color=type.equals("unused")?UNUSED:type.equals("function")||type.equals("method")?EditorColorScheme.FUNCTION_NAME:type.equals("keyword")?EditorColorScheme.KEYWORD:type.equals("string")?STRING:type.equals("number")?NUMBER:TYPE;Arrays.fill(colors,a,z,color);}}
                MappedSpans.Builder builder=new MappedSpans.Builder();int line=0,col=0,previous=-1;
                for(int i=0;i<=text.length();i++){if((i&4095)==0&&delegate.isCancelled())return null;int color=colors[i];if(col==0||color!=previous){builder.addIfNeeded(line,col,color);previous=color;}if(i<text.length()&&(text.charAt(i)=='\n'||text.charAt(i)=='\r')){if(text.charAt(i)=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;line++;col=0;previous=-1;}else col++;}
                builder.determine(line);Styles result=new RevisionStyles(builder.build(),owner,revision,StudioLanguage.this);result.setIndentCountMode(true);
                for(IndentGuides.Guide guide:IndentGuides.scan(text,typing.options.tab)){CodeBlock block=new CodeBlock();block.startLine=guide.first;block.endLine=guide.last;block.startColumn=block.endColumn=guide.column;block.toBottomOfEndLine=guide.toBottom;result.addCodeBlock(block);}JSONArray points=breakpoints;
                if(points!=null)for(int i=0;i<points.length();i++){int row=points.optInt(i)-1;if(row<0||row>line)continue;android.graphics.drawable.GradientDrawable dot=new android.graphics.drawable.GradientDrawable();dot.setShape(android.graphics.drawable.GradientDrawable.OVAL);dot.setColor(Color.rgb(219,88,96));dot.setSize(18,18);result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineBackground(row,new io.github.rosemoe.sora.lang.styling.color.ConstColor(Color.argb(24,219,88,96))));result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineSideIcon(row,dot));}
                if(execution>=0&&execution<=line){result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineBackground(execution,new io.github.rosemoe.sora.lang.styling.color.ConstColor(Color.rgb(38,69,107))));android.graphics.drawable.Drawable arrow=app.getDrawable(com.forgex.R.drawable.ic_arrow_right);arrow.setTint(Color.rgb(84,138,247));result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineSideIcon(execution,arrow));}
                result.finishBuilding();return result;
            }
        }
    }
}
