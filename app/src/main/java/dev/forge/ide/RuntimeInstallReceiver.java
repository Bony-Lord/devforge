package dev.forge.ide;
import android.content.*;
public final class RuntimeInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){ComponentInstaller.receive(intent);}
}
