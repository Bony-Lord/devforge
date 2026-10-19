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
    IdeEngine engine;
    final Handler ui = new Handler(Looper.getMainLooper());
    final ExecutorService workers = Executors.newCachedThreadPool();
    TextView progress;
    ServerSocket assets;
    volatile boolean closed;
    String baseUrl;
    String secret = UUID.randomUUID().toString();
    String pendingExport;
    FrameLayout editorRoot;
    int keyboardOverlap=100,imeHeight=0,imeReserved=-1;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
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
        status("GCC C++ STUDIO\n\nПодготовка локальных инструментов…\nПервый запуск может занять несколько минут.");
        workers.execute(() -> {
            try {
                installRuntime();
                engine = new IdeEngine(this);
                serveAssets();
                ui.post(this::showEditor);
            } catch (Throwable e) {
                android.util.Log.e("Forge", "Startup", e);
                status("Не удалось запустить GCC C++ Studio\n\n"+e+"\n\nПроверьте свободное место: нужно около 1 ГБ.");
            }
        });
    }
    void status(String s) { ui.post(() -> progress.setText(s)); }
    void installRuntime() throws Exception {
        String abi = Build.SUPPORTED_ABIS[0];
        String expected;
        try(InputStream in=getAssets().open("runtime-info.json")){expected=new JSONObject(IdeEngine.slurp(in,1024)).getString("arch");}
        String actual=abi.equals("arm64-v8a")?"aarch64":abi.equals("x86_64")?"x86_64":abi.startsWith("armeabi")?"arm":abi;
        if (!actual.equals(expected)) throw new IOException("Эта сборка: "+expected+". Архитектура устройства: "+abi);
        File usr = new File(getFilesDir(), "usr");
        File marker = new File(usr,".forge-runtime-v1");
        if (marker.exists()) {ensureShell(usr);return;}
        usr.mkdirs();
        int count = 0;
        try (ZipInputStream z = new ZipInputStream(getAssets().open("runtime.zip"))) {
            ZipEntry entry;
            byte[] buffer = new byte[131072];
            while ((entry = z.getNextEntry()) != null) {
                File f = new File(usr,entry.getName());
                if (!f.getCanonicalPath().startsWith(usr.getCanonicalPath()+"/")) throw new IOException("Invalid runtime path");
                if (entry.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(f)) {
                    int n;
                    while ((n=z.read(buffer))>0) out.write(buffer,0,n);
                }
                if (++count % 140 == 0) status("GCC C++ STUDIO\n\nРаспаковка GCC и clangd…\n"+count+" файлов · выполняется один раз");
            }
        }
        JSONObject manifest = new JSONObject(new String(Files.readAllBytes(new File(usr,"forge-runtime.json").toPath()), StandardCharsets.UTF_8));
        JSONArray files = manifest.getJSONArray("files");
        for(int i=0;i<files.length();i++) {
            JSONObject f=files.getJSONObject(i);
            if(f.optBoolean("exec")) new File(usr,f.getString("path")).setExecutable(true,true);
            if(f.has("mtime"))new File(usr,f.getString("path")).setLastModified(f.getLong("mtime")*1000L);
        }
        JSONArray links = manifest.getJSONArray("links");
        for(int round=0;round<2;round++) for(int i=0;i<links.length();i++) {
            JSONObject l=links.getJSONObject(i);
            File f=new File(usr,l.getString("path"));
            f.getParentFile().mkdirs();
            if(Files.exists(f.toPath(), LinkOption.NOFOLLOW_LINKS)) continue;
            String target=l.getString("target");
            try {
                if(l.optBoolean("hard")) {
                    target=target.replaceFirst("^\\.?/?data/data/com.termux/files/usr/","");
                    Files.createLink(f.toPath(),new File(usr,target).toPath());
                } else Files.createSymbolicLink(f.toPath(),Paths.get(target));
            } catch(IOException e) { if(round==1) android.util.Log.w("Forge","Runtime link "+f+" -> "+target,e); }
        }
        new File(getFilesDir(),"tmp").mkdirs();
        ensureShell(usr);
        Files.write(marker.toPath(),"1".getBytes(StandardCharsets.UTF_8));
    }
    void ensureShell(File usr)throws IOException {
        File sh=new File(usr,"bin/sh");
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
        ui.post(() -> {keyboardOverlap=value;imeReserved=-1;updateKeyboardGeometry(imeHeight);});
    }
    void updateKeyboardGeometry(int height) {
        boolean sameHeight=imeHeight==height;
        imeHeight=height;
        int reserved=Math.round(height*(100-keyboardOverlap)/100f);
        if(editorRoot==null||web==null||(reserved==imeReserved&&sameHeight))return;
        imeReserved=reserved;
        FrameLayout.LayoutParams layout=(FrameLayout.LayoutParams)web.getLayoutParams();
        layout.bottomMargin=reserved;web.setLayoutParams(layout);
        float scale=web.getScale();if(scale<=0)scale=getResources().getDisplayMetrics().density;
        try{event("keyboardGeometry",new JSONObject().put("visible",height>0).put("height",height/scale).put("reserved",reserved/scale).put("overlap",(height-reserved)/scale).put("percent",keyboardOverlap));}catch(JSONException ignored){}
    }
    void showKeyboard() {
        ui.post(() -> {
            if(web==null)return;
            web.requestFocus();
            web.postDelayed(() -> ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT),80);
        });
    }
    final class Bridge {
        @JavascriptInterface public void request(String json) {
            workers.execute(() -> {
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
    void exportProject(String name) { ui.post(() -> { pendingExport=name; Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT); i.setType("application/zip"); i.addCategory(Intent.CATEGORY_OPENABLE); i.putExtra(Intent.EXTRA_TITLE,name+".zip"); startActivityForResult(i,13); }); }
    void importFile() { ui.post(() -> { Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("*/*"); i.addCategory(Intent.CATEGORY_OPENABLE); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivityForResult(i,14); }); }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        workers.execute(() -> {
            try {
                if(request==12) {
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
    @Override public void onBackPressed() {emitScript("window.forgeBack && window.forgeBack()");}
    @Override public boolean onKeyDown(int key,KeyEvent event) {
        if(key==KeyEvent.KEYCODE_F5) {emitScript(event.isShiftPressed()?"window.forge && forge.stop()":"window.forgeRun && window.forgeRun()");return true;}
        if(key==KeyEvent.KEYCODE_F9) {
            emitScript(event.isShiftPressed()?"window.forge && forge.debugBuild()":event.isCtrlPressed()?"window.forgeBuild && window.forgeBuild()":"window.forge && (forge.debugger.active ? forge.debugger.action('continue') : forge.build(false))");return true;
        }
        if(key==KeyEvent.KEYCODE_F8||key==KeyEvent.KEYCODE_F7){emitScript("window.forge && forge.debugger.active && forge.debugger.action("+JSONObject.quote(key==KeyEvent.KEYCODE_F7?"step":event.isShiftPressed()?"finish":"next")+")");return true;}
        return super.onKeyDown(key,event);
    }
    @Override protected void onDestroy() {
        closed=true;
        if(engine!=null)engine.close();
        try{if(assets!=null)assets.close();}catch(IOException ignored){}
        if(web!=null)web.destroy();
        workers.shutdownNow();
        super.onDestroy();
    }
}
