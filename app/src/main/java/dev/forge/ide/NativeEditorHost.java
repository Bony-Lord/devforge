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
import io.github.rosemoe.sora.widget.SelectionMovement;
import io.github.rosemoe.sora.util.IntPair;
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
    boolean webFieldFocused;
    final MainActivity app;
    final Map<String,Pane> panes=new LinkedHashMap<>();
    final Map<String,Buffer> buffers=new ConcurrentHashMap<>();
    final Map<String,CompletableFuture<JSONArray>> completions=new ConcurrentHashMap<>();
    Pane active;
    JSONObject settings=new JSONObject();
    HorizontalScrollView accessory;
    View floatingKeyboardButton;
    final FloatingCodeKeyboard floatingKeyboard;
    final WindowResizeHandles windowResizeHandles;
    boolean visible=true,applying=false;
    int previousImeHeight;
    JSONArray occlusions=new JSONArray();
    final java.util.concurrent.atomic.AtomicLong requestSequence=new java.util.concurrent.atomic.AtomicLong();
    final int UNUSED=512,TYPE=513,STRING=514,NUMBER=515;
    NativeEditorHost(MainActivity app){this.app=app;createAccessory();floatingKeyboard=new FloatingCodeKeyboard(this);windowResizeHandles=new WindowResizeHandles(this);}
    static final class RevisionStyles extends Styles {
        final Content owner;final long revision;final Object language;
        RevisionStyles(Spans spans,Content owner,long revision,Object language){super(spans);this.owner=owner;this.revision=revision;this.language=language;}
    }
    static final class StudioCodeEditor extends CodeEditor {
        FloatingCodeKeyboard floatingKeyboard;
        volatile Set<Integer> breakpointLines=Collections.emptySet();volatile int executionLine=-1;
        @Override public int getScrollMaxY(){if(getLayout()==null)return 0;return Math.max(0,Math.min(super.getScrollMaxY(),getLayout().getLayoutHeight()-Math.max(1,getRowHeight()/2)));}
        @Override protected io.github.rosemoe.sora.widget.EditorRenderer onCreateRenderer(){return new io.github.rosemoe.sora.widget.EditorRenderer(this){
            final Paint marker=new Paint(Paint.ANTI_ALIAS_FLAG);
            @Override public boolean hasSideHintIcons(){return false;}
            @Override protected void drawLineNumber(Canvas canvas,int line,int row,float offsetX,float width,int color){
                boolean point=breakpointLines!=null&&breakpointLines.contains(line),execution=executionLine==line;
                if(!point&&!execution){super.drawLineNumber(canvas,line,row,offsetX,width,color);return;}
                float cx=offsetX+width/2,cy=(getRowTop(row)+getRowBottom(row))/2f-getOffsetY(),radius=Math.min(getRowHeight()*.34f,Math.max(2,width/2-getDpUnit()));
                if(point){marker.setStyle(Paint.Style.FILL);marker.setColor(Color.rgb(219,88,96));canvas.drawCircle(cx,cy,radius,marker);}
                if(execution){marker.setColor(point?Color.WHITE:Color.rgb(84,138,247));Path arrow=new Path();arrow.moveTo(cx-radius*.6f,cy-radius*.65f);arrow.lineTo(cx+radius*.75f,cy);arrow.lineTo(cx-radius*.6f,cy+radius*.65f);arrow.close();canvas.drawPath(arrow,marker);}
            }
        };}
        List<RectF> occlusions=Collections.emptyList(),touchOcclusions=Collections.emptyList();Runnable dismissPopover;
        @Override public void draw(Canvas canvas){
            // View.draw receives a canvas in scrolled content coordinates. Sora cancels
            // that scroll inside its renderer; our viewport masks must use it too.
            // Clipping at (0,0) removes offsetX pixels on the right and offsetY below.
            int save=canvas.save(),x=getScrollX(),y=getScrollY();
            canvas.clipRect(x,y,x+getWidth(),y+getHeight());
            for(RectF rect:occlusions)canvas.clipOutRect(x+rect.left/getScaleX(),y+rect.top/getScaleY(),x+rect.right/getScaleX(),y+rect.bottom/getScaleY());
            super.draw(canvas);canvas.restoreToCount(save);
        }
        long fontGestureUntil;boolean zoomTouch,zoomActive,zoomFramePending;float zoomStartScale=1;float pinchSpan,pinchX,pinchY;
        float zoomRatio=1,zoomBaseFont,zoomFocusX,zoomFocusY,zoomMin=10,zoomMax=100;int zoomX,zoomY;
        @Override public void setScaleTextSizes(float min,float max){super.setScaleTextSizes(min,max);zoomMin=min;zoomMax=max;}
        boolean beginZoom(float x,float y){
            if(getWidth()<1||getHeight()<1||isFormatting())return false;
            zoomActive=true;zoomStartScale=getScaleX();zoomBaseFont=getTextSizePx();zoomX=getOffsetX();zoomY=getOffsetY();zoomFocusX=x;zoomFocusY=y;zoomRatio=zoomStartScale;
            getComponent(EditorAutoCompletion.class).hide();getComponent(io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow.class).dismiss();return true;
        }
        void placeTransformedAnchor(){
            int x=Math.max(0,Math.min(getScrollMaxX(),Math.round(zoomX+zoomFocusX/zoomStartScale-zoomFocusX/zoomRatio)));
            int y=Math.max(0,Math.min(getScrollMaxY(),Math.round(zoomY+zoomFocusY/zoomStartScale-zoomFocusY/zoomRatio)));
            getScroller().startScroll(x,y,0,0,0);getScroller().abortAnimation();
        }
        @Override protected void onSizeChanged(int w,int h,int oldW,int oldH){super.onSizeChanged(w,h,oldW,oldH);if(zoomActive)placeTransformedAnchor();}
        void renderZoomFrame(){
            if(!zoomActive)return;View viewport=(View)getParent();FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)getLayoutParams();lp.width=Math.max(1,Math.round(viewport.getWidth()/zoomRatio));lp.height=Math.max(1,Math.round(viewport.getHeight()/zoomRatio));setPivotX(0);setPivotY(0);setScaleX(zoomRatio);setScaleY(zoomRatio);setLayoutParams(lp);placeTransformedAnchor();postInvalidateOnAnimation();
        }
        void finishZoom(){
            if(!zoomActive)return;renderZoomFrame();zoomActive=false;fontGestureUntil=SystemClock.uptimeMillis()+80;if(fontChanged!=null)fontChanged.accept(zoomBaseFont*zoomRatio);
        }
        int popupX(int x,int width){int viewport=Math.round(getWidth()*getScaleX());return getOffsetX()+Math.max(0,Math.min(Math.round((x-getOffsetX())*getScaleX()),Math.max(0,viewport-width)));}
        int popupY(int y,int height){int viewport=Math.round(getHeight()*getScaleY()),top=Math.round((y-getOffsetY())*getScaleY());if(top+height>viewport)top-=height+Math.round(getRowHeight()*getScaleY());return getOffsetY()+Math.max(0,Math.min(top,Math.max(0,viewport-height)));}
        int[] popupPosition(int x,int y,int width,int height){
            int px=popupX(x,width),py=popupY(y,height);
            if(floatingKeyboard==null||!floatingKeyboard.frame.isShown())return new int[]{px,py};
            int[] origin=new int[2],keyboard=new int[2];getLocationOnScreen(origin);floatingKeyboard.frame.getLocationOnScreen(keyboard);
            int left=px-getOffsetX()+origin[0],top=py-getOffsetY()+origin[1],right=keyboard[0]+floatingKeyboard.frame.getWidth(),bottom=keyboard[1]+floatingKeyboard.frame.getHeight(),vw=Math.round(getWidth()*getScaleX()),vh=Math.round(getHeight()*getScaleY()),gap=Math.round(6*getResources().getDisplayMetrics().density);
            if(left<right+gap&&left+width>keyboard[0]-gap&&top<bottom+gap&&top+height>keyboard[1]-gap){
                if(keyboard[0]-gap-width>=origin[0])left=keyboard[0]-gap-width;
                else if(right+gap+width<=origin[0]+vw)left=right+gap;
                else if(keyboard[1]-gap-height>=origin[1])top=keyboard[1]-gap-height;
                else if(bottom+gap+height<=origin[1]+vh)top=bottom+gap;
            }
            return new int[]{left-origin[0]+getOffsetX(),top-origin[1]+getOffsetY()};
        }
        @Override protected void onDetachedFromWindow(){zoomActive=false;super.onDetachedFromWindow();}
        @Override public boolean dispatchTouchEvent(MotionEvent event){
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN){for(RectF rect:touchOcclusions)if(rect.contains(event.getX()*getScaleX(),event.getY()*getScaleY()))return false;if(dismissPopover!=null)dismissPopover.run();}
            if(event.getPointerCount()>1){
                fontGestureUntil=SystemClock.uptimeMillis()+500;
                float span=(float)Math.hypot(event.getX(1)-event.getX(0),event.getY(1)-event.getY(0))*getScaleX();
                if(!zoomTouch){zoomTouch=true;pinchSpan=Math.max(1,span);pinchX=(event.getX(0)+event.getX(1))*getScaleX()/2;pinchY=(event.getY(0)+event.getY(1))*getScaleY()/2;MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(cancel);cancel.recycle();}
                if(event.getActionMasked()==MotionEvent.ACTION_MOVE&&(zoomActive||Math.abs(span-pinchSpan)>ViewConfiguration.get(getContext()).getScaledTouchSlop())){
                    if(!zoomActive)beginZoom(pinchX,pinchY);
                    if(zoomActive){zoomRatio=Math.max(zoomMin/zoomBaseFont,Math.min(zoomMax/zoomBaseFont,zoomStartScale*span/pinchSpan));if(!zoomFramePending){zoomFramePending=true;postOnAnimation(()->{zoomFramePending=false;renderZoomFrame();});}}
                }
                if(event.getActionMasked()==MotionEvent.ACTION_POINTER_UP&&zoomActive)finishZoom();
            }
            if(zoomTouch){if(event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL){if(zoomActive)finishZoom();zoomTouch=false;}return true;}
            return super.dispatchTouchEvent(event);
        }
        @Override public boolean dispatchHoverEvent(MotionEvent event){for(RectF rect:touchOcclusions)if(rect.contains(event.getX()*getScaleX(),event.getY()*getScaleY()))return false;return super.dispatchHoverEvent(event);}
        InputConnection currentInput;
        SmartTyping typing;boolean pasting;java.util.function.Consumer<SmartTyping.Edit> blockCompleted;
        java.util.function.Consumer<Float> fontChanged;boolean configuringFont;
        StudioCodeEditor(Context context){super(context);
            subscribeEvent(SelectionChangeEvent.class,(event,unsubscribe)->{if(!verticalMoving&&(event.getCause()!=SelectionChangeEvent.CAUSE_IME||event.getOldLeft()==null||!event.getOldLeft().equals(event.getLeft())||!event.getOldRight().equals(event.getRight())))preferredX=Float.NaN;});
            subscribeEvent(ContentChangeEvent.class,(event,unsubscribe)->preferredX=Float.NaN);
            // Sora still asks its animator for geometry before mutations even when animation is off.
            // A selected range can be edited before the first draw; do not consult the renderer then.
            setCursorAnimator(new io.github.rosemoe.sora.widget.style.CursorAnimator(){public void markStartPos(){}public void markEndPos(){}public void start(){}public void cancel(){}public boolean isRunning(){return false;}public float animatedX(){return 0;}public float animatedY(){return 0;}public float animatedLineHeight(){return 0;}public float animatedLineBottom(){return 0;}});
        }
        float preferredX=Float.NaN;boolean verticalMoving;
        @Override public void moveSelection(SelectionMovement movement){if(movement==SelectionMovement.UP||movement==SelectionMovement.DOWN)moveVertically(movement,false);else{preferredX=Float.NaN;super.moveSelection(movement);}}
        @Override public void extendSelection(SelectionMovement movement){if(movement==SelectionMovement.UP||movement==SelectionMovement.DOWN)moveVertically(movement,true);else{preferredX=Float.NaN;super.extendSelection(movement);}}
        void moveVertically(SelectionMovement movement,boolean extend){
            if(getLayout()==null){if(extend)super.extendSelection(movement);else super.moveSelection(movement);return;}
            if(extend)ensureSelectionAnchorAvailable();
            CharPosition from=extend?getSelectingTarget():movement==SelectionMovement.UP?getCursor().left():getCursor().right();
            if(Float.isNaN(preferredX))preferredX=getLayout().getCharLayoutOffset(from.line,from.column)[1];
            int row=getLayout().getRowIndexForPosition(from.index),target=Math.max(0,Math.min(getLayout().getRowCount()-1,row+(movement==SelectionMovement.UP?-1:1)));
            if(row==target)return;
            long position=getLayout().getCharPositionForLayoutOffset(preferredX,(target+.5f)*getRowHeight());int line=IntPair.getFirst(position),column=IntPair.getSecond(position);
            verticalMoving=true;try{if(extend){setSelectionRegion(selectionAnchor.line,selectionAnchor.column,line,column,false,SelectionChangeEvent.CAUSE_KEYBOARD_OR_CODE);ensureSelectingTargetVisible();}else setSelection(line,column,SelectionChangeEvent.CAUSE_KEYBOARD_OR_CODE);}finally{verticalMoving=false;}
        }
        @Override public boolean onKeyDown(int key,KeyEvent event){if(key==KeyEvent.KEYCODE_SPACE&&event.isCtrlPressed())return false;return super.onKeyDown(key,event);}
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
        String id;CodeEditor editor;FrameLayout viewport;Buffer buffer;StudioLanguage language;boolean muted;final StudioCompletionLayout completionLayout=new StudioCompletionLayout();
        final Map<String,ViewState> views=new HashMap<>();
        float x,y,w,h;String configured="";boolean viewportScheduled,deferredConfig,layoutVisible=true;JSONArray masks=new JSONArray();int z;ViewState resizeAnchor;Buffer resizeBuffer;int resizeGeneration;
        Pane(String id){
            this.id=id;
            Configuration config=new Configuration(app.getResources().getConfiguration());config.setLocale(Locale.forLanguageTag(settings.optString("language","ru")));
            editor=new StudioCodeEditor(app.createConfigurationContext(config));
            StudioCodeEditor code=(StudioCodeEditor)editor;code.floatingKeyboard=floatingKeyboard;
            editor.replaceComponent(EditorAutoCompletion.class,new EditorAutoCompletion(editor){int rawX,rawY;@Override public void setLocation(int x,int y){rawX=x;rawY=y;int[] position=code.popupPosition(x,y,getWidth(),getHeight());super.setLocation(position[0],position[1]);}@Override public void setSize(int width,int height){super.setSize(width,height);setLocation(rawX,rawY);}@Override public boolean isFeatureEnabled(int feature){return feature==FEATURE_SHOW_OUTSIDE_VIEW_ALLOWED||feature!=FEATURE_DISMISS_WHEN_OBSCURING_CURSOR&&super.isFeatureEnabled(feature);}});
            editor.getComponent(EditorAutoCompletion.class).setLayout(completionLayout);
            editor.replaceComponent(io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow.class,new io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow(editor){int rawX,rawY;@Override public void setLocation(int x,int y){rawX=x;rawY=y;int[] position=code.popupPosition(x,y,getWidth(),getHeight());super.setLocation(position[0],position[1]);}@Override public void setSize(int width,int height){super.setSize(width,height);setLocation(rawX,rawY);}@Override public boolean isFeatureEnabled(int feature){return feature==FEATURE_SHOW_OUTSIDE_VIEW_ALLOWED||feature!=FEATURE_DISMISS_WHEN_OBSCURING_CURSOR&&super.isFeatureEnabled(feature);}});
            editor.replaceComponent(io.github.rosemoe.sora.widget.component.EditorTextActionWindow.class,new io.github.rosemoe.sora.widget.component.EditorTextActionWindow(editor){int rawX,rawY;@Override public void setLocation(int x,int y){rawX=x;rawY=y;int[] position=code.popupPosition(x,y,getWidth(),getHeight());super.setLocation(position[0],position[1]);}@Override public void setSize(int width,int height){super.setSize(width,height);setLocation(rawX,rawY);}@Override public boolean isFeatureEnabled(int feature){return feature==FEATURE_SHOW_OUTSIDE_VIEW_ALLOWED||feature!=FEATURE_DISMISS_WHEN_OBSCURING_CURSOR&&super.isFeatureEnabled(feature);}});
            editor.setDividerMargin(0,4*editor.getDpUnit());
            editor.getProps().adjustToSelectionOnResize=false;
            ((StudioCodeEditor)editor).dismissPopover=()->app.event("editorDismissPopover",new JSONObject());
            ((StudioCodeEditor)editor).fontChanged=size->{float scale=app.web.getScale();if(scale>0){double percent=size/scale/settings.optDouble("fontSize",14)*100;try{settings.put("codeScale",percent);}catch(JSONException ignored){}app.event("editorScale",object("id",id,"percent",percent));}};
            editor.setTag("studio-editor-"+id);editor.setContentDescription("Code editor "+id);
            editor.setTypefaceText(Typeface.createFromAsset(app.getAssets(),"ui/fonts/JetBrainsMono-Regular.ttf"));
            // Some IMEs ignore NO_SUGGESTIONS on an ordinary text field. Visible-password
            // variation also suppresses autocorrection/capitalization, without hiding source.
            editor.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            editor.setSoftKeyboardEnabled(!floatingKeyboard.enabled);
            // disallowSuggestions in Sora spoofs random selection offsets. Keep the full IME protocol.
            editor.getProps().disallowSuggestions=false;editor.getProps().allowFullscreen=false;
            editor.registerInlayHintRenderer(new TextInlayHintRenderer());
            editor.getProps().scrollAnimationDurationMs=0;editor.setCursorAnimationEnabled(false);
            editor.setScalable(true);
            editor.setVerticalExtraSpaceFactor(1f);editor.setTabWidth(4);
            editor.setOnFocusChangeListener((v,focused)->{if(focused){webFieldFocused=false;active=this;emitSelection(this);geometry();}});
            editor.subscribeEvent(ContentChangeEvent.class,(e,unsubscribe)->{var smart=((StudioCodeEditor)editor).typing;if(smart!=null)smart.changed(e.getChangeStart().index);changed(this,e);});
            ((StudioCodeEditor)editor).blockCompleted=edit->{if(buffer==null||!settings.optBoolean("smartFormatOnClose",true)||!Arrays.asList("c","cpp").contains(language.kind))return;flush(buffer);app.event("editorFormatOnType",object("id",id,"uri",buffer.uri,"revision",buffer.revision,"start",edit.blockStart,"end",edit.blockEnd+1));};
            editor.subscribeEvent(SelectionChangeEvent.class,(e,unsubscribe)->{if(!muted){if(editor.hasFocus())active=this;emitSelection(this);if(editor.hasFocus())reveal(this);}});
            editor.subscribeEvent(ScrollEvent.class,(e,unsubscribe)->{if(!viewportScheduled){viewportScheduled=true;app.ui.postDelayed(()->{viewportScheduled=false;if(buffer!=null)app.event("editorViewport",object("id",id,"uri",buffer.uri,"first",editor.getFirstVisibleLine(),"last",editor.getLastVisibleLine()));},80);}});
            editor.subscribeEvent(ClickEvent.class,(e,unsubscribe)->{active=this;if(e.getMotionRegion()==EditorMotionEvent.REGION_LINE_NUMBER||e.getMotionRegion()==EditorMotionEvent.REGION_SIDE_ICON)app.event("editorGutter",object("id",id,"uri",buffer==null?"":buffer.uri,"line",e.getLine()+1));else if(floatingKeyboard.enabled)floatingKeyboard.show();});
            viewport=new FrameLayout(app);viewport.setClipChildren(true);viewport.setClipToPadding(true);viewport.addView(editor,new FrameLayout.LayoutParams(-1,-1));app.editorRoot.addView(viewport,new FrameLayout.LayoutParams(1,1));configure(this);
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
            case "editorTestCompletionState":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;EditorAutoCompletion completion=p.editor.getComponent(EditorAutoCompletion.class);ListView list=p.completionLayout.getCompletionList();return object("line",p.editor.getCursor().getRightLine()+1,"column",p.editor.getCursor().getRightColumn()+1,"start",p.editor.getCursor().getLeft(),"end",p.editor.getCursor().getRight(),"showing",completion.isShowing(),"selected",completion.getCurrentPosition(),"count",list.getCount(),"first",list.getFirstVisiblePosition(),"last",list.getLastVisiblePosition(),"requests",p.completionLayout.requests,"reveals",p.completionLayout.reveals);}
            case "editorResizeStart":{for(Pane p:panes.values()){p.resizeGeneration++;p.resizeBuffer=p.buffer;p.resizeAnchor=new ViewState(p.editor);p.editor.getScroller().startScroll(p.resizeAnchor.x,p.resizeAnchor.y,0,0,0);p.editor.getScroller().abortAnimation();}return true;}
            case "editorResizeEnd":{for(Pane p:panes.values()){int generation=p.resizeGeneration;p.editor.postDelayed(()->{if(p.resizeGeneration==generation){restoreResizeAnchor(p);p.resizeAnchor=null;}},100);}return true;}
            case "editorTestHover":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;float[] point=p.editor.getLayout().getCharLayoutOffset(d.getInt("line"),d.getInt("column"));MotionEvent event=MotionEvent.obtain(SystemClock.uptimeMillis(),SystemClock.uptimeMillis(),d.optInt("action",MotionEvent.ACTION_HOVER_MOVE),point[1]+p.editor.measureTextRegionOffset()-p.editor.getOffsetX()+2,point[0]-p.editor.getOffsetY()-p.editor.getRowHeight()/2f,0);event.setSource(InputDevice.SOURCE_MOUSE);try{p.editor.dispatchGenericMotionEvent(event);}finally{event.recycle();}return p.editor.getComponent(io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow.class).isShowing();}
            case "editorTestTouch":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;JSONArray points=d.getJSONArray("points");MotionEvent.PointerProperties[] props=new MotionEvent.PointerProperties[points.length()];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[points.length()];for(int i=0;i<points.length();i++){props[i]=new MotionEvent.PointerProperties();props[i].id=i;props[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=(float)points.getJSONObject(i).getDouble("x");coords[i].y=(float)points.getJSONObject(i).getDouble("y");coords[i].pressure=1;coords[i].size=1;}long now=SystemClock.uptimeMillis();MotionEvent event=MotionEvent.obtain(d.optLong("down",now),now,d.getInt("action"),points.length(),props,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);try{return p.viewport.dispatchTouchEvent(event);}finally{event.recycle();}}
            case "editorReadOnly":{JSONArray paths=d.getJSONArray("paths");for(Pane p:panes.values())if(p.buffer!=null)for(int i=0;i<paths.length();i++)if(p.buffer.path.equals(paths.getString(i)))p.editor.setEditable(!d.optBoolean("readonly"));return true;}
            case "editorReset":{for(Pane p:panes.values()){p.editor.release();app.editorRoot.removeView(p.viewport);}panes.clear();buffers.clear();active=null;floatingKeyboard.clearModifiers();floatingKeyboard.dragOwner=null;return object("keyboardRevision",floatingKeyboard.settingsRevision);}
            case "editorWebInput":webFieldFocused=d.optBoolean("focused");if(webFieldFocused){app.web.requestFocus();if(floatingKeyboard.enabled){((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(app.web.getWindowToken(),0);floatingKeyboard.show();}}return true;
            case "editorLayout":{
                windowResizeHandles.update(d.optJSONArray("windowHandles"));occlusions=d.optJSONArray("occlusions");if(occlusions==null)occlusions=new JSONArray();
                visible=d.optBoolean("visible",true);JSONArray list=d.optJSONArray("panes");Set<String> present=new HashSet<>();
                if(d.optJSONObject("settings")!=null){JSONObject next=d.getJSONObject("settings");if(d.optLong("keyboardRevision")<floatingKeyboard.settingsRevision)for(String key:new String[]{"keyboardPrimary","keyboardLayout","keyboardModifiers","keyboardNumpad","keyboardPcWidth","keyboardPcHeight","keyboardAndroidWidth","keyboardAndroidHeight"})if(settings.has(key))next.put(key,settings.get(key));settings=next;}floatingKeyboard.applySettings(settings);
                if(list!=null)for(int i=0;i<list.length();i++){JSONObject rect=list.getJSONObject(i);String id=rect.getString("id");present.add(id);Pane p=panes.get(id);if(p==null){p=new Pane(id);panes.put(id,p);}p.x=(float)rect.optDouble("x");p.y=(float)rect.optDouble("y");p.w=(float)rect.optDouble("width");p.h=(float)rect.optDouble("height");p.layoutVisible=rect.optBoolean("visible",true);p.masks=rect.optJSONArray("occlusions");if(p.masks==null)p.masks=occlusions;p.z=rect.optInt("z");configure(p);}
                for(String id:new ArrayList<>(panes.keySet()))if(!present.contains(id)){Pane p=panes.remove(id);if(p.buffer!=null)flush(p.buffer);p.editor.release();app.editorRoot.removeView(p.viewport);if(active==p)active=null;}
                geometry();return true;
            }
            case "editorOpen":{
                Pane p=panes.get(d.getString("id"));if(p==null)return false;
                if(p.buffer!=null){if(((StudioCodeEditor)p.editor).currentInput!=null)((StudioCodeEditor)p.editor).currentInput.finishComposingText();flush(p.buffer);p.views.put(p.buffer.uri,new ViewState(p.editor));}
                String uri=d.optString("uri");if(uri.isEmpty()){p.buffer=null;p.viewport.setVisibility(View.GONE);return true;}
                Buffer b=buffers.get(uri);if(b==null){b=new Buffer(d);buffers.put(uri,b);}
                if(p.buffer!=b||p.language==null||!p.language.kind.equals(d.optString("language"))){StudioLanguage next=new StudioLanguage(p,d.optString("language"));p.muted=true;try{((StudioCodeEditor)p.editor).typing=next.typing;p.editor.setEditorLanguage(next);Pane previous=source(b);Content content=b.document.open(previous!=null);p.editor.setText(content);var separator=content.getLine(0).getLineSeparator();p.editor.setLineSeparator(separator.getLength()>0?separator:LineSeparator.LF);p.editor.setDiagnostics(new DiagnosticsContainer());p.language=next;p.buffer=b;((StudioCodeEditor)p.editor).breakpointLines=Collections.emptySet();((StudioCodeEditor)p.editor).executionLine=-1;if(b.analysisRevision==b.revision)next.analysis(b.analysis);ViewState v=p.views.get(uri);if(v==null&&previous!=null)v=new ViewState(previous.editor);if(v!=null){var a=content.getIndexer().getCharPosition(Math.min(v.left,content.length()));var z=content.getIndexer().getCharPosition(Math.min(v.right,content.length()));p.editor.setSelectionRegion(a.line,a.column,z.line,z.column);p.editor.getScroller().startScroll(v.x,v.y,0,0,0);p.editor.getScroller().abortAnimation();}}finally{p.muted=false;}}
                ((StudioCodeEditor)p.editor).typingOptions(d.optJSONObject("typing"));
                p.editor.setEditable(!d.optBoolean("readonly"));geometry();emitSelection(p);return snapshot(b);
            }
            case "editorSnapshot":{JSONArray result=new JSONArray();JSONObject known=d.optJSONObject("known");for(Buffer b:buffers.values())if(!d.has("uri")||d.optString("uri").equals(b.uri)){if(known!=null&&known.optLong(b.uri,-1)==b.revision)flush(b);else result.put(snapshot(b));}return result;}
            case "editorForget":{Buffer b=buffers.remove(d.optString("uri"));if(b!=null)for(Pane p:panes.values()){p.views.remove(b.uri);if(p.buffer==b){p.buffer=null;p.viewport.setVisibility(View.GONE);}}return true;}
            case "editorEdits":{
                Buffer b=buffers.get(d.optString("uri"));if(b==null)return true;
                if(b.revision!=d.optLong("revision")){app.event("editorResync",snapshot(b));return false;}
                JSONArray edits=d.getJSONArray("edits");for(int i=0;i<edits.length();i++){JSONObject e=edits.getJSONObject(i);mapViews(b,e.getInt("start"),e.getInt("end"),e.getString("text").length());}applying=true;
                try{b.document.edit(views(b),c->{try{for(int i=0;i<edits.length();i++){JSONObject e=edits.getJSONObject(i);replace(c,e.getInt("start"),e.getInt("end"),e.getString("text"));}}catch(JSONException error){throw new IllegalArgumentException(error);}});for(Pane p:panes.values())if(p.buffer==b)p.editor.notifyIMEExternalCursorChange();}finally{applying=false;}
                b.revision++;snapshot(b);return b.revision;
            }
            case "editorSelection":{Pane p=panes.get(d.optString("id"));if(p==null||p.buffer==null)return false;int line=d.optInt("line",1)-1,col=d.optInt("column",1)-1;Content c=p.editor.getText();line=Math.max(0,Math.min(c.getLineCount()-1,line));col=Math.max(0,Math.min(c.getColumnCount(line),col));if(d.has("endLine")){int el=Math.max(0,Math.min(c.getLineCount()-1,d.getInt("endLine")-1));p.editor.setSelectionRegion(line,col,el,Math.min(c.getColumnCount(el),Math.max(0,d.optInt("endColumn",1)-1)));}else p.editor.setSelection(line,col);p.editor.notifyIMEExternalCursorChange();return true;}
            case "editorFocus":{Pane p=panes.get(d.optString("id"));if(p!=null){webFieldFocused=false;active=p;p.editor.requestFocus();if(d.optBoolean("keyboard"))showKeyboard();}return true;}
            case "editorAction":{Pane p=panes.get(d.optString("id"));if(p!=null){active=p;action(d.optString("action"));}return true;}
            case "editorAnalysis":{Buffer b=buffers.get(d.optString("uri"));if(b==null||b.revision!=d.optLong("revision"))return false;if(b.analysisRevision!=b.revision){b.analysis=new JSONObject();b.analysisRevision=b.revision;}for(String field:new String[]{"styles","unusedStyles","diagnostics","hints"})if(d.has(field))b.analysis.put(field,d.get(field));for(Pane p:panes.values())if(p.buffer==b&&p.language!=null)p.language.analysis(d);return true;}
            case "editorTypingOptions":{for(Pane p:panes.values())if(p.buffer!=null&&p.buffer.uri.equals(d.optString("uri")))((StudioCodeEditor)p.editor).typingOptions(d.optJSONObject("typing"));return true;}
            case "editorFormatEdits":{
                Pane p=panes.get(d.optString("id"));if(p==null||p.buffer==null||!p.buffer.uri.equals(d.optString("uri")))return false;Buffer b=p.buffer;var cursor=p.editor.getCursor();
                if(b.revision!=d.optLong("revision")||cursor.getLeft()!=d.optInt("expectedStart")||cursor.getRight()!=d.optInt("expectedEnd"))return false;
                handle("editorEdits",d);var pos=p.editor.getText().getIndexer().getCharPosition(Math.max(0,Math.min(p.editor.getText().length(),d.optInt("cursor"))));p.editor.setSelection(pos.line,pos.column);p.editor.notifyIMEExternalCursorChange();app.event("editorResync",snapshot(b));return true;
            }
            case "editorDecorations":{for(Pane p:panes.values())if(p.buffer!=null&&p.buffer.uri.equals(d.optString("uri"))&&p.language!=null){p.language.breakpoints=d.optJSONArray("breakpoints");p.language.execution=d.optInt("execution",0)-1;Set<Integer> points=new HashSet<>();if(p.language.breakpoints!=null)for(int i=0;i<p.language.breakpoints.length();i++)points.add(p.language.breakpoints.optInt(i)-1);((StudioCodeEditor)p.editor).breakpointLines=points;((StudioCodeEditor)p.editor).executionLine=p.language.execution;p.editor.invalidate();p.language.lexer.rerun();}return true;}
            case "editorCapture":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)return false;return captureEditor();}
            case "editorVisualState":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;Styles styles=p.editor.getStyles();return object("language",p.language==null?"":p.language.kind,"indent",((StudioCodeEditor)p.editor).typing==null?0:((StudioCodeEditor)p.editor).typing.options.indent,"tabWidth",p.editor.getTabWidth(),"sideIcons",p.editor.getRenderer().hasSideHintIcons(),"breakpoints",new JSONArray(((StudioCodeEditor)p.editor).breakpointLines),"executionLine",((StudioCodeEditor)p.editor).executionLine,"textOffset",p.editor.measureTextRegionOffset()*p.editor.getScaleX(),"guides",styles==null||styles.blocks==null?0:styles.blocks.size(),"guideColor",p.editor.getColorScheme().getColor(EditorColorScheme.BLOCK_LINE),"previewRatio",((StudioCodeEditor)p.editor).zoomRatio,"preview",((StudioCodeEditor)p.editor).zoomActive,"accessory",object("visible",accessory.isShown(),"left",accessory.getLeft(),"top",accessory.getTop(),"width",accessory.getWidth(),"height",accessory.getHeight()),"diagnosticPopup",p.editor.getComponent(io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow.class).isShowing(),"offsetX",p.editor.getOffsetX()*p.editor.getScaleX(),"offsetY",p.editor.getOffsetY()*p.editor.getScaleY(),"fontPx",p.editor.getTextSizePx()*p.editor.getScaleX(),"layoutFontPx",p.editor.getTextSizePx(),"rowHeight",p.editor.getRowHeight()*p.editor.getScaleY(),"layoutRowHeight",p.editor.getRowHeight(),"left",p.viewport.getLeft(),"top",p.viewport.getTop(),"viewScaleX",p.editor.getScaleX(),"viewScaleY",p.editor.getScaleY(),"maxY",p.editor.getScrollMaxY()*p.editor.getScaleY(),"layoutHeight",p.editor.getLayout().getLayoutHeight()*p.editor.getScaleY(),"maxX",p.editor.getScrollMaxX()*p.editor.getScaleX(),"layoutWidth",p.editor.getLayout().getLayoutWidth()*p.editor.getScaleX(),"visible",p.editor.isShown(),"width",p.viewport.getWidth(),"height",p.viewport.getHeight(),"innerWidth",p.editor.getWidth(),"requestedWidth",p.editor.getLayoutParams().width,"measuredWidth",p.editor.getMeasuredWidth(),"layoutRequested",p.editor.isLayoutRequested(),"innerHeight",p.editor.getHeight(),"screenX",screenPoint(p.viewport,0),"screenY",screenPoint(p.viewport,1),"occlusions",p.masks,"paneVisible",p.layoutVisible,"z",p.z);}
            case "editorTestAnalysisState":{
                if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;
                Pane p=panes.get(d.optString("id","primary"));if(p==null||p.buffer==null||p.language==null)return false;
                Styles spans=p.editor.getStyles();boolean current=spans instanceof RevisionStyles&&((RevisionStyles)spans).owner==p.editor.getText()&&((RevisionStyles)spans).revision==p.editor.getText().getDocumentVersion();
                List<DiagnosticRegion> actual=new ArrayList<>();if(p.editor.getDiagnostics()!=null)p.editor.getDiagnostics().queryInRegion(actual,0,p.editor.getText().length());
                int paintedUnused=0;if(current)for(int i=0;i<p.language.unusedStyles.length();i++){int offset=p.language.unusedStyles.getJSONObject(i).optInt("start");if(offset<0||offset>=p.editor.getText().length())continue;var at=p.editor.getText().getIndexer().getCharPosition(offset);Span found=null;for(Span span:spans.spans.read().getSpansOnLine(at.line)){if(span.getColumn()>at.column)break;found=span;}if(found!=null&&found.getForegroundColorId()==UNUSED)paintedUnused++;}
                return object("revision",p.buffer.revision,"analysisRevision",p.buffer.analysisRevision,"documentVersion",p.editor.getText().getDocumentVersion(),"stylesCurrent",current,"diagnostics",actual.size(),"unused",p.language.unusedStyles.length(),"paintedUnused",paintedUnused,"semantic",p.language.styles.length(),"length",p.editor.getText().length());
            }
            case "editorFloatingKeyboard":{floatingKeyboard.setEnabled(d.optBoolean("enabled",!floatingKeyboard.enabled),d.optBoolean("system",false));if(d.optBoolean("show",true)&&floatingKeyboard.enabled)floatingKeyboard.show();return true;}
            case "editorTestFloatingKeyboard":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;return floatingKeyboard.state();}
            case "editorTestHardwareKey":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-"))return false;long now=SystemClock.uptimeMillis();return app.dispatchKeyEvent(new KeyEvent(now,now,d.optInt("action"),d.getInt("key"),d.optInt("repeat"),d.optInt("meta"),0,0,0,InputDevice.SOURCE_KEYBOARD));}
            case "editorTestGutterPoint":{if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-")||settings.optBoolean("wordWrap"))return false;Pane p=panes.get(d.optString("id","primary"));if(p==null)return false;int row=Math.max(0,d.optInt("line",1)-1);return object("x",screenPoint(p.viewport,0)+p.editor.measureLineNumber()/2*p.editor.getScaleX(),"y",screenPoint(p.viewport,1)+((p.editor.getRowTop(row)+p.editor.getRowBottom(row))/2f-p.editor.getOffsetY())*p.editor.getScaleY());}
            case "editorTestKeyboardTouch":{
                if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0||!app.engine.currentProject.startsWith("input-check-")||!floatingKeyboard.frame.isShown())return false;
                JSONArray points=d.getJSONArray("points");int count=points.length();if(count<1||count>5)return false;int[] origin=new int[2];app.editorRoot.getLocationOnScreen(origin);
                MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[count];MotionEvent.PointerCoords[] coordinates=new MotionEvent.PointerCoords[count];
                for(int i=0;i<count;i++){JSONObject point=points.getJSONObject(i);properties[i]=new MotionEvent.PointerProperties();properties[i].id=point.optInt("id",i);properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coordinates[i]=new MotionEvent.PointerCoords();coordinates[i].x=(float)point.getDouble("x")-origin[0];coordinates[i].y=(float)point.getDouble("y")-origin[1];coordinates[i].pressure=coordinates[i].size=1;}
                int action=d.getInt("action")|(d.optInt("index")<<MotionEvent.ACTION_POINTER_INDEX_SHIFT);long now=SystemClock.uptimeMillis();MotionEvent event=MotionEvent.obtain(now,now,action,count,properties,coordinates,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);try{return app.editorRoot.dispatchTouchEvent(event);}finally{event.recycle();}
            }
            case "editorCompletionResult":{CompletableFuture<JSONArray> future=completions.remove(d.optString("request"));if(future!=null)future.complete(d.optJSONArray("items"));return true;}
        }
        throw new IllegalArgumentException(op);
    }
    static void replace(Content c,int start,int end,String text){var a=c.getIndexer().getCharPosition(start);var z=c.getIndexer().getCharPosition(end);c.replace(a.line,a.column,z.line,z.column,text);}
    String captureEditor(){
        int[] point=new int[2];app.editorRoot.getLocationInWindow(point);
        Bitmap bitmap=Bitmap.createBitmap(app.editorRoot.getWidth(),app.editorRoot.getHeight(),Bitmap.Config.ARGB_8888);
        Rect rect=new Rect(point[0],point[1],point[0]+bitmap.getWidth(),point[1]+bitmap.getHeight());
        java.io.File file=new java.io.File(app.getCacheDir(),"studio-window.png");
        PixelCopy.request(app.getWindow(),rect,bitmap,result->{try{
            if(result!=PixelCopy.SUCCESS){app.event("editorCaptureReady",object("error",result));return;}
            // PixelCopy includes the main app window only. Add our own process's
            // popup windows, without capturing Android's status/navigation bars.
            if(Build.VERSION.SDK_INT>=29){Canvas canvas=new Canvas(bitmap);int[] origin=new int[2];app.editorRoot.getLocationOnScreen(origin);
                for(View root:android.view.inspector.WindowInspector.getGlobalWindowViews()){
                    if(root==app.getWindow().getDecorView()||!root.isShown())continue;
                    int[] location=new int[2];root.getLocationOnScreen(location);int saved=canvas.save();canvas.translate(location[0]-origin[0],location[1]-origin[1]);root.draw(canvas);canvas.restoreToCount(saved);
                }
            }
            try(java.io.OutputStream out=new java.io.FileOutputStream(file)){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}
            app.event("editorCaptureReady",object("path",file.getAbsolutePath()));
        }catch(Exception e){app.event("editorCaptureReady",object("error",e.toString()));}finally{bitmap.recycle();}},app.ui);
        return file.getAbsolutePath();
    }
    void configure(Pane p){
        String configurationKey=settings.optString("theme")+":"+settings.optString("language")+":"+settings.optDouble("fontSize",14)+":"+settings.optDouble("codeScale",100)+":"+settings.optBoolean("wordWrap")+":"+settings.optBoolean("indentGuides",true)+":"+settings.optBoolean("smartTyping",true)+":"+settings.optBoolean("completionEnabled",true)+":"+app.web.getScale();if(configurationKey.equals(p.configured))return;p.configured=configurationKey;
        float scale=app.web.getScale();if(scale<=0)scale=app.getResources().getDisplayMetrics().density;
        float font=(float)(settings.optDouble("fontSize",14)*scale);
        if(SystemClock.uptimeMillis()>((StudioCodeEditor)p.editor).fontGestureUntil&&Math.abs(p.editor.getTextSizePx()-font)>.1f){((StudioCodeEditor)p.editor).configuringFont=true;try{p.editor.setTextSizePx(font);}finally{((StudioCodeEditor)p.editor).configuringFont=false;}}
        if(!((StudioCodeEditor)p.editor).zoomActive&&SystemClock.uptimeMillis()>((StudioCodeEditor)p.editor).fontGestureUntil){float visual=(float)Math.max(.5,Math.min(2.5,settings.optDouble("codeScale",100)/100));p.editor.setPivotX(0);p.editor.setPivotY(0);p.editor.setScaleX(visual);p.editor.setScaleY(visual);}
        if(SystemClock.uptimeMillis()<=((StudioCodeEditor)p.editor).fontGestureUntil&&!((StudioCodeEditor)p.editor).zoomActive){p.configured="";if(!p.deferredConfig){p.deferredConfig=true;p.editor.postDelayed(()->{p.deferredConfig=false;configure(p);geometry();},100);}}
        p.editor.setScaleTextSizes((float)(settings.optDouble("fontSize",14)*scale*.5),(float)(settings.optDouble("fontSize",14)*scale*2.5));
        boolean barLight=settings.optString("theme").equals("forge-light");accessory.setBackgroundColor(Color.parseColor(barLight?"#F7F8FA":"#2B2D30"));LinearLayout keys=(LinearLayout)accessory.getChildAt(0);for(int i=0;i<keys.getChildCount();i++){View key=keys.getChildAt(i);int tint=Color.parseColor(barLight?"#1E1F22":"#BCBEC4");if(key instanceof ImageView)((ImageView)key).setImageTintList(android.content.res.ColorStateList.valueOf(tint));else if(key instanceof TextView)((TextView)key).setTextColor(tint);String action=String.valueOf(key.getContentDescription());String[] a={"left","right","up","down","tab","copy","paste","undo","redo"},ru={"Влево","Вправо","Вверх","Вниз","Отступ Tab","Копировать","Вставить","Отменить","Повторить"},en={"Left","Right","Up","Down","Indent Tab","Copy","Paste","Undo","Redo"};String label=action;for(int j=0;j<a.length;j++)if(a[j].equals(action))label=settings.optString("language").equals("en")?en[j]:ru[j];key.setTooltipText(label);}
        if(p.language!=null)p.language.typing.enabled=settings.optBoolean("smartTyping",true);p.editor.getComponent(EditorAutoCompletion.class).setEnabled(settings.optBoolean("completionEnabled",true));
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
    static int screenPoint(View view,int axis){int[] point=new int[2];view.getLocationOnScreen(point);return point[axis];}
    void geometry(){
        if(floatingKeyboardButton!=null){String tip=floatingKeyboard.enabled?floatingKeyboard.label("Системная клавиатура","System keyboard"):floatingKeyboard.label("Плавающая клавиатура","Floating keyboard");if(!tip.contentEquals(floatingKeyboardButton.getContentDescription())){floatingKeyboardButton.setContentDescription(tip);floatingKeyboardButton.setTooltipText(tip);}}
        float scale=app.web.getScale();if(scale<=0)scale=app.getResources().getDisplayMetrics().density;
        boolean imeChanged=previousImeHeight!=app.imeHeight;previousImeHeight=app.imeHeight;
        if(imeChanged&&app.imeHeight>0&&floatingKeyboard.enabled)floatingKeyboard.hideSystemKeyboard();
        int bar=!floatingKeyboard.enabled&&app.imeHeight>0&&visible&&active!=null&&active.editor.hasFocus()&&settings.optBoolean("keyboardExtraKeys",true)?Math.round(42*app.getResources().getDisplayMetrics().density):0;
        int bottom=app.editorRoot.getHeight()-app.imeHeight-bar;
        for(Pane p:panes.values()){
            int left=Math.round(p.x*scale),top=Math.round(p.y*scale),width=Math.round(p.w*scale),height=Math.round(p.h*scale);
            List<RectF> holes=new ArrayList<>(),touchHoles=new ArrayList<>();for(int i=0;i<p.masks.length();i++){JSONObject r=p.masks.optJSONObject(i);if(r!=null){RectF rect=new RectF((float)r.optDouble("x")*scale-left,(float)r.optDouble("y")*scale-top,(float)(r.optDouble("x")+r.optDouble("width"))*scale-left,(float)(r.optDouble("y")+r.optDouble("height"))*scale-top);if(r.optBoolean("touch",true))touchHoles.add(rect);if(r.optBoolean("paint",true))holes.add(rect);}}((StudioCodeEditor)p.editor).occlusions=holes;((StudioCodeEditor)p.editor).touchOcclusions=touchHoles;p.editor.invalidate();p.viewport.setZ(p.z);
            // The shell keeps its selected overlay percentage; only the input viewport avoids the IME.
            height=Math.min(height,Math.max(0,bottom-top));
            boolean show=visible&&p.layoutVisible&&p.buffer!=null&&width>1&&height>1;p.viewport.setVisibility(show?View.VISIBLE:View.GONE);
            FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)p.viewport.getLayoutParams();
            if(lp.leftMargin!=left||lp.topMargin!=top||lp.width!=width||lp.height!=height){lp.leftMargin=left;lp.topMargin=top;lp.width=Math.max(1,width);lp.height=Math.max(1,height);p.viewport.setLayoutParams(lp);}
            if(!((StudioCodeEditor)p.editor).zoomActive){FrameLayout.LayoutParams child=(FrameLayout.LayoutParams)p.editor.getLayoutParams();int cw=Math.max(1,Math.round(width/p.editor.getScaleX())),ch=Math.max(1,Math.round(height/p.editor.getScaleY()));if(child.width!=cw||child.height!=ch){child.width=cw;child.height=ch;p.editor.setLayoutParams(child);if(p.resizeAnchor!=null)p.editor.postOnAnimation(()->restoreResizeAnchor(p));}}
        }
        boolean barCovered=false,popupOpen=!visible;for(int i=0;i<occlusions.length();i++){JSONObject r=occlusions.optJSONObject(i);if(r!=null&&r.optBoolean("paint",true)){if(r.optBoolean("popup",true))popupOpen=true;float rt=(float)r.optDouble("y")*scale,rb=(float)(r.optDouble("y")+r.optDouble("height"))*scale;if(rt<bottom+bar&&rb>bottom)barCovered=true;}}
        windowResizeHandles.geometry(visible&&!popupOpen,scale);
        if(popupOpen)for(Pane pane:panes.values()){pane.editor.getComponent(EditorAutoCompletion.class).hide();pane.editor.getComponent(io.github.rosemoe.sora.widget.component.EditorDiagnosticTooltipWindow.class).dismiss();pane.editor.getComponent(io.github.rosemoe.sora.widget.component.EditorTextActionWindow.class).dismiss();}
        if(floatingKeyboard.enabled){floatingKeyboard.geometry(visible&&!popupOpen);if(imeChanged&&active!=null)reveal(active);return;}
        floatingKeyboard.geometry(false);accessory.setVisibility(bar>0&&!barCovered?View.VISIBLE:View.GONE);
        if(bar>0){FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)accessory.getLayoutParams();lp.height=bar;lp.gravity=Gravity.TOP;lp.topMargin=Math.max(0,bottom);accessory.setLayoutParams(lp);accessory.bringToFront();}
        if(imeChanged&&active!=null)reveal(active);
    }
    void restoreResizeAnchor(Pane p){ViewState anchor=p.resizeAnchor;if(anchor==null||p.buffer!=p.resizeBuffer)return;int x=Math.min(anchor.x,p.editor.getScrollMaxX()),y=Math.min(anchor.y,p.editor.getScrollMaxY());p.editor.getScroller().startScroll(x,y,0,0,0);p.editor.getScroller().abortAnimation();p.editor.invalidate();}
    void reveal(Pane p){Buffer expected=p.buffer;if(p.resizeAnchor==null&&p.editor.hasFocus()&&app.imeHeight>0&&!((StudioCodeEditor)p.editor).zoomActive&&SystemClock.uptimeMillis()>((StudioCodeEditor)p.editor).fontGestureUntil)p.editor.post(()->{if(p.resizeAnchor==null&&p.buffer==expected&&expected!=null&&!((StudioCodeEditor)p.editor).zoomActive&&SystemClock.uptimeMillis()>((StudioCodeEditor)p.editor).fontGestureUntil)p.editor.ensureSelectionVisible();});}
    void showKeyboard(){if(webFieldFocused){if(floatingKeyboard.enabled)floatingKeyboard.show();else ((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(app.web,InputMethodManager.SHOW_IMPLICIT);return;}if(active==null)return;active.editor.requestFocus();if(floatingKeyboard.enabled){floatingKeyboard.show();return;}((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(active.editor,InputMethodManager.SHOW_FORCED);geometry();}
    void createAccessory(){
        accessory=new HorizontalScrollView(app);accessory.setHorizontalScrollBarEnabled(false);accessory.setFillViewport(false);accessory.setBackgroundColor(Color.rgb(43,45,48));
        LinearLayout row=new LinearLayout(app);row.setOrientation(LinearLayout.HORIZONTAL);accessory.addView(row);app.editorRoot.addView(accessory,new FrameLayout.LayoutParams(-1,1));accessory.setVisibility(View.GONE);accessory.setZ(90*app.getResources().getDisplayMetrics().density);
        String[][] keys={{"keyboard_float","floatingKeyboard"},{"Tab","tab"},{"arrow_left","left"},{"arrow_down","down"},{"arrow_up","up"},{"arrow_right","right"},{"braces","{}"},{"parentheses","()"},{"brackets","[]"},{";",";"},{"\"","\""},{"&","&"},{"*","*"},{"undo_2","undo"},{"redo_2","redo"},{"copy","copy"},{"clipboard_paste","paste"}};
        for(String[] k:keys){View key;int icon=app.getResources().getIdentifier("ic_"+k[0],"drawable",app.getPackageName());
            if(icon!=0){ImageView image=new ImageView(app);image.setImageResource(icon);image.setScaleType(ImageView.ScaleType.CENTER_INSIDE);int pad=Math.round(11*app.getResources().getDisplayMetrics().density);image.setPadding(pad,pad,pad,pad);key=image;}else{TextView text=new TextView(app);text.setText(k[0]);text.setTextColor(Color.rgb(188,190,196));text.setTextSize(16);text.setGravity(Gravity.CENTER);key=text;}
            key.setContentDescription(k[1]);
            if(k[1].equals("floatingKeyboard"))floatingKeyboardButton=key;
            key.setTag(k[1]);
            android.graphics.drawable.GradientDrawable mask=new android.graphics.drawable.GradientDrawable();mask.setColor(Color.WHITE);mask.setCornerRadius(6*app.getResources().getDisplayMetrics().density);
            key.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(30,135,154,185)),null,mask));
            key.setClickable(true);key.setOnClickListener(v->action(k[1]));int dp=Math.round(44*app.getResources().getDisplayMetrics().density);row.addView(key,new LinearLayout.LayoutParams(dp,-1));
            final View button=key;
            key.setOnTouchListener(new View.OnTouchListener(){
                float x,y;boolean cancelled,repeated;final int slop=ViewConfiguration.get(app).getScaledTouchSlop();
                final Runnable press=()->button.setPressed(true);
                final Runnable repeat=new Runnable(){public void run(){if(cancelled||!button.isAttachedToWindow())return;repeated=true;action(k[1]);app.ui.postDelayed(this,65);}};
                void clear(){button.setPressed(false);app.ui.removeCallbacks(repeat);app.ui.removeCallbacks(press);}
                public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){
                    case MotionEvent.ACTION_DOWN:x=e.getRawX();y=e.getRawY();cancelled=false;repeated=false;app.ui.postDelayed(press,80);if(Arrays.asList("left","right","up","down").contains(k[1]))app.ui.postDelayed(repeat,380);return true;
                    case MotionEvent.ACTION_MOVE:if(Math.hypot(e.getRawX()-x,e.getRawY()-y)>slop){cancelled=true;clear();}return true;
                    case MotionEvent.ACTION_UP:clear();if(!cancelled&&!repeated)v.performClick();return true;
                    case MotionEvent.ACTION_CANCEL:cancelled=true;clear();return true;
                    default:return true;
                }}
            });
        }
    }
    void action(String action){
        if(action.equals("floatingKeyboard")){floatingKeyboard.setEnabled(!floatingKeyboard.enabled,true);return;}
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
        StudioLanguage(Pane p,String kind){pane=p;this.kind=kind;typing=new SmartTyping(kind);typing.enabled=settings.optBoolean("smartTyping",true);}
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
            final Content expectedContent=pane.editor.getText();final long expectedVersion=expectedContent.getDocumentVersion();
            String request=String.valueOf(requestSequence.incrementAndGet());CompletableFuture<JSONArray> f=new CompletableFuture<>();completions.put(request,f);
            app.ui.post(()->{if(pane.buffer!=null){flush(pane.buffer);app.event("editorCompletion",object("request",request,"uri",pane.buffer.uri,"revision",pane.buffer.revision,"line",pos.line,"column",pos.column));}});
            try{JSONArray items=f.get(3000,TimeUnit.MILLISECONDS);publisher.setUpdateThreshold(101);if(items!=null)for(int i=0;i<items.length();i++){publisher.checkCancelled();JSONObject item=items.getJSONObject(i);final JSONObject value=item;
                CompletionItem completion=new CompletionItem(item.optString("label"),item.optString("detail")){
                    @Override public void performCompletion(CodeEditor editor,Content text,int line,int column){performCompletion(editor,text,text.getIndexer().getCharPosition(line,column));}
                    @Override public void performCompletion(CodeEditor editor,Content text,CharPosition position){
                        if(editor.getEditorLanguage()!=StudioLanguage.this||text!=expectedContent||text.getDocumentVersion()!=expectedVersion){editor.getComponent(EditorAutoCompletion.class).hide();return;}
                        try{int end=value.optInt("end",position.index),start=value.optInt("start",position.index),index=start;String insert=value.optString("text");replace(text,start,end,"");
                            JSONArray extra=value.optJSONArray("additional");if(extra!=null)for(int j=0;j<extra.length();j++){JSONObject e=extra.getJSONObject(j);int a=e.getInt("start"),z=e.getInt("end");String s=e.getString("text");replace(text,a,z,s);if(a<=index)index+=s.length()-(z-a);}
                            if(value.optBoolean("snippet"))editor.getSnippetController().startSnippet(index,CodeSnippetParser.parse(insert),null);else{var p=text.getIndexer().getCharPosition(index);text.insert(p.line,p.column,insert);var c=text.getIndexer().getCharPosition(index+insert.length());editor.setSelection(c.line,c.column);}
                        }catch(Exception error){android.util.Log.w("Studio","Completion",error);}
                    }
                };completion.sortText=item.optString("sortText");publisher.addItem(completion);
            }publisher.updateList();}catch(InterruptedException e){Thread.currentThread().interrupt();}catch(TimeoutException|CancellationException ignored){}catch(Exception error){if(!(error instanceof CompletionCancelledException))android.util.Log.w("Studio","Completion",error);}finally{completions.remove(request);app.ui.post(()->app.event("editorCompletionCancel",object("request",request)));}
        }
        final class Lexer extends SimpleAnalyzeManager<Void> {
            final Pattern tokens=Pattern.compile("//[^\\n]*|/\\*[\\s\\S]*?(?:\\*/|$)|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\\b(?:0[xX][0-9a-fA-F']+|[0-9][0-9a-zA-Z'.]*)\\b|[a-zA-Z_][a-zA-Z_0-9]*|#[^\\n]*|\\$\\{[^}]*\\}");
            @Override protected Styles analyze(StringBuilder text,Delegate<Void> delegate){
                Content owner=pane.editor.getText();long revision=owner.getDocumentVersion();int[] colors=new int[text.length()+1];Arrays.fill(colors,EditorColorScheme.TEXT_NORMAL);Matcher m=tokens.matcher(text);
                while(!kind.equals("plaintext")&&m.find()){if(delegate.isCancelled())return null;String token=m.group();int color=EditorColorScheme.TEXT_NORMAL;
                    if(token.startsWith("//")||token.startsWith("/*")||(token.startsWith("#")&&!kind.equals("cpp")&&!kind.equals("c")))color=EditorColorScheme.COMMENT;
                    else if(token.startsWith("\"")||token.startsWith("'"))color=STRING;
                    else if(Character.isDigit(token.charAt(0)))color=NUMBER;
                    else if(keywords.contains(token)||token.startsWith("#"))color=EditorColorScheme.KEYWORD;
                    else if(token.startsWith("${"))color=TYPE;
                    else{int i=m.end();while(i<text.length()&&Character.isWhitespace(text.charAt(i)))i++;if(i<text.length()&&text.charAt(i)=='(')color=EditorColorScheme.FUNCTION_NAME;}
                    Arrays.fill(colors,m.start(),m.end(),color);
                }
                for(JSONArray ranges:new JSONArray[]{styles,unusedStyles}){if(ranges==null||kind.equals("plaintext"))continue;for(int i=0;i<ranges.length();i++){JSONObject r=ranges.optJSONObject(i);if(r==null)continue;int a=Math.max(0,Math.min(text.length(),r.optInt("start"))),z=Math.max(a,Math.min(text.length(),r.optInt("end")));String type=r.optString("type");int color=type.equals("unused")?UNUSED:type.equals("function")||type.equals("method")?EditorColorScheme.FUNCTION_NAME:type.equals("keyword")?EditorColorScheme.KEYWORD:type.equals("string")?STRING:type.equals("number")?NUMBER:TYPE;Arrays.fill(colors,a,z,color);}}
                MappedSpans.Builder builder=new MappedSpans.Builder();int line=0,col=0,previous=-1;
                for(int i=0;i<=text.length();i++){if((i&4095)==0&&delegate.isCancelled())return null;int color=colors[i];if(col==0||color!=previous){builder.addIfNeeded(line,col,color);previous=color;}if(i<text.length()&&(text.charAt(i)=='\n'||text.charAt(i)=='\r')){if(text.charAt(i)=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;line++;col=0;previous=-1;}else col++;}
                builder.determine(line);Styles result=new RevisionStyles(builder.build(),owner,revision,StudioLanguage.this);result.setIndentCountMode(true);
                for(IndentGuides.Guide guide:IndentGuides.scan(text,typing.options.tab)){CodeBlock block=new CodeBlock();block.startLine=guide.first;block.endLine=guide.last;block.startColumn=block.endColumn=guide.column;block.toBottomOfEndLine=guide.toBottom;result.addCodeBlock(block);}JSONArray points=breakpoints;
                if(points!=null)for(int i=0;i<points.length();i++){int row=points.optInt(i)-1;if(row<0||row>line)continue;android.graphics.drawable.GradientDrawable dot=new android.graphics.drawable.GradientDrawable();dot.setShape(android.graphics.drawable.GradientDrawable.OVAL);dot.setColor(Color.rgb(219,88,96));dot.setSize(18,18);result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineBackground(row,new io.github.rosemoe.sora.lang.styling.color.ConstColor(Color.argb(24,219,88,96))));}
                if(execution>=0&&execution<=line){result.addLineStyle(new io.github.rosemoe.sora.lang.styling.line.LineBackground(execution,new io.github.rosemoe.sora.lang.styling.color.ConstColor(Color.rgb(38,69,107))));android.graphics.drawable.Drawable arrow=app.getDrawable(com.forgex.R.drawable.ic_arrow_right);arrow.setTint(Color.rgb(84,138,247));}
                result.finishBuilding();return result;
            }
        }
    }
}
