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
    final ArrayList<View> keyViews=new ArrayList<>();
    boolean enabled,shown,shift,caps,ctrl,alt,symbols,russian,light;
    long lastShift;
    String keyboardLocale="";
    int x=-1,y=-1,width,height;
    int bg,fg,keyBg,muted,accent;
    FloatingCodeKeyboard(NativeEditorHost host){
        this.host=host;app=host.app;prefs=app.getSharedPreferences("floating-keyboard",Context.MODE_PRIVATE);
        enabled=prefs.getBoolean("enabled",false);russian=prefs.getBoolean("russian",false);
        frame=new FrameLayout(app);frame.setClipChildren(false);frame.setElevation(dp(12));frame.setZ(dp(100));frame.setVisibility(View.GONE);
        stack=new LinearLayout(app);stack.setOrientation(LinearLayout.VERTICAL);stack.setPadding(dp(6),dp(3),dp(6),dp(6));frame.addView(stack,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(app);header.setGravity(Gravity.CENTER_VERTICAL);stack.addView(header,new LinearLayout.LayoutParams(-1,dp(32)));
        handle=new TextView(app);handle.setTag("move");handle.setGravity(Gravity.CENTER);handle.setTextSize(12);handle.setText("C++ Studio");handle.setContentDescription(label("Переместить клавиатуру","Move keyboard"));header.addView(handle,new LinearLayout.LayoutParams(0,-1,1));
        drag(handle,false);
        View system=icon(com.forgex.R.drawable.ic_keyboard,label("Системная клавиатура","System keyboard"),()->setEnabled(false,true));system.setTag("system");header.addView(system,new LinearLayout.LayoutParams(dp(34),dp(30)));
        View close=icon(com.forgex.R.drawable.ic_x,label("Скрыть клавиатуру","Hide keyboard"),this::hide);close.setTag("close");header.addView(close,new LinearLayout.LayoutParams(dp(34),dp(30)));
        keys=new LinearLayout(app);keys.setOrientation(LinearLayout.VERTICAL);stack.addView(keys,new LinearLayout.LayoutParams(-1,0,1));
        View resize=new View(app){final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);@Override protected void onDraw(Canvas canvas){paint.setColor(muted);paint.setStrokeWidth(dp(1));for(int i=1;i<4;i++)canvas.drawLine(getWidth()-dp(i*5),getHeight()-dp(3),getWidth()-dp(3),getHeight()-dp(i*5),paint);}};
        resize.setTag("resize");resize.setContentDescription(label("Изменить размер клавиатуры","Resize keyboard"));FrameLayout.LayoutParams grip=new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.BOTTOM|Gravity.RIGHT);frame.addView(resize,grip);drag(resize,true);
        app.editorRoot.addView(frame,new FrameLayout.LayoutParams(1,1));theme();rebuild();
    }
    int dp(float value){return Math.round(value*app.getResources().getDisplayMetrics().density);}
    String label(String ru,String en){return host.settings.optString("language",Locale.getDefault().getLanguage()).startsWith("ru")?ru:en;}
    ImageView icon(int resource,String description,Runnable action){ImageView view=new ImageView(app);view.setImageResource(resource);view.setPadding(dp(7),dp(7),dp(7),dp(7));view.setContentDescription(description);view.setTooltipText(description);view.setOnClickListener(v->action.run());return view;}
    void setEnabled(boolean value,boolean showSystem){
        enabled=value;shown=value;clearModifiers();caps=false;prefs.edit().putBoolean("enabled",value).apply();
        for(var pane:host.panes.values())pane.editor.setSoftKeyboardEnabled(!value);
        if(value){((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(app.web.getWindowToken(),0);attachStrip();rebuild();}
        else{detachStrip();frame.setVisibility(View.GONE);}
        app.event("floatingKeyboardMode",NativeEditorHost.object("mode",value?"floating":"system"));host.geometry();if(!value&&showSystem)host.showKeyboard();
    }
    void show(){if(!enabled)return;shown=true;attachStrip();host.geometry();}
    void hide(){shown=false;clearModifiers();refreshKeys();frame.setVisibility(View.GONE);}
    void attachStrip(){if(host.accessory.getParent()==stack)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);stack.addView(host.accessory,1,new LinearLayout.LayoutParams(-1,dp(42)));}
    void detachStrip(){if(host.accessory.getParent()==app.editorRoot)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);app.editorRoot.addView(host.accessory,new FrameLayout.LayoutParams(-1,1));}
    void geometry(boolean allowed){
        if(!enabled){if(host.accessory.getParent()!=app.editorRoot)detachStrip();frame.setVisibility(View.GONE);return;}
        attachStrip();theme();android.view.ViewGroup row=(android.view.ViewGroup)host.accessory.getChildAt(0);for(int i=0;i<row.getChildCount();i++){View button=row.getChildAt(i);boolean duplicate=Arrays.asList("tab","left","right","up","down").contains(String.valueOf(button.getTag()));button.setVisibility(duplicate?View.GONE:View.VISIBLE);}boolean show=shown&&allowed&&host.active!=null&&host.active.buffer!=null;
        frame.setVisibility(show?View.VISIBLE:View.GONE);host.accessory.setVisibility(show?View.VISIBLE:View.GONE);if(!show)return;
        int maxW=Math.max(1,app.editorRoot.getWidth()-dp(12)),maxH=Math.max(1,app.editorRoot.getHeight()-dp(12));
        if(width==0){String prefix=layout.equals("pc")?"keyboardPc":"keyboardAndroid";int wp=Math.max(35,Math.min(100,host.settings.optInt(prefix+"Width",layout.equals("pc")?95:65))),hp=Math.max(25,Math.min(80,host.settings.optInt(prefix+"Height",layout.equals("pc")?48:42)));width=Math.round(maxW*wp/100f);height=Math.round(maxH*hp/100f);x=Math.round(prefs.getFloat("xRatio",.5f)*Math.max(0,maxW-width));y=Math.round(prefs.getFloat("yRatio",.95f)*Math.max(0,maxH-height));}
        width=Math.max(Math.min(dp(300),maxW),Math.min(width,maxW));height=Math.max(Math.min(dp(220),maxH),Math.min(height,maxH));x=Math.max(dp(6),Math.min(x,maxW-width+dp(6)));y=Math.max(dp(6),Math.min(y,maxH-height+dp(6)));
        FrameLayout.LayoutParams bounds=(FrameLayout.LayoutParams)frame.getLayoutParams();if(bounds.width!=width||bounds.height!=height||bounds.leftMargin!=x||bounds.topMargin!=y){bounds.width=width;bounds.height=height;bounds.leftMargin=x;bounds.topMargin=y;frame.setLayoutParams(bounds);}frame.bringToFront();
    }
    void theme(){
        boolean next=host.settings.optString("theme").equals("forge-light");String locale=host.settings.optString("language",Locale.getDefault().getLanguage());if(bg!=0&&next==light&&locale.equals(keyboardLocale))return;light=next;keyboardLocale=locale;
        bg=Color.parseColor(light?"#F1F3F6":"#2B2D30");fg=Color.parseColor(light?"#27282E":"#D3D6DD");keyBg=Color.parseColor(light?"#FFFFFF":"#373A40");muted=Color.parseColor(light?"#697382":"#8B93A1");accent=Color.parseColor(light?"#3574F0":"#75A4FF");
        GradientDrawable background=new GradientDrawable();background.setColor(bg);background.setCornerRadius(dp(10));background.setStroke(dp(1),Color.parseColor(light?"#C5CAD3":"#4A4F58"));frame.setBackground(background);handle.setTextColor(muted);
        handle.setContentDescription(label("Переместить клавиатуру","Move keyboard"));LinearLayout header=(LinearLayout)handle.getParent();for(int i=0;i<header.getChildCount();i++)if(header.getChildAt(i)instanceof ImageView){((ImageView)header.getChildAt(i)).setColorFilter(muted);String description=i==1?label("Системная клавиатура","System keyboard"):label("Скрыть клавиатуру","Hide keyboard");header.getChildAt(i).setContentDescription(description);header.getChildAt(i).setTooltipText(description);}
        if(keys.getChildCount()>0)refreshKeys();
    }
    static final class KeySpec {
        final String action,normal,upper;final int code;final TextView view;boolean down,used;long lastTap;
        KeySpec(String action,String normal,String upper,int code,TextView view){this.action=action;this.normal=normal;this.upper=upper;this.code=code;this.view=view;}
    }
    final ArrayList<KeySpec> specs=new ArrayList<>();
    final Set<String> latched=new HashSet<>(),locked=new HashSet<>(),held=new HashSet<>();
    String layout="pc",modifierMode="sticky",config="";boolean numpad=true,numLock=true;
    void applySettings(JSONObject value){
        String next=value.optString("keyboardLayout","pc"),mode=value.optString("keyboardModifiers","sticky");
        String signature=next+":"+mode+":"+value.optBoolean("keyboardNumpad",true)+":"+value.optInt("keyboardPcWidth",95)+":"+value.optInt("keyboardPcHeight",48)+":"+value.optInt("keyboardAndroidWidth",65)+":"+value.optInt("keyboardAndroidHeight",42)+":"+value.optString("keyboardPrimary","system");
        if(signature.equals(config))return;config=signature;
        layout=next.equals("android")?"android":"pc";modifierMode=mode.equals("hold")?"hold":"sticky";numpad=value.optBoolean("keyboardNumpad",true);clearModifiers();width=height=0;
        boolean selected=value.optString("keyboardPrimary",prefs.getBoolean("enabled",false)?"floating":"system").equals("floating");
        if(selected!=enabled)setEnabled(selected,false);else rebuild();
    }
    void clearModifiers(){latched.clear();locked.clear();held.clear();ctrl=alt=shift=false;}
    boolean mod(String name){return latched.contains(name)||locked.contains(name)||held.contains(name);}
    boolean modifier(String name){return Arrays.asList("shift","ctrl","alt","meta").contains(name);}
    int meta(){return (mod("ctrl")?KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON:0)|(mod("alt")?KeyEvent.META_ALT_ON|KeyEvent.META_ALT_LEFT_ON:0)|(mod("shift")?KeyEvent.META_SHIFT_ON|KeyEvent.META_SHIFT_LEFT_ON:0)|(mod("meta")?KeyEvent.META_META_ON|KeyEvent.META_META_LEFT_ON:0);}
    void rebuild(){
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
    void addKey(LinearLayout row,String normal,String upper,String action,float weight,int code){
        TextView key=new TextView(app);key.setGravity(Gravity.CENTER);key.setTextSize(layout.equals("pc")?12:16);key.setSingleLine();key.setFontFeatureSettings("tnum");key.setFocusable(false);
        KeySpec spec=new KeySpec(action,normal,upper,code,key);specs.add(spec);keyViews.add(key);key.setTag(action);key.setContentDescription(action.equals("space")?label("Пробел","Space"):normal);key.setTooltipText(normal);
        LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(0,-1,weight);size.setMargins(dp(1.5f),dp(2),dp(1.5f),dp(2));row.addView(key,size);
        key.setOnClickListener(v->press(spec));
        key.setOnTouchListener(new View.OnTouchListener(){float startX,startY;boolean canceled,repeated,longLock;final Runnable repeat=new Runnable(){public void run(){if(canceled||!spec.down||!key.isAttachedToWindow()||!frame.isShown())return;repeated=true;press(spec);app.ui.postDelayed(this,55);}};final Runnable lock=()->{if(spec.down&&!canceled&&!spec.used){longLock=true;held.remove(action);latched.remove(action);if(!locked.add(action))locked.remove(action);refreshKeys();}};
            public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){
                case MotionEvent.ACTION_DOWN:startX=e.getRawX();startY=e.getRawY();canceled=repeated=longLock=false;spec.down=true;spec.used=false;key.setPressed(true);
                    if(modifier(action)){held.add(action);app.ui.postDelayed(lock,550);refreshKeys();}else if(Arrays.asList("backspace","delete","left","right","up","down","home","end","pageup","pagedown").contains(action))app.ui.postDelayed(repeat,350);return true;
                case MotionEvent.ACTION_MOVE:if(Math.hypot(e.getRawX()-startX,e.getRawY()-startY)>ViewConfiguration.get(app).getScaledTouchSlop()){canceled=true;app.ui.removeCallbacks(repeat);app.ui.removeCallbacks(lock);if(modifier(action)){held.remove(action);refreshKeys();}key.setPressed(false);}return true;
                case MotionEvent.ACTION_UP:spec.down=false;app.ui.removeCallbacks(repeat);app.ui.removeCallbacks(lock);key.setPressed(false);
                    if(modifier(action)){held.remove(action);if(!canceled&&!longLock&&!spec.used&&modifierMode.equals("sticky")){long now=SystemClock.uptimeMillis();if(locked.remove(action)){latched.remove(action);}else if(now-spec.lastTap<350&&latched.contains(action)){latched.remove(action);locked.add(action);}else if(!latched.add(action))latched.remove(action);spec.lastTap=now;}refreshKeys();}
                    else if(!canceled&&!repeated)key.performClick();return true;
                case MotionEvent.ACTION_CANCEL:spec.down=false;canceled=true;app.ui.removeCallbacks(repeat);app.ui.removeCallbacks(lock);held.remove(action);key.setPressed(false);refreshKeys();return true;
                default:return true;}}});
    }
    void refreshKeys(){
        shift=mod("shift");ctrl=mod("ctrl");alt=mod("alt");
        for(KeySpec k:specs){boolean letter=k.normal.length()==1&&Character.isLetter(k.normal.charAt(0)),up=letter?caps^shift:shift,on=modifier(k.action)?mod(k.action):k.action.equals("caps")&&caps||k.action.equals("numlock")&&numLock;String text=up?k.upper:k.normal;if(k.action.equals("space"))text=russian?"Русский":"English";if(modifier(k.action)&&locked.contains(k.action))text+=" •";
            k.view.setText(text);k.view.setTextColor(on?accent:fg);GradientDrawable shape=new GradientDrawable();shape.setColor(on?(light?Color.rgb(215,228,255):Color.rgb(52,70,101)):keyBg);shape.setCornerRadius(dp(4));k.view.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(35,110,145,190)),shape,null));
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
        if(host.active==null||host.active.buffer==null)return;host.active.editor.requestFocus();
        for(KeySpec spec:specs)if(spec.down&&modifier(spec.action)){spec.used=true;}
        if(action.equals("space")&&mod("ctrl")&&!mod("alt")&&!mod("meta")&&!mod("shift")){russian=!russian;latched.clear();prefs.edit().putBoolean("russian",russian).apply();rebuild();return;}
        if(!numLock&&(key.code>=KeyEvent.KEYCODE_NUMPAD_0&&key.code<=KeyEvent.KEYCODE_NUMPAD_9||key.code==KeyEvent.KEYCODE_NUMPAD_DOT)){int[] nav={KeyEvent.KEYCODE_INSERT,KeyEvent.KEYCODE_MOVE_END,KeyEvent.KEYCODE_DPAD_DOWN,KeyEvent.KEYCODE_PAGE_DOWN,KeyEvent.KEYCODE_DPAD_LEFT,0,KeyEvent.KEYCODE_DPAD_RIGHT,KeyEvent.KEYCODE_MOVE_HOME,KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_PAGE_UP};int code=key.code==KeyEvent.KEYCODE_NUMPAD_DOT?KeyEvent.KEYCODE_FORWARD_DEL:nav[key.code-KeyEvent.KEYCODE_NUMPAD_0];if(code!=0)sendKey(code,meta());latched.clear();refreshKeys();return;}
        int modifiers=meta();boolean shortcut=mod("ctrl")||mod("alt")||mod("meta"),special=action.matches("f[0-9]+|esc|insert|delete|left|right|up|down|home|end|pageup|pagedown");
        if(shortcut||special||mod("shift")&&Arrays.asList("tab","backspace").contains(action)){if(key.code!=0)sendKey(key.code,modifiers);}
        else if(action.equals("backspace"))sendKey(KeyEvent.KEYCODE_DEL,0);
        else if(action.equals("tab"))host.action("tab");
        else if(action.equals("enter"))host.action("\n");
        else if(action.equals("space"))host.action(" ");
        else{boolean letter=key.normal.length()==1&&Character.isLetter(key.normal.charAt(0));host.action((letter?caps^mod("shift"):mod("shift"))?key.upper:key.normal);}
        latched.clear();refreshKeys();
    }
    void drag(View view,boolean resize){view.setOnTouchListener(new View.OnTouchListener(){float startX,startY;int oldX,oldY,oldW,oldH;public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){case MotionEvent.ACTION_DOWN:startX=e.getRawX();startY=e.getRawY();oldX=x;oldY=y;oldW=width;oldH=height;v.getParent().requestDisallowInterceptTouchEvent(true);return true;case MotionEvent.ACTION_MOVE:if(resize){width=oldW+Math.round(e.getRawX()-startX);height=oldH+Math.round(e.getRawY()-startY);}else{x=oldX+Math.round(e.getRawX()-startX);y=oldY+Math.round(e.getRawY()-startY);}geometry(host.visible);return true;case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:saveBounds();return true;default:return true;}}});}
    void saveBounds(){String prefix=layout.equals("pc")?"keyboardPc":"keyboardAndroid";int wp=Math.round(width*100f/Math.max(1,app.editorRoot.getWidth()-dp(12))),hp=Math.round(height*100f/Math.max(1,app.editorRoot.getHeight()-dp(12)));try{host.settings.put(prefix+"Width",wp);host.settings.put(prefix+"Height",hp);}catch(JSONException ignored){}app.event("floatingKeyboardSize",NativeEditorHost.object("layout",layout,"width",wp,"height",hp));int availableX=Math.max(1,app.editorRoot.getWidth()-dp(12)-width),availableY=Math.max(1,app.editorRoot.getHeight()-dp(12)-height);prefs.edit().putInt("width",width).putInt("height",height).putFloat("xRatio",Math.max(0,Math.min(1,(float)x/availableX))).putFloat("yRatio",Math.max(0,Math.min(1,(float)y/availableY))).apply();}
    JSONObject describe(View key)throws JSONException{int[] point=new int[2];key.getLocationOnScreen(point);return new JSONObject().put("action",key.getTag()).put("description",String.valueOf(key.getContentDescription())).put("x",point[0]).put("y",point[1]).put("width",key.getWidth()).put("height",key.getHeight());}
    JSONObject state()throws JSONException{JSONArray list=new JSONArray(),controls=new JSONArray(),strip=new JSONArray();for(View key:keyViews)list.put(describe(key));android.view.ViewGroup header=(android.view.ViewGroup)handle.getParent();for(int i=0;i<header.getChildCount();i++)controls.put(describe(header.getChildAt(i)));controls.put(describe(frame.findViewWithTag("resize")));android.view.ViewGroup row=(android.view.ViewGroup)host.accessory.getChildAt(0);for(int i=0;i<row.getChildCount();i++)strip.put(describe(row.getChildAt(i)));return new JSONObject().put("enabled",enabled).put("shown",frame.isShown()).put("numLock",numLock).put("layout",layout).put("modifierMode",modifierMode).put("latched",new JSONArray(latched)).put("held",new JSONArray(held)).put("locked",new JSONArray(locked)).put("russian",russian).put("shift",shift).put("ctrl",ctrl).put("alt",alt).put("imeHeight",app.imeHeight).put("x",x).put("y",y).put("width",width).put("height",height).put("keys",list).put("controls",controls).put("strip",strip).put("stripBounds",describe(host.accessory));}
}
