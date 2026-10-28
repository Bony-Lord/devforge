package dev.forge.ide;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.graphics.Color;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;

public final class MainActivity extends Activity {
    WebView web;
    final ResponsivenessWatch responsiveness=new ResponsivenessWatch();
    IdeEngine engine;
    final Handler ui = new Handler(Looper.getMainLooper());
    final ExecutorService workers = Executors.newCachedThreadPool();
    final ExecutorService preferenceWrites = Executors.newSingleThreadExecutor();
    TextView progress;
    ServerSocket assets;
    volatile boolean closed;
    String baseUrl;
    String secret = UUID.randomUUID().toString();
    String pendingExport;
    FrameLayout editorRoot;
    NativeEditorHost nativeEditors;
    int keyboardOverlap=100,imeHeight=0,imeReserved=-1;
    String completionShortcut="Ctrl+Alt+Space",parameterShortcut="Ctrl+Alt+P";

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        ((android.hardware.input.InputManager)getSystemService(INPUT_SERVICE)).registerInputDeviceListener(layoutDevices,ui);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(43,45,48));
        getWindow().setNavigationBarColor(Color.rgb(43,45,48));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        progress = new TextView(this);
        progress.setTextColor(Color.rgb(222,226,239));
        progress.setBackgroundColor(Color.rgb(43,45,48));
        progress.setGravity(Gravity.CENTER);
        progress.setTextSize(18);
        progress.setPadding(32,32,32,32);
        setContentView(progress);
        status(interfaceLanguage().equals("ru")?"C++ STUDIO\n\nПодготовка редактора…":"C++ STUDIO\n\nPreparing editor…");
        workers.execute(() -> {
            try {
                if((getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)StabilityDiagnostics.captureExitHistory(this);
                installRuntime();
                engine = new IdeEngine(this);
                serveAssets();
                ui.post(this::showEditor);
            } catch (Throwable e) {
                android.util.Log.e("Forge", "Startup", e);
                status("Не удалось запустить C++ Studio\n\n"+e+"\n\nПроверьте свободное место: нужно около 1 ГБ.");
            }
        });
    }
    void status(String s) { ui.post(() -> progress.setText(s)); }
    String interfaceLanguage(){try{String value=new JSONObject(getSharedPreferences("forge",0).getString("settings","{}")).optString("language",Locale.getDefault().getLanguage());return value.equals("ru")?"ru":"en";}catch(JSONException e){return "ru";}}
    void installRuntime() throws Exception {
        String abi = Build.SUPPORTED_ABIS[0];
        String expected;
        try(InputStream in=getAssets().open("runtime-info.json")){expected=new JSONObject(IdeEngine.slurp(in,1024)).getString("arch");}
        String actual=abi.equals("arm64-v8a")?"aarch64":abi.equals("x86_64")?"x86_64":abi.startsWith("armeabi")?"arm":abi;
        if (!actual.equals(expected)) throw new IOException("Эта сборка: "+expected+". Архитектура устройства: "+abi);
        File usr = new File(getFilesDir(), "usr");
        try(InputStream in=getAssets().open("tool-packs.json")){
            if(new JSONObject(IdeEngine.slurp(in,4*1024*1024)).optString("delivery").equals("download")){
                usr.mkdirs();new File(getFilesDir(),"tmp").mkdirs();ensureShell(usr);return;
            }
        }
        File marker = new File(usr,".studio-base-v2");
        String baseHash;try(InputStream in=getAssets().open("tool-packs.json")){baseHash=new JSONObject(IdeEngine.slurp(in,4*1024*1024)).getJSONObject("base").getString("sha256");}
        if(marker.exists()&&IdeEngine.read(marker).equals(baseHash)){ensureShell(usr);return;}
        usr.mkdirs();File archive=new File(getCacheDir(),"runtime-base.zip");
        try(InputStream in=getAssets().open("runtime.zip")){Files.copy(in,archive.toPath(),StandardCopyOption.REPLACE_EXISTING);}
        try{ToolPacks.extract(usr,archive,"base");}finally{Files.deleteIfExists(archive.toPath());}
        if(new File(usr,".gcc-removed").exists()){try(InputStream in=getAssets().open("tool-packs.json")){ToolPacks.removeGccFiles(usr,new JSONObject(IdeEngine.slurp(in,4*1024*1024)).getJSONObject("base"));}}
        new File(getFilesDir(),"tmp").mkdirs();ensureShell(usr);Files.write(marker.toPath(),baseHash.getBytes(StandardCharsets.UTF_8));
    }

    void ensureShell(File usr)throws IOException {
        File sh=new File(usr,"bin/sh");
        sh.getParentFile().mkdirs();
        if(!Files.exists(sh.toPath(),LinkOption.NOFOLLOW_LINKS))Files.createSymbolicLink(sh.toPath(),Paths.get("/system/bin/sh"));
    }
    void serveAssets() throws IOException {
        assets=new ServerSocket(0,12,InetAddress.getByName("127.0.0.1"));
        baseUrl="http://127.0.0.1:"+assets.getLocalPort()+"/"+secret+"/";
        workers.execute(() -> {
            while(!closed) try {
                final Socket client=assets.accept();
                workers.execute(() -> serve(client));
            } catch(IOException e) { if(!closed) android.util.Log.w("Forge","Assets",e); }
        });
    }
    void serve(Socket socket) {
        try(Socket s=socket) {
            s.setSoTimeout(10000);
            BufferedReader reader=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.US_ASCII));
            String line=reader.readLine();
            if(line==null) return;
            String[] parts=line.split(" ");
            if(parts.length<2) return;
            String path=parts[1].split("\\?",2)[0];
            while((line=reader.readLine())!=null && !line.isEmpty()) {}
            if(!path.startsWith("/"+secret+"/") || path.contains("..") || !parts[0].equals("GET")) {
                s.getOutputStream().write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); return;
            }
            path=path.substring(secret.length()+2);
            if(path.isEmpty()) path="index.html";
            String type=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".html")?"text/html":path.endsWith(".json")?"application/json":path.endsWith(".ttf")?"font/ttf":path.endsWith(".svg")?"image/svg+xml":"application/octet-stream";
            try(InputStream in=getAssets().open("ui/"+path)) {
                OutputStream out=s.getOutputStream();
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: "+type+"; charset=utf-8\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                if(path.equals("index.html")){
                    String html=IdeEngine.slurp(in,1024*1024).replace("<head>","<head><script>window.STUDIO_BOOT_LANGUAGE="+JSONObject.quote(interfaceLanguage())+";</script>");out.write(html.getBytes(StandardCharsets.UTF_8));return;
                }
                byte[] b=new byte[32768]; int n; while((n=in.read(b))>0) out.write(b,0,n);
            } catch(IOException e) { /* client disconnected or missing asset */ }
        } catch(Exception e) { android.util.Log.d("Forge","Asset request",e); }
    }
    void showEditor() {
        if(isFinishing())return;
        web=new WebView(this);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setOnTouchListener((view,event) -> {
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN&&!view.hasFocus())view.requestFocus();
            return false;
        });
        web.setBackgroundColor(Color.rgb(30,31,34));
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setSafeBrowsingEnabled(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportZoom(false); s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(),"ForgeNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(baseUrl);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("ForgeJS",m.message()+" @"+m.lineNumber()); return true;
            }
        });
        editorRoot=new FrameLayout(this);
        editorRoot.addView(web,new FrameLayout.LayoutParams(-1,-1));
        nativeEditors=new NativeEditorHost(this);
        getWindow().getDecorView().setOnApplyWindowInsetsListener((view,insets) -> {
            if(Build.VERSION.SDK_INT>=30) {
                int bottom=insets.isVisible(WindowInsets.Type.ime())?insets.getInsets(WindowInsets.Type.ime()).bottom-insets.getInsets(WindowInsets.Type.navigationBars()).bottom:0;
                updateKeyboardGeometry(Math.max(0,bottom));
            }
            return view.onApplyWindowInsets(insets);
        });
        if(Build.VERSION.SDK_INT<30)editorRoot.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            android.graphics.Rect visible=new android.graphics.Rect();editorRoot.getWindowVisibleDisplayFrame(visible);
            int[] point=new int[2];editorRoot.getLocationOnScreen(point);
            int obscured=Math.max(0,point[1]+editorRoot.getHeight()-visible.bottom);
            updateKeyboardGeometry(obscured>editorRoot.getHeight()*.15?obscured:0);
        });
        setContentView(editorRoot);web.requestFocus();web.loadUrl(baseUrl);getWindow().getDecorView().requestApplyInsets();
        try{configureKeyboard(new JSONObject(engine.prefs.getString("settings","{}")));}catch(JSONException ignored){}
    }
    void configureKeyboard(JSONObject settings) {
        final int value=Math.max(0,Math.min(100,settings.optInt("keyboardOverlap",100)));
        final boolean layoutShortcut=settings.optBoolean("altShiftLayout",true);
        final String completion=settings.optString("completionShortcut","Ctrl+Alt+Space"),parameters=settings.optString("parameterShortcut","Ctrl+Alt+P");
        ui.post(() -> {altShiftLayout=layoutShortcut;if(!altShiftLayout)hardwareLayouts.clear();completionShortcut=completion;parameterShortcut=parameters;if(keyboardOverlap!=value){keyboardOverlap=value;imeReserved=-1;updateKeyboardGeometry(imeHeight);}});
    }
    boolean matchesCompletionShortcut(KeyEvent event,String binding){
        if(!event.isCtrlPressed()||event.isMetaPressed()||event.isAltPressed()!=binding.contains("+Alt+")||event.isShiftPressed()!=binding.contains("+Shift+"))return false;
        int code=binding.endsWith("+Enter")?KeyEvent.KEYCODE_ENTER:binding.endsWith("+Space")?KeyEvent.KEYCODE_SPACE:binding.endsWith("+P")?KeyEvent.KEYCODE_P:binding.endsWith("+I")?KeyEvent.KEYCODE_I:0;
        return code!=0&&event.getKeyCode()==code;
    }
    void updateKeyboardGeometry(int height) {
        boolean sameHeight=imeHeight==height;
        imeHeight=height;
        int reserved=Math.round(height*(100-keyboardOverlap)/100f);
        if(editorRoot==null||web==null||(reserved==imeReserved&&sameHeight))return;
        imeReserved=reserved;
        FrameLayout.LayoutParams layout=(FrameLayout.LayoutParams)web.getLayoutParams();
        layout.bottomMargin=reserved;web.setLayoutParams(layout);
        if(nativeEditors!=null)nativeEditors.geometry();
        float scale=web.getScale();if(scale<=0)scale=getResources().getDisplayMetrics().density;
        try{event("keyboardGeometry",new JSONObject().put("visible",height>0).put("height",height/scale).put("reserved",reserved/scale).put("overlap",(height-reserved)/scale).put("percent",keyboardOverlap));}catch(JSONException ignored){}
    }
    void showKeyboard() {
        ui.post(() -> {
            if(nativeEditors!=null&&nativeEditors.active!=null){nativeEditors.showKeyboard();return;}
            if(web==null)return;
            web.requestFocus();
            web.postDelayed(() -> ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT),80);
        });
    }
    final class Bridge {
        @JavascriptInterface public void request(String json) {
            boolean preferenceRequest=false;
            try {
                JSONObject r=new JSONObject(json);
                if(r.optString("op").startsWith("editor")){
                    ui.post(()->{try{respond(r.optString("id"),nativeEditors.handle(r.optString("op"),r.optJSONObject("data")),null);}catch(Throwable e){android.util.Log.e("Studio","Native editor",e);respond(r.optString("id"),null,e.toString());}});
                    return;
                }
                preferenceRequest=Arrays.asList("settings","settingsCommit","session","sessionCommit","addonState","addonStateCommit","addonLibrary","addonCatalog","addonBegin","addonFinish").contains(r.optString("op"));
            }catch(JSONException ignored){}
            (preferenceRequest?preferenceWrites:workers).execute(() -> {
                String id="";
                try {
                    JSONObject r=new JSONObject(json); id=r.getString("id");
                    Object result=engine.handle(r.getString("op"),r.optJSONObject("data"));
                    respond(id,result,null);
                } catch(Throwable e) { android.util.Log.w("Forge","Bridge request",e); respond(id,null,e.getMessage()==null?e.toString():e.getMessage()); }
            });
        }
    }
    void respond(String id,Object value,String error) {
        JSONObject result=new JSONObject();
        try { result.put("id",id); result.put("value",value==null?JSONObject.NULL:value); if(error!=null)result.put("error",error); } catch(JSONException ignored){}
        emitScript("window.__nativeResult && window.__nativeResult("+result+")");
    }
    void event(String kind,Object value) {
        emitScript("window.__nativeEvent && window.__nativeEvent("+JSONObject.quote(kind)+","+(value==null?"null":value.toString())+")");
    }
    void emitScript(String js) { ui.post(() -> { if(web!=null&&!closed)web.evaluateJavascript(js,null); }); }
    void importProject() { ui.post(() -> { Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivityForResult(i,12); }); }
    void requestStorageAccess() {
        ui.post(() -> {
            if(Build.VERSION.SDK_INT>=30){
                try{startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,Uri.parse("package:"+getPackageName())));}
                catch(ActivityNotFoundException e){startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));}
            }else requestPermissions(new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE,android.Manifest.permission.WRITE_EXTERNAL_STORAGE},92);
        });
    }
    @Override protected void onResume(){super.onResume();responsiveness.foreground(true);if(engine!=null)try{event("storageAccess",new JSONObject().put("permission",engine.workspace.permission()));}catch(Exception ignored){}}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==92)try{event("storageAccess",new JSONObject().put("permission",engine.workspace.permission()));}catch(Exception ignored){}}
    void exportProject(String name) { ui.post(() -> { pendingExport=name; Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT); i.setType("application/zip"); i.addCategory(Intent.CATEGORY_OPENABLE); i.putExtra(Intent.EXTRA_TITLE,name+".zip"); startActivityForResult(i,13); }); }
    void importFile() { ui.post(() -> { Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivityForResult(i,14); }); }
    String pendingAddonExport;
    void exportAddon(JSONObject pkg)throws Exception{AddonPackages.pack(pkg);String text=pkg.toString(2);if(text.getBytes(StandardCharsets.UTF_8).length>262144)throw new IOException("Addon export exceeds size limit");ui.post(()->{pendingAddonExport=text;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.setType("application/octet-stream");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.putExtra(Intent.EXTRA_TITLE,"workspace.studio-addon");startActivityForResult(intent,16);});}
    void importAddon(){ui.post(()->{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(intent,15);});}
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        workers.execute(() -> {
            try {
                if(request==16){
                    String content=pendingAddonExport;pendingAddonExport=null;if(content==null)throw new IOException("Addon export expired; retry");try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException("Cannot save addon package");out.write(content.getBytes(StandardCharsets.UTF_8));}event("toast",JSONObject.quote(interfaceLanguage().equals("ru")?"Пак состава сохранён":"Composition pack saved"));
                } else if(request==15){
                    try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Cannot read addon document");String content=IdeEngine.slurp(in,262144);event("addonImported",new JSONObject().put("text",content));}
                } else if(request==12) {
                    File dest=engine.newProjectDir("import-"+System.currentTimeMillis());
                    copyDocumentTree(uri,DocumentsContract.getTreeDocumentId(uri),dest,new long[]{0,0});
                    event("imported",new JSONObject().put("project",dest.getName()));
                } else if(request==13) {
                    try(OutputStream out=getContentResolver().openOutputStream(uri,"w")) {engine.exportZip(pendingExport,out);}
                    event("toast",JSONObject.quote("Архив проекта сохранён"));
                } else if(request==14) {
                    String name="import.cpp";
                    try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {if(c!=null&&c.moveToFirst())name=c.getString(0);}
                    name=new File(name).getName();
                    if(!name.matches("[\\w .+()-]+"))name="import.cpp";
                    File f=engine.uniqueImportFile(name);
                    try(InputStream in=getContentResolver().openInputStream(uri)) {copyLimited(in,new FileOutputStream(f),4*1024*1024);}
                    event("fileImported",new JSONObject().put("path",f.getAbsolutePath()));
                }
            }catch(Exception e) {event("toast",JSONObject.quote("Импорт/экспорт: "+e.getMessage()));}
        });
    }
    void copyDocumentTree(Uri tree,String id,File dest,long[] limits)throws Exception {
        dest.mkdirs();
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,id);
        try(Cursor c=getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)) {
            if(c==null)return;
            while(c.moveToNext()) {
                String child=c.getString(0),name=c.getString(1),mime=c.getString(2);
                if(name.equals(".git")||name.equals(".forge")||name.equals("build")||name.contains("/")||name.equals(".."))continue;
                if(++limits[0]>10000)throw new IOException("В проекте больше 10 000 файлов");
                File f=new File(dest,name);
                if(mime.equals(DocumentsContract.Document.MIME_TYPE_DIR))copyDocumentTree(tree,child,f,limits);
                else try(InputStream in=getContentResolver().openInputStream(DocumentsContract.buildDocumentUriUsingTree(tree,child))) {
                    limits[1]+=copyLimited(in,new FileOutputStream(f),32*1024*1024);
                    if(limits[1]>256*1024*1024)throw new IOException("Проект больше 256 МБ");
                }
            }
        }
    }
    static long copyLimited(InputStream in,OutputStream out,long max)throws IOException {
        try(OutputStream o=out) {byte[] b=new byte[32768];int n;long total=0;while((n=in.read(b))>0){total+=n;if(total>max)throw new IOException("Файл слишком большой");o.write(b,0,n);}return total;}
    }
    @Override public void onBackPressed() {if(nativeEditors!=null&&nativeEditors.floatingKeyboard.frame.isShown()){nativeEditors.floatingKeyboard.hide();return;}emitScript("window.forgeBack && window.forgeBack()");}
    @Override protected void onPause(){responsiveness.foreground(false);for(HardwareLayout layout:hardwareLayouts.values())layout.resetChord();if(nativeEditors!=null)nativeEditors.pause();super.onPause();}
    final java.util.Map<Integer,HardwareLayout> hardwareLayouts=new java.util.HashMap<>();
    final android.hardware.input.InputManager.InputDeviceListener layoutDevices=new android.hardware.input.InputManager.InputDeviceListener(){public void onInputDeviceAdded(int id){}public void onInputDeviceChanged(int id){hardwareLayouts.remove(id);}public void onInputDeviceRemoved(int id){hardwareLayouts.remove(id);}};
    boolean altShiftLayout=true;
    boolean hardwareLayout(KeyEvent event){
        if(!altShiftLayout||event.getDeviceId()<0||nativeEditors==null)return false;
        int key=event.getKeyCode();boolean down=event.getAction()==KeyEvent.ACTION_DOWN,modifier=key==KeyEvent.KEYCODE_ALT_LEFT||key==KeyEvent.KEYCODE_ALT_RIGHT||key==KeyEvent.KEYCODE_SHIFT_LEFT||key==KeyEvent.KEYCODE_SHIFT_RIGHT;
        HardwareLayout layout=hardwareLayouts.computeIfAbsent(event.getDeviceId(),id->{HardwareLayout value=new HardwareLayout();value.observe(event.getKeyCharacterMap().get(KeyEvent.KEYCODE_Q,0));return value;});
        if(key==KeyEvent.KEYCODE_LANGUAGE_SWITCH||key==KeyEvent.KEYCODE_SPACE&&event.isCtrlPressed()&&!event.isAltPressed()){layout.systemSwitch();return false;}
        if(down&&!event.isCtrlPressed()&&!event.isMetaPressed())layout.observe(event.getUnicodeChar(event.getMetaState()&~(KeyEvent.META_ALT_MASK|KeyEvent.META_CTRL_MASK|KeyEvent.META_META_MASK)));
        if(layout.chord(down,modifier,event.isAltPressed()&&event.isShiftPressed(),event.isCtrlPressed()||event.isMetaPressed())){android.widget.Toast.makeText(this,Boolean.TRUE.equals(layout.russian)?"RU":"EN",android.widget.Toast.LENGTH_SHORT).show();return true;}
        if(layout.russian==null||modifier||event.isAltPressed()||event.isCtrlPressed()||event.isMetaPressed())return false;
        String text=layout.translate(key,event.isShiftPressed(),event.isCapsLockOn());if(text==null)return false;
        if(nativeEditors.webFieldFocused){if(down)emitScript("window.StudioWebInput&&StudioWebInput("+JSONObject.quote(text)+")");return true;}
        if(nativeEditors.active!=null&&nativeEditors.active.editor.hasFocus()){if(down)nativeEditors.active.editor.commitText(text);return true;}
        return false;
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        if(hardwareLayout(event))return true;
        if(nativeEditors!=null&&nativeEditors.active!=null&&nativeEditors.active.editor.hasFocus()&&event.getAction()==KeyEvent.ACTION_DOWN){
            int key=event.getKeyCode();boolean ctrl=event.isCtrlPressed();
            boolean appKey=ctrl&&(key==KeyEvent.KEYCODE_F||key==KeyEvent.KEYCODE_H||key==KeyEvent.KEYCODE_S||key==KeyEvent.KEYCODE_P||key==KeyEvent.KEYCODE_N||key==KeyEvent.KEYCODE_COMMA||key==KeyEvent.KEYCODE_J||key==KeyEvent.KEYCODE_B||key==KeyEvent.KEYCODE_Q||key==KeyEvent.KEYCODE_G||key==KeyEvent.KEYCODE_W||key==KeyEvent.KEYCODE_TAB||key==KeyEvent.KEYCODE_EQUALS||key==KeyEvent.KEYCODE_MINUS||key==KeyEvent.KEYCODE_0||key==KeyEvent.KEYCODE_BACKSLASH||key==KeyEvent.KEYCODE_1||key==KeyEvent.KEYCODE_2||key==KeyEvent.KEYCODE_D||key==KeyEvent.KEYCODE_Y||key==KeyEvent.KEYCODE_L||key==KeyEvent.KEYCODE_O);
            appKey|=matchesCompletionShortcut(event,completionShortcut)||matchesCompletionShortcut(event,parameterShortcut);
            appKey|=key==KeyEvent.KEYCODE_ESCAPE||(event.isAltPressed()&&!ctrl&&(key==KeyEvent.KEYCODE_1||key==KeyEvent.KEYCODE_4||key==KeyEvent.KEYCODE_5||key==KeyEvent.KEYCODE_6||key==KeyEvent.KEYCODE_7||key==KeyEvent.KEYCODE_9));
            appKey|=ctrl&&event.isAltPressed()&&(key==KeyEvent.KEYCODE_DPAD_RIGHT||key==KeyEvent.KEYCODE_DPAD_DOWN||key==KeyEvent.KEYCODE_DPAD_UP||key==KeyEvent.KEYCODE_R||key==KeyEvent.KEYCODE_K||key==KeyEvent.KEYCODE_T||key==KeyEvent.KEYCODE_E);
            appKey|=key==KeyEvent.KEYCODE_F7||key==KeyEvent.KEYCODE_F8||key==KeyEvent.KEYCODE_F5||key==KeyEvent.KEYCODE_F9||key==KeyEvent.KEYCODE_F12||key==KeyEvent.KEYCODE_F2||(event.isShiftPressed()&&key==KeyEvent.KEYCODE_F6)||(event.isAltPressed()&&(key==KeyEvent.KEYCODE_ENTER||key==KeyEvent.KEYCODE_F12))||(event.isShiftPressed()&&event.isAltPressed()&&key==KeyEvent.KEYCODE_F);
            if(appKey){String name=KeyEvent.keyCodeToString(key).replace("KEYCODE_","");if(key==KeyEvent.KEYCODE_SPACE)name=" ";else if(key==KeyEvent.KEYCODE_ENTER)name="Enter";else if(key==KeyEvent.KEYCODE_ESCAPE)name="Escape";else if(key==KeyEvent.KEYCODE_TAB)name="Tab";else if(key==KeyEvent.KEYCODE_DPAD_RIGHT)name="ArrowRight";else if(key==KeyEvent.KEYCODE_DPAD_DOWN)name="ArrowDown";else if(key==KeyEvent.KEYCODE_DPAD_UP)name="ArrowUp";else if(key==KeyEvent.KEYCODE_EQUALS)name="=";else if(key==KeyEvent.KEYCODE_MINUS)name="-";else if(key==KeyEvent.KEYCODE_COMMA)name=",";else if(key==KeyEvent.KEYCODE_BACKSLASH)name="\\";
                String js="window.forge&&forge.keydown({key:"+JSONObject.quote(name)+",ctrlKey:"+ctrl+",altKey:"+event.isAltPressed()+",shiftKey:"+event.isShiftPressed()+",metaKey:false,preventDefault(){},stopImmediatePropagation(){}})";emitScript(js);return true;}
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public boolean onKeyDown(int key,KeyEvent event) {
        if(key==KeyEvent.KEYCODE_F8&&event.isCtrlPressed()){emitScript("window.forge && !document.querySelector('dialog[open]') && forge.debugger.breakpointAtCaret()");return true;}
        if(key==KeyEvent.KEYCODE_F5) {emitScript(event.isShiftPressed()?"window.forge && forge.stop()":"window.forgeRun && window.forgeRun()");return true;}
        if(key==KeyEvent.KEYCODE_F9) {
            emitScript(event.isShiftPressed()?"window.forge && forge.debugBuild()":event.isCtrlPressed()?"window.forgeBuild && window.forgeBuild()":"window.forge && (forge.debugger.active ? forge.debugger.action('continue') : forge.build(false))");return true;
        }
        if(key==KeyEvent.KEYCODE_F8||key==KeyEvent.KEYCODE_F7){emitScript("window.forge && forge.debugger.active && forge.debugger.action("+JSONObject.quote(key==KeyEvent.KEYCODE_F7?"step":event.isShiftPressed()?"finish":"next")+")");return true;}
        return super.onKeyDown(key,event);
    }
    @Override protected void onDestroy() {
        ((android.hardware.input.InputManager)getSystemService(INPUT_SERVICE)).unregisterInputDeviceListener(layoutDevices);
        closed=true;responsiveness.close();
        if(nativeEditors!=null)nativeEditors.close();
        if(engine!=null)engine.close();
        try{if(assets!=null)assets.close();}catch(IOException ignored){}
        if(web!=null)web.destroy();
        workers.shutdownNow();
        preferenceWrites.shutdown();
        super.onDestroy();
    }
}
