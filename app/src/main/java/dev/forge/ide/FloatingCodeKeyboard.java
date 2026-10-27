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
        frame=new FrameLayout(app);frame.setClipChildren(false);frame.setElevation(dp(12));frame.setVisibility(View.GONE);
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
        enabled=value;shown=value;ctrl=alt=shift=caps=false;prefs.edit().putBoolean("enabled",value).apply();
        for(var pane:host.panes.values())pane.editor.setSoftKeyboardEnabled(!value);
        if(value){((InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(app.web.getWindowToken(),0);attachStrip();rebuild();}
        else{detachStrip();frame.setVisibility(View.GONE);}
        host.geometry();if(!value&&showSystem)host.showKeyboard();
    }
    void show(){if(!enabled)return;shown=true;attachStrip();host.geometry();}
    void hide(){shown=false;frame.setVisibility(View.GONE);}
    void attachStrip(){if(host.accessory.getParent()==stack)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);stack.addView(host.accessory,1,new LinearLayout.LayoutParams(-1,dp(42)));}
    void detachStrip(){if(host.accessory.getParent()==app.editorRoot)return;if(host.accessory.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)host.accessory.getParent()).removeView(host.accessory);app.editorRoot.addView(host.accessory,new FrameLayout.LayoutParams(-1,1));}
    void geometry(boolean allowed){
        if(!enabled){if(host.accessory.getParent()!=app.editorRoot)detachStrip();frame.setVisibility(View.GONE);return;}
        attachStrip();theme();boolean show=shown&&allowed&&host.active!=null&&host.active.buffer!=null;
        frame.setVisibility(show?View.VISIBLE:View.GONE);host.accessory.setVisibility(show?View.VISIBLE:View.GONE);if(!show)return;
        int maxW=Math.max(1,app.editorRoot.getWidth()-dp(12)),maxH=Math.max(1,app.editorRoot.getHeight()-dp(12));
        if(width==0){width=prefs.getInt("width",Math.min(dp(650),maxW));height=prefs.getInt("height",Math.min(dp(320),maxH));x=Math.round(prefs.getFloat("xRatio",.5f)*Math.max(0,maxW-width));y=Math.round(prefs.getFloat("yRatio",.95f)*Math.max(0,maxH-height));}
        width=Math.max(Math.min(dp(300),maxW),Math.min(width,maxW));height=Math.max(Math.min(dp(220),maxH),Math.min(height,maxH));x=Math.max(dp(6),Math.min(x,maxW-width+dp(6)));y=Math.max(dp(6),Math.min(y,maxH-height+dp(6)));
        FrameLayout.LayoutParams bounds=(FrameLayout.LayoutParams)frame.getLayoutParams();if(bounds.width!=width||bounds.height!=height||bounds.leftMargin!=x||bounds.topMargin!=y){bounds.width=width;bounds.height=height;bounds.leftMargin=x;bounds.topMargin=y;frame.setLayoutParams(bounds);}frame.bringToFront();
    }
    void theme(){
        boolean next=host.settings.optString("theme").equals("forge-light");String locale=host.settings.optString("language",Locale.getDefault().getLanguage());if(bg!=0&&next==light&&locale.equals(keyboardLocale))return;light=next;keyboardLocale=locale;
        bg=Color.parseColor(light?"#F1F3F6":"#2B2D30");fg=Color.parseColor(light?"#27282E":"#D3D6DD");keyBg=Color.parseColor(light?"#FFFFFF":"#373A40");muted=Color.parseColor(light?"#697382":"#8B93A1");accent=Color.parseColor(light?"#3574F0":"#75A4FF");
        GradientDrawable background=new GradientDrawable();background.setColor(bg);background.setCornerRadius(dp(10));background.setStroke(dp(1),Color.parseColor(light?"#C5CAD3":"#4A4F58"));frame.setBackground(background);handle.setTextColor(muted);
        handle.setContentDescription(label("Переместить клавиатуру","Move keyboard"));LinearLayout header=(LinearLayout)handle.getParent();for(int i=0;i<header.getChildCount();i++)if(header.getChildAt(i)instanceof ImageView){((ImageView)header.getChildAt(i)).setColorFilter(muted);String description=i==1?label("Системная клавиатура","System keyboard"):label("Скрыть клавиатуру","Hide keyboard");header.getChildAt(i).setContentDescription(description);header.getChildAt(i).setTooltipText(description);}
        if(keys.getChildCount()>0)rebuild();
    }
    void rebuild(){
        keys.removeAllViews();keyViews.clear();
        row(russian&&!symbols?"`1234567890":"1234567890",(russian&&!symbols?(shift||caps?"Ё":"ё"):"")+(shift?"!@#$%^&*()":"1234567890"),false,false);
        if(symbols){row("{}[]()<>;:","{}[]()<>;:",false,false);row("+-*/=&|!^~","+-*/=&|!^~",false,false);row("_#%?.,'\"\\`","_#%?.,'\"\\`",true,true);}
        else{row("qwertyuiop[]",russian?"йцукенгшщзхъ":"qwertyuiop[]",false,false);row("asdfghjkl;'",russian?"фывапролджэ":"asdfghjkl;'",false,false);row("zxcvbnm,./",russian?"ячсмитьбю.":"zxcvbnm,./",true,true);}
        LinearLayout bottom=newRow();add(bottom,russian?"RU":"EN","language",1,0);add(bottom,symbols?"ABC":"?123","symbols",1.1f,0);add(bottom,"Ctrl","ctrl",1,0);add(bottom,"Alt","alt",.9f,0);add(bottom,"","space",4,KeyEvent.KEYCODE_SPACE);add(bottom,"","enter",1.2f,KeyEvent.KEYCODE_ENTER);
    }
    LinearLayout newRow(){LinearLayout row=new LinearLayout(app);row.setGravity(Gravity.CENTER);keys.addView(row,new LinearLayout.LayoutParams(-1,0,1));return row;}
    void row(String physical,String letters,boolean shiftKey,boolean backspace){LinearLayout row=newRow();if(shiftKey)add(row,"","shift",1.35f,0);int count=Math.min(physical.length(),letters.length());for(int i=0;i<count;i++){String value=letters.substring(i,i+1);if(!symbols&&(shift||caps))value=value.toUpperCase(Locale.ROOT);char key=physical.charAt(i);add(row,value,value,1,keyCode(key));}if(backspace)add(row,"","backspace",1.35f,KeyEvent.KEYCODE_DEL);}
    int keyCode(char c){if(c>='a'&&c<='z')return KeyEvent.KEYCODE_A+c-'a';if(c>='0'&&c<='9')return c=='0'?KeyEvent.KEYCODE_0:KeyEvent.KEYCODE_1+c-'1';return c=='['?KeyEvent.KEYCODE_LEFT_BRACKET:c==']'?KeyEvent.KEYCODE_RIGHT_BRACKET:c==';'?KeyEvent.KEYCODE_SEMICOLON:c=='\''?KeyEvent.KEYCODE_APOSTROPHE:c==','?KeyEvent.KEYCODE_COMMA:c=='.'?KeyEvent.KEYCODE_PERIOD:c=='/'?KeyEvent.KEYCODE_SLASH:0;}
    void add(LinearLayout row,String title,String action,float weight,int code){
        TextView key=new TextView(app);key.setGravity(Gravity.CENTER);key.setTextSize(16);key.setTextColor(fg);key.setText(title);key.setFontFeatureSettings("tnum");
        boolean latched=action.equals("ctrl")?ctrl:action.equals("alt")?alt:action.equals("shift")&&(shift||caps);
        GradientDrawable shape=new GradientDrawable();shape.setColor(latched?(light?Color.rgb(215,228,255):Color.rgb(52,70,101)):keyBg);shape.setCornerRadius(dp(5));key.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(35,110,145,190)),shape,null));
        key.setTag(action);key.setContentDescription(action.equals("space")?label("Пробел","Space"):action.equals("enter")?label("Новая строка","Enter"):action.equals("backspace")?label("Удалить слева","Backspace"):title.isEmpty()?action:title);
        if(action.equals("space"))key.setText(russian?"Русский":"English");
        int drawable=action.equals("shift")?com.forgex.R.drawable.ic_keyboard_shift:action.equals("backspace")?com.forgex.R.drawable.ic_keyboard_backspace:action.equals("enter")?com.forgex.R.drawable.ic_keyboard_enter:0;
        if(drawable!=0){Drawable icon=app.getDrawable(drawable);icon.setTint(latched?accent:fg);icon.setBounds(0,0,dp(21),dp(21));key.setCompoundDrawables(null,null,null,null);key.setCompoundDrawablesRelative(null,null,null,null);key.setText("");key.setBackground(new LayerDrawable(new Drawable[]{key.getBackground(),new CenterIcon(icon,dp(21))}));}
        LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(0,-1,weight);size.setMargins(dp(2),dp(2),dp(2),dp(2));row.addView(key,size);keyViews.add(key);key.setOnClickListener(v->press(action,code));
        key.setOnTouchListener(new View.OnTouchListener(){float startX,startY;boolean canceled,repeated;final Runnable repeat=new Runnable(){public void run(){if(canceled||!key.isAttachedToWindow())return;repeated=true;press(action,code);app.ui.postDelayed(this,55);}};public boolean onTouch(View view,MotionEvent event){switch(event.getActionMasked()){case MotionEvent.ACTION_DOWN:startX=event.getRawX();startY=event.getRawY();canceled=repeated=false;key.setPressed(true);if(action.equals("backspace"))app.ui.postDelayed(repeat,350);return true;case MotionEvent.ACTION_MOVE:if(Math.hypot(event.getRawX()-startX,event.getRawY()-startY)>ViewConfiguration.get(app).getScaledTouchSlop()){canceled=true;app.ui.removeCallbacks(repeat);key.setPressed(false);}return true;case MotionEvent.ACTION_UP:app.ui.removeCallbacks(repeat);key.setPressed(false);if(!canceled&&!repeated)key.performClick();return true;case MotionEvent.ACTION_CANCEL:canceled=true;app.ui.removeCallbacks(repeat);key.setPressed(false);return true;default:return true;}}});
    }
    static final class CenterIcon extends Drawable{final Drawable icon;final int size;CenterIcon(Drawable icon,int size){this.icon=icon;this.size=size;}@Override public void draw(Canvas canvas){Rect b=getBounds();int x=b.centerX()-size/2,y=b.centerY()-size/2;icon.setBounds(x,y,x+size,y+size);icon.draw(canvas);}@Override public void setAlpha(int alpha){icon.setAlpha(alpha);}@Override public void setColorFilter(ColorFilter filter){icon.setColorFilter(filter);}@Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}}
    void press(String action,int code){
        switch(action){case "language":russian=!russian;prefs.edit().putBoolean("russian",russian).apply();rebuild();return;case "symbols":symbols=!symbols;shift=false;rebuild();return;case "shift":{long now=SystemClock.uptimeMillis();if(caps){caps=shift=false;lastShift=0;}else if(now-lastShift<350){caps=true;shift=false;lastShift=0;}else{shift=!shift;lastShift=now;}rebuild();return;}case "ctrl":ctrl=!ctrl;rebuild();return;case "alt":alt=!alt;rebuild();return;}
        lastShift=0;
        if(host.active==null||host.active.buffer==null)return;host.active.editor.requestFocus();
        if((ctrl||alt)&&code!=0){int meta=(ctrl?KeyEvent.META_CTRL_ON|KeyEvent.META_CTRL_LEFT_ON:0)|(alt?KeyEvent.META_ALT_ON|KeyEvent.META_ALT_LEFT_ON:0)|(shift?KeyEvent.META_SHIFT_ON:0);long now=SystemClock.uptimeMillis();app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,code,0,meta));app.dispatchKeyEvent(new KeyEvent(now,now,KeyEvent.ACTION_UP,code,0,meta));}
        else if(action.equals("backspace")){host.active.editor.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DEL));host.active.editor.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DEL));}
        else host.action(action.equals("space")?" ":action.equals("enter")?"\n":action);
        if(shift&&!caps||ctrl||alt){if(!caps)shift=false;ctrl=alt=false;rebuild();}
    }
    void drag(View view,boolean resize){view.setOnTouchListener(new View.OnTouchListener(){float startX,startY;int oldX,oldY,oldW,oldH;public boolean onTouch(View v,MotionEvent e){switch(e.getActionMasked()){case MotionEvent.ACTION_DOWN:startX=e.getRawX();startY=e.getRawY();oldX=x;oldY=y;oldW=width;oldH=height;v.getParent().requestDisallowInterceptTouchEvent(true);return true;case MotionEvent.ACTION_MOVE:if(resize){width=oldW+Math.round(e.getRawX()-startX);height=oldH+Math.round(e.getRawY()-startY);}else{x=oldX+Math.round(e.getRawX()-startX);y=oldY+Math.round(e.getRawY()-startY);}geometry(host.visible);return true;case MotionEvent.ACTION_UP:case MotionEvent.ACTION_CANCEL:saveBounds();return true;default:return true;}}});}
    void saveBounds(){int availableX=Math.max(1,app.editorRoot.getWidth()-dp(12)-width),availableY=Math.max(1,app.editorRoot.getHeight()-dp(12)-height);prefs.edit().putInt("width",width).putInt("height",height).putFloat("xRatio",Math.max(0,Math.min(1,(float)x/availableX))).putFloat("yRatio",Math.max(0,Math.min(1,(float)y/availableY))).apply();}
    JSONObject describe(View key)throws JSONException{int[] point=new int[2];key.getLocationOnScreen(point);return new JSONObject().put("action",key.getTag()).put("description",String.valueOf(key.getContentDescription())).put("x",point[0]).put("y",point[1]).put("width",key.getWidth()).put("height",key.getHeight());}
    JSONObject state()throws JSONException{JSONArray list=new JSONArray(),controls=new JSONArray(),strip=new JSONArray();for(View key:keyViews)list.put(describe(key));android.view.ViewGroup header=(android.view.ViewGroup)handle.getParent();for(int i=0;i<header.getChildCount();i++)controls.put(describe(header.getChildAt(i)));controls.put(describe(frame.findViewWithTag("resize")));android.view.ViewGroup row=(android.view.ViewGroup)host.accessory.getChildAt(0);for(int i=0;i<row.getChildCount();i++)strip.put(describe(row.getChildAt(i)));return new JSONObject().put("enabled",enabled).put("shown",frame.isShown()).put("russian",russian).put("shift",shift).put("ctrl",ctrl).put("alt",alt).put("imeHeight",app.imeHeight).put("x",x).put("y",y).put("width",width).put("height",height).put("keys",list).put("controls",controls).put("strip",strip).put("stripBounds",describe(host.accessory));}
}
