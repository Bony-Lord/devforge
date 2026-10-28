package dev.forge.ide;

import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.os.SystemClock;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.*;
import java.util.*;

/** In-app code keyboard. It does not register an Android input service. */
final class FloatingCodeKeyboard {
    final NativeEditorHost host;
    final MainActivity app;
    final SharedPreferences prefs;
    final FrameLayout frame;
    final LinearLayout stack,keys;
    final TextView handle;
    final TextView modifierToggle;
    final ArrayList<View> keyViews=new ArrayList<>();
    boolean enabled,shown,shift,caps,ctrl,alt,symbols,russian,light;
    long lastShift;
    String keyboardLocale="";
    int x=-1,y=-1,width,height;
    int bg,fg,keyBg,muted,accent;
    View dragOwner;
    String lastDrag="";
    long settingsRevision;
    final ArrayDeque<JSONObject> presentations=new ArrayDeque<>();
    boolean paintedVisible;
    long navigationChecked;
    boolean gestureNavigation;
    FloatingCodeKeyboard(NativeEditorHost host){
        this.host=host;app=host.app;prefs=app.getSharedPreferences("floating-keyboard",Context.MODE_PRIVATE);
        enabled=prefs.getBoolean("enabled",false);russian=prefs.getBoolean("russian",false);
        frame=new FrameLayout(app);frame.setClipChildren(false);frame.setElevation(dp(12));frame.setZ(dp(100));frame.setVisibility(View.GONE);
        stack=new LinearLayout(app);stack.setOrientation(LinearLayout.VERTICAL);stack.setPadding(dp(6),dp(3),dp(6),dp(6));frame.addView(stack,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(app);header.setGravity(Gravity.CENTER_VERTICAL);stack.addView(header,new LinearLayout.LayoutParams(-1,dp(32)));
        handle=new TextView(app);handle.setTag("move");handle.setGravity(Gravity.CENTER);handle.setTextSize(12);handle.setText("DevForge");handle.setContentDescription(label("Переместить клавиатуру","Move keyboard"));header.addView(handle,new LinearLayout.LayoutParams(0,-1,1));
        drag(handle,false);
        modifierToggle=new TextView(app);modifierToggle.setTag("modifiers");modifierToggle.setGravity(Gravity.CENTER);modifierToggle.setTextSize(11);modifierToggle.setPadding(dp(8),0,dp(8),0);modifierToggle.setOnClickListener(v->setModifierMode(modifierMode.equals("hold")?"sticky":"hold"));header.addView(modifierToggle,new LinearLayout.LayoutParams(-2,dp(30)));
        View system=icon(com.forgex.R.drawable.ic_keyboard,label("Системная клавиатура","System keyboard"),()->setEnabled(false,true));system.setTag("system");header.addView(system,new LinearLayout.LayoutParams(dp(34),dp(30)));
        View close=icon(com.forgex.R.drawable.ic_x,label("Скрыть клавиатуру","Hide keyboard"),this::hide);close.setTag("close");header.addView(close,new LinearLayout.LayoutParams(dp(34),dp(30)));
        keys=new KeyboardSurface();keys.setOrientation(LinearLayout.VERTICAL);stack.addView(keys,new LinearLayout.LayoutParams(-1,0,1));
        View resize=new View(app){final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);@Override protected void onDraw(Canvas canvas){paint.setColor(muted);paint.setStrokeWidth(dp(1));for(int i=1;i<4;i++)canvas.drawLine(getWidth()-dp(i*5),getHeight()-dp(3),getWidth()-dp(3),getHeight()-dp(i*5),paint);}};
        resize.setTag("resize");resize.setContentDescription(label("Изменить размер клавиатуры","Resize keyboard"));FrameLayout.LayoutParams grip=new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.BOTTOM|Gravity.RIGHT);frame.addView(resize,grip);drag(resize,true);
        edge("resize-left","left",Gravity.LEFT|Gravity.TOP,10,-1,36,24);edge("resize-right","right",Gravity.RIGHT|Gravity.TOP,10,-1,36,24);edge("resize-top","top",Gravity.TOP,-1,8,0,0);edge("resize-bottom","bottom",Gravity.BOTTOM,-1,10,0,0);edge("resize-bottomleft","bottomleft",Gravity.BOTTOM|Gravity.LEFT,24,24,0,0);resize.bringToFront();
        frame.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->updateGestureExclusions());
        app.editorRoot.addView(frame,new FrameLayout.LayoutParams(1,1));theme();rebuild();
        if((app.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)app.editorRoot.getViewTreeObserver().addOnDrawListener(()->{boolean visible=frame.isShown();if(visible!=paintedVisible){paintedVisible=visible;presentations.add(NativeEditorHost.object("time",SystemClock.uptimeMillis(),"visible",visible,"field",host.webFieldFocused,"width",frame.getWidth(),"height",frame.getHeight()));while(presentations.size()>100)presentations.removeFirst();}});
    }
    void updateGestureExclusions(){
        if(android.os.Build.VERSION.SDK_INT<29)return;
        int w=frame.getWidth(),h=frame.getHeight(),center=(h+dp(12))/2,half=Math.min(dp(80),Math.max(0,(h-dp(60))/2)),edge=dp(12),corner=Math.min(dp(24),h);
        frame.setSystemGestureExclusionRects(Arrays.asList(new Rect(0,center-half,edge,center+half),new Rect(w-edge,center-half,w,center+half),new Rect(0,h-corner,corner,h),new Rect(w-corner,h-corner,w,h)));
    }
    JSONObject event(String... values){JSONObject result=new JSONObject();try{for(int i=0;i<values.length;i+=2)result.put(values[i],values[i+1]);result.put("revision",++settingsRevision);}catch(JSONException impossible){throw new IllegalStateException(impossible);}return result;}
    int dp(float value){return Math.round(value*app.getResources().getDisplayMetrics().density);}
    int gestureMargin(boolean left){
        WindowInsets insets=app.editorRoot.getRootWindowInsets();
        int gesture=android.os.Build.VERSION.SDK_INT>=29&&insets!=null?(left?insets.getSystemGestureInsets().left:insets.getSystemGestureInsets().right):0;
        long now=SystemClock.uptimeMillis();
        if(navigationChecked==0||now-navigationChecked>2000){
            navigationChecked=now;
            try{gestureNavigation=android.provider.Settings.Secure.getInt(app.getContentResolver(),"navigation_mode",0)==2||android.provider.Settings.Global.getInt(app.getContentResolver(),"force_fsg_nav_bar",0)==1;}catch(SecurityException restricted){gestureNavigation=false;}
        }
        // Some OEMs return zero gesture insets for legacy-target applications.
        if(gestureNavigation)gesture=Math.max(gesture,dp(28));
        return Math.max(dp(6),gesture>0?gesture+dp(8):0);
    }
    int leftMargin(){return gestureMargin(true);}
    int rightMargin(){return gestureMargin(false);}
    int availableWidth(){return Math.max(1,app.editorRoot.getWidth()-leftMargin()-rightMargin());}
    void edge(String tag,String direction,int gravity,int width,int height,int top,int bottom){View view=new View(app);view.setTag(tag);view.setContentDescription(label("Изменить размер клавиатуры","Resize keyboard"));view.setTooltipText(label("Потяните край, чтобы изменить размер клавиатуры","Drag the edge to resize the keyboard"));FrameLayout.LayoutParams size=new FrameLayout.LayoutParams(width<0?-1:dp(width),height<0?-1:dp(height),gravity);size.topMargin=dp(top);size.bottomMargin=dp(bottom);frame.addView(view,size);drag(view,direction);}
    String label(String ru,String en){return host.settings.optString("language",Locale.getDefault().getLanguage()).startsWith("ru")?ru:en;}
    ImageView icon(int resource,String description,Runnable action){ImageView view=new ImageView(app);view.setImageResource(resource);view.setPadding(dp(7),dp(7),dp(7),dp(7));view.setContentDescription(description);view.setTooltipText(description);view.setOnClickListener(v->action.run());return view;}
    void setEnabled(boolean value,boolean showSystem){
        enabled=value;shown=value;clearModifiers();caps=false;try{host.settings.put("keyboardPrimary",value?"floating":"system");}catch(JSONException ignored){}config=settingsSignature(host.settings);prefs.edit().putBoolean("enabled",value).apply();
        for(var pane:host.panes.values())pane.editor.setSoftKeyboardEnabled(!value&&host.inputReady);
        if(value){((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(app.web.getWindowToken(),0);attachStrip();rebuild();}
        else{detachStrip();frame.setVisibility(View.GONE);}
        app.event("floatingKeyboardMode",event("mode",value?"floating":"system"));host.geometry();if(!value&&showSystem)host.showKeyboard();
    }
    void hideSystemKeyboard(){((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(app.editorRoot.getWindowToken(),0);}
    void show(){if(!enabled)return;hideSystemKeyboard();shown=true;attachStrip();host.geometry();}
    void hide(){shown=false;clearModifiers();refreshKeys();frame.setVisibility(View.GONE);}
    void attachStrip(){if(host.accessory.getParent()==stack)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);stack.addView(host.accessory,1,new LinearLayout.LayoutParams(-1,dp(42)));}
    void detachStrip(){if(host.accessory.getParent()==app.editorRoot)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);app.editorRoot.addView(host.accessory,new FrameLayout.LayoutParams(-1,1));}
    void geometry(boolean allowed){
        if(!enabled){if(host.accessory.getParent()!=app.editorRoot)detachStrip();frame.setVisibility(View.GONE);return;}
        attachStrip();theme();android.view.ViewGroup row=(android.view.ViewGroup)host.accessory.getChildAt(0);for(int i=0;i<row.getChildCount();i++){View button=row.getChildAt(i);boolean duplicate=Arrays.asList("tab","left","right","up","down").contains(String.valueOf(button.getTag()));button.setVisibility(duplicate?View.GONE:View.VISIBLE);}boolean show=shown&&(host.webFieldFocused||host.inputReady&&allowed&&host.active!=null&&host.active.buffer!=null);
        if(!show){frame.setVisibility(View.GONE);host.accessory.setVisibility(View.GONE);return;}
        int maxW=availableWidth(),maxH=Math.max(1,app.editorRoot.getHeight()-dp(12));
        if(width==0){String prefix=layout.equals("pc")?"keyboardPc":"keyboardAndroid";int wp=Math.max(15,Math.min(100,host.settings.optInt(prefix+"Width",layout.equals("pc")?95:65))),hp=Math.max(15,Math.min(95,host.settings.optInt(prefix+"Height",layout.equals("pc")?48:42)));width=Math.round(maxW*wp/100f);height=Math.round(maxH*hp/100f);x=leftMargin()+Math.round(prefs.getFloat("xRatio",.5f)*Math.max(0,maxW-width));y=Math.round(prefs.getFloat("yRatio",.95f)*Math.max(0,maxH-height));}
        width=Math.max(Math.min(dp(300),maxW),Math.min(width,maxW));height=Math.max(Math.min(dp(220),maxH),Math.min(height,maxH));x=Math.max(leftMargin(),Math.min(x,maxW-width+leftMargin()));y=Math.max(dp(6),Math.min(y,maxH-height+dp(6)));
        FrameLayout.LayoutParams bounds=(FrameLayout.LayoutParams)frame.getLayoutParams();if(bounds.width!=width||bounds.height!=height||bounds.leftMargin!=x||bounds.topMargin!=y){bounds.width=width;bounds.height=height;bounds.leftMargin=x;bounds.topMargin=y;frame.setLayoutParams(bounds);}frame.bringToFront();host.accessory.setVisibility(View.VISIBLE);frame.setVisibility(View.VISIBLE);
    }
    void theme(){
        boolean next=host.settings.optString("theme").equals("forge-light");String locale=host.settings.optString("language",Locale.getDefault().getLanguage());if(bg!=0&&next==light&&locale.equals(keyboardLocale))return;light=next;keyboardLocale=locale;
        bg=Color.parseColor(light?"#F1F3F6":"#2B2D30");fg=Color.parseColor(light?"#27282E":"#D3D6DD");keyBg=Color.parseColor(light?"#FFFFFF":"#373A40");muted=Color.parseColor(light?"#697382":"#8B93A1");accent=Color.parseColor(light?"#3574F0":"#75A4FF");
        GradientDrawable background=new GradientDrawable();background.setColor(bg);background.setCornerRadius(dp(10));background.setStroke(dp(1),Color.parseColor(light?"#C5CAD3":"#4A4F58"));frame.setBackground(background);handle.setTextColor(muted);if(modifierToggle!=null){GradientDrawable modeShape=new GradientDrawable();modeShape.setColor(keyBg);modeShape.setCornerRadius(dp(5));modeShape.setStroke(dp(1),Color.argb(65,Color.red(muted),Color.green(muted),Color.blue(muted)));modifierToggle.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(35,110,145,190)),modeShape,null));}
        handle.setContentDescription(label("Переместить клавиатуру","Move keyboard"));LinearLayout header=(LinearLayout)handle.getParent();for(int i=0;i<header.getChildCount();i++)if(header.getChildAt(i)instanceof ImageView){((ImageView)header.getChildAt(i)).setColorFilter(muted);String description="system".equals(header.getChildAt(i).getTag())?label("Системная клавиатура","System keyboard"):label("Скрыть клавиатуру","Hide keyboard");header.getChildAt(i).setContentDescription(description);header.getChildAt(i).setTooltipText(description);}
        if(keys.getChildCount()>0)refreshKeys();
    }
    static final class KeySpec {
        final String action,normal,upper;final int code;final TextView view;boolean down,used;long lastTap;int paintedBackground;
        KeySpec(String action,String normal,String upper,int code,TextView view){this.action=action;this.normal=normal;this.upper=upper;this.code=code;this.view=view;}
    }
    final ArrayList<KeySpec> specs=new ArrayList<>();
    final Set<String> latched=new HashSet<>(),locked=new HashSet<>(),held=new HashSet<>();
    String layout="pc",modifierMode="sticky",config="";boolean numpad=true,numLock=true;
    String settingsSignature(JSONObject value){return value.optString("keyboardLayout","pc")+":"+value.optString("keyboardModifiers","sticky")+":"+value.optBoolean("keyboardNumpad",true)+":"+value.optInt("keyboardPcWidth",95)+":"+value.optInt("keyboardPcHeight",48)+":"+value.optInt("keyboardAndroidWidth",65)+":"+value.optInt("keyboardAndroidHeight",42)+":"+value.optString("keyboardPrimary","system");}
    void applySettings(JSONObject value){
        String next=value.optString("keyboardLayout","pc"),mode=value.optString("keyboardModifiers","sticky");
        String signature=settingsSignature(value);
        if(signature.equals(config))return;config=signature;
        layout=next.equals("android")?"android":"pc";modifierMode=mode.equals("hold")?"hold":"sticky";numpad=value.optBoolean("keyboardNumpad",true);clearModifiers();width=height=0;
        boolean selected=value.optString("keyboardPrimary",prefs.getBoolean("enabled",false)?"floating":"system").equals("floating");
        if(selected!=enabled)setEnabled(selected,false);else{if(enabled)hideSystemKeyboard();rebuild();}
    }
    void clearModifiers(){cancelTouches();latched.clear();locked.clear();held.clear();ctrl=alt=shift=false;}
    int overrideMeta=-1;boolean overrideCaps;
    int modifierBit(String name){return name.equals("shift")?KeyEvent.META_SHIFT_ON:name.equals("ctrl")?KeyEvent.META_CTRL_ON:name.equals("alt")?KeyEvent.META_ALT_ON:KeyEvent.META_META_ON;}
    boolean mod(String name){return overrideMeta>=0?(overrideMeta&modifierBit(name))!=0:latched.contains(name)||locked.contains(name)||held.contains(name);}
    void setModifierMode(String mode){clearModifiers();modifierMode=mode;try{host.settings.put("keyboardModifiers",mode);}catch(JSONException ignored){}config=settingsSignature(host.settings);app.event("floatingKeyboardModifiers",event("mode",mode));refreshKeys();}

    boolean modifier(String name){return Arrays.asList("shift","ctrl","alt","meta").contains(name);}
    int meta(){return (mod("ctrl")?KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON:0)|(mod("alt")?KeyEvent.META_ALT_ON|KeyEvent.META_ALT_LEFT_ON:0)|(mod("shift")?KeyEvent.META_SHIFT_ON|KeyEvent.META_SHIFT_LEFT_ON:0)|(mod("meta")?KeyEvent.META_META_ON|KeyEvent.META_META_LEFT_ON:0);}
    void rebuild(){
        if(!pointers.isEmpty()){rebuildPending=true;return;}
        if(keys==null)return;keys.removeAllViews();keyViews.clear();specs.clear();
        LinearLayout body=new LinearLayout(app);keys.addView(body,new LinearLayout.LayoutParams(-1,-1));
        LinearLayout letters=new LinearLayout(app);letters.setOrientation(LinearLayout.VERTICAL);body.addView(letters,new LinearLayout.LayoutParams(0,-1,1));
        if(layout.equals("pc")){
            LinearLayout fn=newRow(letters);add(fn,"Esc","esc",1.2f,KeyEvent.KEYCODE_ESCAPE);for(int i=1;i<=12;i++)add(fn,"F"+i,"f"+i,1,KeyEvent.KEYCODE_F1+i-1);add(fn,"Ins","insert",1,KeyEvent.KEYCODE_INSERT);add(fn,"Del","delete",1,KeyEvent.KEYCODE_FORWARD_DEL);
            LinearLayout numbers=newRow(letters);characters(numbers,"`1234567890-=",russian?"ё1234567890-=":"`1234567890-=",russian?"Ё!\"№;%:?*()_+":"~!@#$%^&*()_+");add(numbers,"Bksp","backspace",1.7f,KeyEvent.KEYCODE_DEL);add(numbers,"Home","home",1.2f,KeyEvent.KEYCODE_MOVE_HOME);
            LinearLayout q=newRow(letters);add(q,"Tab","tab",1.45f,KeyEvent.KEYCODE_TAB);characters(q,"qwertyuiop[]\\",russian?"йцукенгшщзхъ\\":"qwertyuiop[]\\",russian?"ЙЦУКЕНГШЩЗХЪ/":"QWERTYUIOP{}|");add(q,"End","end",1.2f,KeyEvent.KEYCODE_MOVE_END);
            LinearLayout a=newRow(letters);add(a,"Caps","caps",1.65f,KeyEvent.KEYCODE_CAPS_LOCK);characters(a,"asdfghjkl;'",russian?"фывапролджэ":"asdfghjkl;'",russian?"ФЫВАПРОЛДЖЭ":"ASDFGHJKL:\"");add(a,"Enter","enter",2,KeyEvent.KEYCODE_ENTER);add(a,"PgUp","pageup",1.2f,KeyEvent.KEYCODE_PAGE_UP);
            LinearLayout z=newRow(letters);add(z,"Shift","shift",1.8f,KeyEvent.KEYCODE_SHIFT_LEFT);characters(z,"zxcvbnm,./",russian?"ячсмитьбю.":"zxcvbnm,./",russian?"ЯЧСМИТЬБЮ,":"ZXCVBNM<>?");add(z,"Shift","shift",1.5f,KeyEvent.KEYCODE_SHIFT_RIGHT);add(z,"↑","up",1,KeyEvent.KEYCODE_DPAD_UP);add(z,"PgDn","pagedown",1.2f,KeyEvent.KEYCODE_PAGE_DOWN);
            LinearLayout bottom=newRow(letters);add(bottom,"Ctrl","ctrl",1.25f,KeyEvent.KEYCODE_CTRL_LEFT);add(bottom,"Meta","meta",1.2f,KeyEvent.KEYCODE_META_LEFT);add(bottom,"Alt","alt",1.1f,KeyEvent.KEYCODE_ALT_LEFT);add(bottom,russian?"RU":"EN","language",1.1f,0);add(bottom,"Space","space",5,KeyEvent.KEYCODE_SPACE);add(bottom,"Alt","alt",1.1f,KeyEvent.KEYCODE_ALT_RIGHT);add(bottom,"Ctrl","ctrl",1.25f,KeyEvent.KEYCODE_CTRL_RIGHT);add(bottom,"←","left",1,KeyEvent.KEYCODE_DPAD_LEFT);add(bottom,"↓","down",1,KeyEvent.KEYCODE_DPAD_DOWN);add(bottom,"→","right",1,KeyEvent.KEYCODE_DPAD_RIGHT);
            if(numpad){LinearLayout pad=new LinearLayout(app);pad.setOrientation(LinearLayout.VERTICAL);body.addView(pad,new LinearLayout.LayoutParams(0,-1,.23f));String[][] values={{"Num","/","*","-"},{"7","8","9","+"},{"4","5","6","="},{"1","2","3","Enter"},{"0",".","←","Del"}};for(String[] valuesRow:values){LinearLayout r=newRow(pad);for(String v:valuesRow)add(r,v,v.equals("Num")?"numlock":v.equals("Enter")?"enter":v.equals("Del")?"delete":v.equals("←")?"backspace":v,1,v.equals("Enter")?KeyEvent.KEYCODE_NUMPAD_ENTER:v.equals("Del")?KeyEvent.KEYCODE_FORWARD_DEL:v.equals("←")?KeyEvent.KEYCODE_DEL:v.equals("Num")?KeyEvent.KEYCODE_NUM_LOCK:v.length()==1&&Character.isDigit(v.charAt(0))?KeyEvent.KEYCODE_NUMPAD_0+v.charAt(0)-'0':v.equals(".")?KeyEvent.KEYCODE_NUMPAD_DOT:keyCode(v.charAt(0)));}}
        }else{
            LinearLayout numbers=newRow(letters);characters(numbers,"1234567890","1234567890","!@#$%^&*()");add(numbers,"Bksp","backspace",1.4f,KeyEvent.KEYCODE_DEL);
            LinearLayout q=newRow(letters);if(symbols)characters(q,"{}[]()<>;:","{}[]()<>;:","{}[]()<>;:");else characters(q,"qwertyuiop[]",russian?"йцукенгшщзхъ":"qwertyuiop[]",russian?"ЙЦУКЕНГШЩЗХЪ":"QWERTYUIOP{}");
            LinearLayout a=newRow(letters);add(a,"Tab","tab",1.3f,KeyEvent.KEYCODE_TAB);if(symbols)characters(a,"+-*/=&|!^~","+-*/=&|!^~","+-*/=&|!^~");else characters(a,"asdfghjkl;'",russian?"фывапролджэ":"asdfghjkl;'",russian?"ФЫВАПРОЛДЖЭ":"ASDFGHJKL:\"");
            LinearLayout z=newRow(letters);add(z,"Shift","shift",1.4f,KeyEvent.KEYCODE_SHIFT_LEFT);if(symbols)characters(z,"_#%?.,'\"\\`","_#%?.,'\"\\`","_#%?.,'\"\\`");else characters(z,"zxcvbnm,./",russian?"ячсмитьбю.":"zxcvbnm,./",russian?"ЯЧСМИТЬБЮ,":"ZXCVBNM<>?");add(z,"Enter","enter",1.4f,KeyEvent.KEYCODE_ENTER);
            LinearLayout b=newRow(letters);add(b,russian?"RU":"EN","language",1,0);add(b,symbols?"ABC":"?123","symbols",1,0);add(b,"Ctrl","ctrl",1,KeyEvent.KEYCODE_CTRL_LEFT);add(b,"Alt","alt",1,KeyEvent.KEYCODE_ALT_LEFT);add(b,"Space","space",3.7f,KeyEvent.KEYCODE_SPACE);add(b,"←","left",1,KeyEvent.KEYCODE_DPAD_LEFT);add(b,"↓","down",1,KeyEvent.KEYCODE_DPAD_DOWN);add(b,"↑","up",1,KeyEvent.KEYCODE_DPAD_UP);add(b,"→","right",1,KeyEvent.KEYCODE_DPAD_RIGHT);
        }
        refreshKeys();
    }
    LinearLayout newRow(LinearLayout parent){LinearLayout row=new LinearLayout(app);row.setGravity(Gravity.CENTER);parent.addView(row,new LinearLayout.LayoutParams(-1,0,1));return row;}
    void characters(LinearLayout row,String physical,String normal,String upper){for(int i=0;i<Math.min(physical.length(),normal.length());i++)addKey(row,normal.substring(i,i+1),upper.substring(i,i+1),normal.substring(i,i+1),1,keyCode(physical.charAt(i)));}
    int keyCode(char c){if(c>='a'&&c<='z')return KeyEvent.KEYCODE_A+c-'a';if(c>='0'&&c<='9')return KeyEvent.KEYCODE_0+c-'0';switch(c){case '[':return KeyEvent.KEYCODE_LEFT_BRACKET;case ']':return KeyEvent.KEYCODE_RIGHT_BRACKET;case ';':return KeyEvent.KEYCODE_SEMICOLON;case '\'':return KeyEvent.KEYCODE_APOSTROPHE;case ',':return KeyEvent.KEYCODE_COMMA;case '.':return KeyEvent.KEYCODE_PERIOD;case '/':return KeyEvent.KEYCODE_SLASH;case '\\':return KeyEvent.KEYCODE_BACKSLASH;case '`':return KeyEvent.KEYCODE_GRAVE;case '-':return KeyEvent.KEYCODE_MINUS;case '=':return KeyEvent.KEYCODE_EQUALS;default:return 0;}}
    void add(LinearLayout row,String title,String action,float weight,int code){addKey(row,title,title,action,weight,code);}
    final Map<Integer,TouchPress> pointers=new LinkedHashMap<>();boolean rebuildPending;
    final class KeyView extends TextView {
        String legend="";final Paint legendPaint=new Paint(Paint.ANTI_ALIAS_FLAG);
        KeyView(){super(app);}
        @Override public void draw(Canvas canvas){int saved=canvas.save();super.draw(canvas);canvas.restoreToCount(saved);if(!legend.isEmpty()){legendPaint.setColor(muted);legendPaint.setTextSize(Math.max(dp(8),getTextSize()*.65f));legendPaint.setTextAlign(Paint.Align.RIGHT);canvas.drawText(legend,getScrollX()+getWidth()-dp(6),getScrollY()+dp(5)-legendPaint.ascent(),legendPaint);}}
    }
    final class KeyboardSurface extends LinearLayout {
        KeyboardSurface(){super(app);setMotionEventSplittingEnabled(false);}
        @Override public boolean onInterceptTouchEvent(MotionEvent event){return true;}
        @Override public boolean onTouchEvent(MotionEvent event){return keysTouch(event);}
    }
    final class TouchPress {
        final int id;final KeySpec key;final float x,y;final int meta;final boolean capsAtDown;boolean canceled,repeated,used,longLock,sentDown;
        Runnable repeat,lock;
        TouchPress(int id,KeySpec key,float x,float y){this.id=id;this.key=key;this.x=x;this.y=y;meta=FloatingCodeKeyboard.this.meta();capsAtDown=caps;}
    }
    KeySpec hitKey(float x,float y){int[] origin=new int[2];keys.getLocationOnScreen(origin);for(KeySpec key:specs){int[] p=new int[2];key.view.getLocationOnScreen(p);if(x>=p[0]-origin[0]&&x<p[0]-origin[0]+key.view.getWidth()&&y>=p[1]-origin[1]&&y<p[1]-origin[1]+key.view.getHeight())return key;}return null;}
    void refreshHeld(){held.clear();for(TouchPress press:pointers.values())if(!press.canceled&&modifier(press.key.action))held.add(press.key.action);}
    void cancelTouches(){for(TouchPress press:pointers.values()){if(press.repeat!=null)app.ui.removeCallbacks(press.repeat);if(press.lock!=null)app.ui.removeCallbacks(press.lock);}pointers.clear();held.clear();for(KeySpec key:specs){key.down=false;key.view.setPressed(false);}}
    boolean keysTouch(MotionEvent event){
        if(dragOwner!=null)return true;
        int action=event.getActionMasked(),index=event.getActionIndex();
        if(action==MotionEvent.ACTION_CANCEL){cancelTouches();refreshKeys();return true;}
        if(action==MotionEvent.ACTION_DOWN||action==MotionEvent.ACTION_POINTER_DOWN){
            if(action==MotionEvent.ACTION_DOWN)cancelTouches();int id=event.getPointerId(index);KeySpec key=hitKey(event.getX(index),event.getY(index));if(key==null)return true;keys.getParent().requestDisallowInterceptTouchEvent(true);
            TouchPress press=new TouchPress(id,key,event.getX(index),event.getY(index));pointers.put(id,press);key.down=true;refreshHeld();
            if(modifier(key.action)){
                press.lock=()->{if(pointers.get(id)==press&&!press.canceled&&!press.used){press.longLock=true;latched.remove(key.action);if(!locked.add(key.action))locked.remove(key.action);refreshKeys();}};
                if(modifierMode.equals("sticky"))app.ui.postDelayed(press.lock,550);
            }else{
                for(TouchPress other:pointers.values())if(modifier(other.key.action))other.used=true;
                if(modifierMode.equals("hold")){press.sentDown=true;pressCaptured(press);}
                boolean repeatable=Arrays.asList("backspace","delete","left","right","up","down","home","end","pageup","pagedown").contains(key.action)||modifierMode.equals("hold")&&(press.meta&(KeyEvent.META_CTRL_ON|KeyEvent.META_ALT_ON|KeyEvent.META_META_ON))==0&&(key.normal.length()==1||Arrays.asList("space","enter","tab").contains(key.action));
                if(repeatable){press.repeat=new Runnable(){public void run(){if(pointers.get(id)!=press||press.canceled||!frame.isShown())return;press.repeated=true;pressCaptured(press,true);app.ui.postDelayed(this,55);}};app.ui.postDelayed(press.repeat,350);}
            }refreshKeys();return true;
        }
        if(action==MotionEvent.ACTION_MOVE){
            boolean changed=false;for(TouchPress press:pointers.values()){int pointerIndex=event.findPointerIndex(press.id);if(pointerIndex<0||press.canceled)continue;if(Math.hypot(event.getX(pointerIndex)-press.x,event.getY(pointerIndex)-press.y)>ViewConfiguration.get(app).getScaledTouchSlop()){press.canceled=true;changed=true;if(press.repeat!=null)app.ui.removeCallbacks(press.repeat);if(press.lock!=null)app.ui.removeCallbacks(press.lock);}}if(changed){refreshHeld();refreshKeys();}return true;
        }
        if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_POINTER_UP){
            TouchPress press=pointers.remove(event.getPointerId(index));if(press!=null){if(press.repeat!=null)app.ui.removeCallbacks(press.repeat);if(press.lock!=null)app.ui.removeCallbacks(press.lock);KeySpec key=press.key;key.down=pointers.values().stream().anyMatch(p->p.key==key);refreshHeld();
                if(modifier(key.action)){if(app.altShiftLayout&&!press.canceled&&!press.used&&((key.action.equals("shift")&&mod("alt"))||(key.action.equals("alt")&&mod("shift")))&&!mod("ctrl")&&!mod("meta")){for(TouchPress other:pointers.values())if(modifier(other.key.action))other.used=true;russian=!russian;latched.remove("alt");latched.remove("shift");locked.remove("alt");locked.remove("shift");prefs.edit().putBoolean("russian",russian).apply();if(pointers.isEmpty())rebuild();else rebuildPending=true;}else if(!press.canceled&&!press.longLock&&!press.used&&modifierMode.equals("sticky")){long now=SystemClock.uptimeMillis();if(locked.remove(key.action))latched.remove(key.action);else if(now-key.lastTap<350&&latched.contains(key.action)){latched.remove(key.action);locked.add(key.action);}else if(!latched.add(key.action))latched.remove(key.action);key.lastTap=now;}}
                else if(!press.canceled&&!press.repeated&&!press.sentDown)pressCaptured(press);
            }
            if(pointers.isEmpty()&&rebuildPending){rebuildPending=false;rebuild();}else refreshKeys();return true;
        }return true;
    }
    void pressCaptured(TouchPress press){pressCaptured(press,false);}
    void pressCaptured(TouchPress press,boolean repeat){int currentMeta=meta();overrideMeta=repeat?currentMeta:press.meta;overrideCaps=repeat?caps:press.capsAtDown;try{press(press.key);}finally{overrideMeta=-1;refreshKeys();}}
    void addKey(LinearLayout row,String normal,String upper,String action,float weight,int code){
        KeyView key=new KeyView();key.setGravity(Gravity.CENTER);key.setTextSize(layout.equals("pc")?12:16);key.setSingleLine();key.setFontFeatureSettings("tnum");key.setFocusable(false);
        KeySpec spec=new KeySpec(action,normal,upper,code,key);specs.add(spec);keyViews.add(key);key.setTag(action);key.setContentDescription(action.equals("space")?label("Пробел","Space"):normal);key.setTooltipText(normal);
        LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(0,-1,weight);size.setMargins(dp(1.5f),dp(2),dp(1.5f),dp(2));row.addView(key,size);key.setOnClickListener(v->press(spec));
    }
    void refreshKeys(){
        shift=mod("shift");ctrl=mod("ctrl");alt=mod("alt");
        if(modifierToggle!=null){String modeLabel=modifierMode.equals("hold")?label("Удержание","Hold"):label("Нажатие","Tap");if(!modeLabel.contentEquals(modifierToggle.getText()))modifierToggle.setText(modeLabel);modifierToggle.setTextColor(muted);modifierToggle.setContentDescription(label("Режим клавиш: ","Key mode: ")+modifierToggle.getText());modifierToggle.setTooltipText(label("Нажатие: модификатор на следующую клавишу. Удержание: клавиши работают при зажатии.","Tap: latch a modifier for the next key. Hold: keys act while held down."));}
        for(KeySpec k:specs){boolean letter=k.normal.length()==1&&Character.isLetter(k.normal.charAt(0)),up=letter?caps^shift:shift,on=modifier(k.action)?mod(k.action):k.action.equals("caps")&&caps||k.action.equals("numlock")&&numLock;String text=up?k.upper:k.normal;if(k.action.equals("space"))text=russian?"Русский":"English";if(modifier(k.action)&&locked.contains(k.action))text+=" •";
            ((KeyView)k.view).legend=k.normal.length()==1&&!letter&&!k.upper.equals(k.normal)?k.upper:"";if(!((KeyView)k.view).legend.isEmpty())text=k.normal;if(!text.contentEquals(k.view.getText()))k.view.setText(text);k.view.setPressed(pointers.values().stream().anyMatch(p->p.key==k&&!p.canceled));k.view.setTextColor(on?accent:fg);int background=on?(light?Color.rgb(215,228,255):Color.rgb(52,70,101)):keyBg;if(k.paintedBackground!=background){k.paintedBackground=background;GradientDrawable shape=new GradientDrawable();shape.setColor(background);shape.setCornerRadius(dp(4));k.view.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(35,110,145,190)),shape,null));}k.view.invalidate();
        }
    }
    void sendKey(int code,int modifiers){
        long now=SystemClock.uptimeMillis();int[] bits={KeyEvent.META_CTRL_ON,KeyEvent.META_ALT_ON,KeyEvent.META_SHIFT_ON,KeyEvent.META_META_ON},codes={KeyEvent.KEYCODE_CTRL_LEFT,KeyEvent.KEYCODE_ALT_LEFT,KeyEvent.KEYCODE_SHIFT_LEFT,KeyEvent.KEYCODE_META_LEFT};
        // Sora tracks physical Shift transitions for extending a selection.
        // A meta bit on an arrow event alone only moves its caret.
        for(int i=0;i<bits.length;i++)if((modifiers&bits[i])!=0)app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,codes[i],0,modifiers));
        app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,code,0,modifiers));app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_UP,code,0,modifiers));
        for(int i=bits.length-1;i>=0;i--)if((modifiers&bits[i])!=0)app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_UP,codes[i],0,0));
    }
    void press(KeySpec key){
        String action=key.action;
        if(action.equals("language")){russian=!russian;prefs.edit().putBoolean("russian",russian).apply();rebuild();return;}
        if(action.equals("symbols")){symbols=!symbols;rebuild();return;}if(action.equals("caps")){caps=!caps;refreshKeys();return;}if(action.equals("numlock")){numLock=!numLock;refreshKeys();return;}
        if(!host.webFieldFocused){if(host.active==null||host.active.buffer==null)return;host.active.editor.requestFocus();}
        for(KeySpec spec:specs)if(spec.down&&modifier(spec.action)){spec.used=true;}
        if(action.equals("space")&&mod("ctrl")&&!mod("alt")&&!mod("meta")&&!mod("shift")){russian=!russian;latched.clear();prefs.edit().putBoolean("russian",russian).apply();rebuild();return;}
        if(!numLock&&(key.code>=KeyEvent.KEYCODE_NUMPAD_0&&key.code<=KeyEvent.KEYCODE_NUMPAD_9||key.code==KeyEvent.KEYCODE_NUMPAD_DOT)){int[] nav={KeyEvent.KEYCODE_INSERT,KeyEvent.KEYCODE_MOVE_END,KeyEvent.KEYCODE_DPAD_DOWN,KeyEvent.KEYCODE_PAGE_DOWN,KeyEvent.KEYCODE_DPAD_LEFT,0,KeyEvent.KEYCODE_DPAD_RIGHT,KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_PAGE_UP};int code=key.code==KeyEvent.KEYCODE_NUMPAD_DOT?KeyEvent.KEYCODE_FORWARD_DEL:nav[key.code-KeyEvent.KEYCODE_NUMPAD_0];if(code!=0)sendKey(code,meta());latched.clear();refreshKeys();return;}
        int modifiers=meta();boolean shortcut=mod("ctrl")||mod("alt")||mod("meta"),special=action.matches("f[0-9]+|esc|insert|delete|left|right|up|down|home|end|pageup|pagedown");
        if(host.webFieldFocused){
            if(shortcut||special||Arrays.asList("tab","backspace","enter").contains(action)){if(key.code!=0)sendKey(key.code,modifiers);}
            else{boolean letter=key.normal.length()==1&&Character.isLetter(key.normal.charAt(0)),currentCaps=overrideMeta>=0?overrideCaps:caps;String text=action.equals("space")?" ":(letter?currentCaps^mod("shift"):mod("shift"))?key.upper:key.normal;app.emitScript("window.StudioWebInput&&StudioWebInput("+JSONObject.quote(text)+")");}
            latched.clear();refreshKeys();return;
        }
        if(shortcut||special||mod("shift")&&Arrays.asList("tab","backspace").contains(action)){if(key.code!=0)sendKey(key.code,modifiers);}
        else if(action.equals("backspace"))sendKey(KeyEvent.KEYCODE_DEL,0);
        else if(action.equals("tab"))host.action("tab");
        else if(action.equals("enter"))host.action("\n");
        else if(action.equals("space"))host.action(" ");
        else{boolean letter=key.normal.length()==1&&Character.isLetter(key.normal.charAt(0)),currentCaps=overrideMeta>=0?overrideCaps:caps;host.action((letter?currentCaps^mod("shift"):mod("shift"))?key.upper:key.normal);}
        latched.clear();refreshKeys();
    }
    float rawX(MotionEvent event,int index){return event.getRawX()+event.getX(index)-event.getX(0);}
    float rawY(MotionEvent event,int index){return event.getRawY()+event.getY(index)-event.getY(0);}
    void drag(View view,boolean resize){drag(view,resize?"bottomright":"move");}
    void drag(View view,String direction){view.setOnTouchListener(new View.OnTouchListener(){float startX,startY;int oldX,oldY,oldW,oldH,pointer=-1;public boolean onTouch(View v,MotionEvent e){int action=e.getActionMasked();lastDrag=direction+":"+action+":"+Math.round(e.getRawX());if(action==MotionEvent.ACTION_DOWN){if(dragOwner!=null&&dragOwner!=v)return true;dragOwner=v;cancelTouches();pointer=e.getPointerId(0);startX=rawX(e,0);startY=rawY(e,0);oldX=x;oldY=y;oldW=width;oldH=height;v.getParent().requestDisallowInterceptTouchEvent(true);return true;}int index=e.findPointerIndex(pointer);if(dragOwner!=v||pointer<0||index<0)return true;if(action==MotionEvent.ACTION_MOVE){int dx=Math.round(rawX(e,index)-startX),dy=Math.round(rawY(e,index)-startY),maxW=app.editorRoot.getWidth()-rightMargin(),maxH=app.editorRoot.getHeight()-dp(6),minW=Math.min(dp(300),maxW-leftMargin()),minH=Math.min(dp(220),maxH-dp(6));if(direction.equals("move")){x=oldX+dx;y=oldY+dy;}else{if(direction.contains("left")){width=Math.max(minW,Math.min(oldW-dx,oldX+oldW-leftMargin()));x=oldX+oldW-width;}if(direction.contains("right"))width=Math.max(minW,Math.min(oldW+dx,maxW-oldX));if(direction.contains("top")){height=Math.max(minH,Math.min(oldH-dy,oldY+oldH-dp(6)));y=oldY+oldH-height;}if(direction.contains("bottom"))height=Math.max(minH,Math.min(oldH+dy,maxH-oldY));}geometry(host.visible);}else if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_POINTER_UP&&e.getPointerId(e.getActionIndex())==pointer){pointer=-1;dragOwner=null;saveBounds();}else if(action==MotionEvent.ACTION_CANCEL){pointer=-1;dragOwner=null;x=oldX;y=oldY;width=oldW;height=oldH;geometry(host.visible);}return true;}});}
    void saveBounds(){String prefix=layout.equals("pc")?"keyboardPc":"keyboardAndroid";int wp=Math.round(width*100f/availableWidth()),hp=Math.round(height*100f/Math.max(1,app.editorRoot.getHeight()-dp(12)));try{host.settings.put(prefix+"Width",wp);host.settings.put(prefix+"Height",hp);}catch(JSONException ignored){}config=settingsSignature(host.settings);JSONObject change=NativeEditorHost.object("layout",layout,"width",wp,"height",hp);try{change.put("revision",++settingsRevision);}catch(JSONException ignored){}app.event("floatingKeyboardSize",change);int availableX=Math.max(1,availableWidth()-width),availableY=Math.max(1,app.editorRoot.getHeight()-dp(12)-height);prefs.edit().putInt("width",width).putInt("height",height).putFloat("xRatio",Math.max(0,Math.min(1,(float)(x-leftMargin())/availableX))).putFloat("yRatio",Math.max(0,Math.min(1,(float)y/availableY))).apply();}
    JSONObject describe(View key)throws JSONException{int[] point=new int[2];key.getLocationOnScreen(point);return new JSONObject().put("action",key.getTag()).put("legend",key instanceof KeyView?((KeyView)key).legend:"").put("text",key instanceof TextView?((TextView)key).getText().toString():"").put("description",String.valueOf(key.getContentDescription())).put("x",point[0]).put("y",point[1]).put("width",key.getWidth()).put("height",key.getHeight());}
    JSONObject state()throws JSONException{JSONArray list=new JSONArray(),controls=new JSONArray(),strip=new JSONArray();for(View key:keyViews)list.put(describe(key));android.view.ViewGroup header=(android.view.ViewGroup)handle.getParent();for(int i=0;i<header.getChildCount();i++)controls.put(describe(header.getChildAt(i)));for(String tag:new String[]{"resize","resize-left","resize-right","resize-top","resize-bottom","resize-bottomleft"})controls.put(describe(frame.findViewWithTag(tag)));android.view.ViewGroup row=(android.view.ViewGroup)host.accessory.getChildAt(0);for(int i=0;i<row.getChildCount();i++)strip.put(describe(row.getChildAt(i)));return new JSONObject().put("enabled",enabled).put("shown",frame.isShown()).put("numLock",numLock).put("layout",layout).put("modifierMode",modifierMode).put("latched",new JSONArray(latched)).put("held",new JSONArray(held)).put("locked",new JSONArray(locked)).put("russian",russian).put("shift",shift).put("ctrl",ctrl).put("alt",alt).put("presentations",new JSONArray(presentations)).put("lastDrag",lastDrag).put("activePointers",pointers.size()).put("imeHeight",app.imeHeight).put("x",x).put("y",y).put("width",width).put("height",height).put("keys",list).put("controls",controls).put("strip",strip).put("stripBounds",describe(host.accessory));}
}
