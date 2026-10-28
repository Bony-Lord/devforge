package dev.forge.ide;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Explicit system installation/uninstallation; no silent-install or verification bypass. */
final class ComponentInstaller {
    final MainActivity app;static final Map<String,Pending> pending=new ConcurrentHashMap<>();volatile Pending current;
    static final class Pending {MainActivity app;String token;int session=-1;final CompletableFuture<Boolean> result=new CompletableFuture<>();}
    ComponentInstaller(MainActivity app){this.app=app;}
    void allowed()throws IOException {if(!app.getPackageManager().canRequestPackageInstalls()){app.ui.post(()->app.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+app.getPackageName()))));throw new IOException(app.interfaceLanguage().equals("ru")?"Разрешите DevForge устанавливать выбранные компоненты в открытых настройках Android, затем повторите установку.":"Allow DevForge to install selected components in Android settings, then retry.");}}
    Pending begin(){Pending p=new Pending();p.app=app;p.token=UUID.randomUUID().toString();pending.put(p.token,p);current=p;return p;}
    android.content.IntentSender sender(Pending p){Intent intent=new Intent(app,RuntimeInstallReceiver.class).setAction("dev.forge.RUNTIME_RESULT").setData(Uri.parse("devforge-install:"+p.token));return PendingIntent.getBroadcast(app,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE).getIntentSender();}
    void waitFor(Pending p)throws Exception {try{p.result.get(10,TimeUnit.MINUTES);}catch(ExecutionException e){throw new IOException(e.getCause().getMessage());}finally{pending.remove(p.token);if(current==p)current=null;}}
    void install(File apk,JSONObject spec)throws Exception {
        allowed();PackageManager pm=app.getPackageManager();PackageInfo archive=pm.getPackageArchiveInfo(apk.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);
        if(archive==null||!archive.packageName.equals(spec.getString("package"))||archive.getLongVersionCode()!=spec.getLong("versionCode")||!RuntimeComponents.signers(archive).equals(RuntimeComponents.signers(pm.getPackageInfo(app.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES))))throw new IOException("Component APK identity/signature mismatch");
        PackageInstaller installer=pm.getPackageInstaller();PackageInstaller.SessionParams params=new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);params.setAppPackageName(archive.packageName);params.setSize(apk.length());if(Build.VERSION.SDK_INT>=31)params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        Pending p=begin();try{p.session=installer.createSession(params);try(PackageInstaller.Session session=installer.openSession(p.session)){try(InputStream in=new FileInputStream(apk);OutputStream out=session.openWrite("component.apk",0,apk.length())){byte[] bytes=new byte[131072];int n;while((n=in.read(bytes))!=-1){if(p.result.isDone())throw new InterruptedIOException("Component installation cancelled");out.write(bytes,0,n);}session.fsync(out);}session.commit(sender(p));}waitFor(p);}finally{pending.remove(p.token);if(current==p)current=null;if(!p.result.isDone()&&p.session>=0)try{installer.abandonSession(p.session);}catch(Exception ignored){}}
    }
    void remove(JSONObject spec)throws Exception {Pending p=begin();try{app.getPackageManager().getPackageInstaller().uninstall(spec.getString("package"),sender(p));waitFor(p);}finally{pending.remove(p.token);if(current==p)current=null;}}
    void installMany(List<File> apks,List<JSONObject> specs)throws Exception {
        if(apks.isEmpty())return;if(apks.size()==1||Build.VERSION.SDK_INT<29){for(int i=0;i<apks.size();i++)install(apks.get(i),specs.get(i));return;}allowed();PackageManager pm=app.getPackageManager();Set<String> own=RuntimeComponents.signers(pm.getPackageInfo(app.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES));Set<String> names=new HashSet<>();
        for(int i=0;i<apks.size();i++){PackageInfo info=pm.getPackageArchiveInfo(apks.get(i).getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);JSONObject spec=specs.get(i);if(info==null||!names.add(info.packageName)||!info.packageName.equals(spec.getString("package"))||info.getLongVersionCode()!=spec.getLong("versionCode")||!RuntimeComponents.signers(info).equals(own))throw new IOException("Component APK identity/signature mismatch");}
        PackageInstaller installer=pm.getPackageInstaller();PackageInstaller.SessionParams parent=new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);parent.setMultiPackage();if(Build.VERSION.SDK_INT>=31)parent.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);Pending p=begin();List<Integer> children=new ArrayList<>();
        try{p.session=installer.createSession(parent);try(PackageInstaller.Session transaction=installer.openSession(p.session)){for(int i=0;i<apks.size();i++){File apk=apks.get(i);PackageInstaller.SessionParams params=new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);params.setAppPackageName(specs.get(i).getString("package"));params.setSize(apk.length());int id=installer.createSession(params);children.add(id);try(PackageInstaller.Session session=installer.openSession(id)){try(InputStream in=new FileInputStream(apk);OutputStream out=session.openWrite("component.apk",0,apk.length())){byte[] bytes=new byte[131072];int n;while((n=in.read(bytes))!=-1){if(p.result.isDone())throw new InterruptedIOException("Component installation cancelled");out.write(bytes,0,n);}session.fsync(out);}transaction.addChildSessionId(id);}}transaction.commit(sender(p));}waitFor(p);}finally{pending.remove(p.token);if(current==p)current=null;for(int id:children)try{installer.abandonSession(id);}catch(Exception ignored){}if(p.session>=0)try{installer.abandonSession(p.session);}catch(Exception ignored){}}
    }
    void cancel(){Pending p=current;if(p==null)return;p.result.completeExceptionally(new IOException("Component operation cancelled"));if(p.session>=0)try{app.getPackageManager().getPackageInstaller().abandonSession(p.session);}catch(Exception ignored){}}
    static void receive(Intent intent){String data=intent.getData()==null?"":intent.getData().getSchemeSpecificPart();Pending p=pending.get(data);if(p==null)return;int status=intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);if(status==PackageInstaller.STATUS_PENDING_USER_ACTION){Intent confirmation=intent.getParcelableExtra(Intent.EXTRA_INTENT);if(confirmation==null){p.result.completeExceptionally(new IOException("Android did not provide installation confirmation"));return;}p.app.ui.post(()->{try{if(p.app.isFinishing()||p.app.isDestroyed())throw new IllegalStateException("Return to DevForge and retry component installation");p.app.startActivity(confirmation);}catch(Exception error){p.result.completeExceptionally(error);}});}else if(status==PackageInstaller.STATUS_SUCCESS)p.result.complete(true);else p.result.completeExceptionally(new IOException("Android component operation failed ("+status+"): "+intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)));}
}
