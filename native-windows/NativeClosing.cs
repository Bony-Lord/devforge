using System.ComponentModel;
using System.Windows;

namespace DevForge.Native;

public partial class MainWindow
{
    bool closeInProgress;
    internal void AllowTestExit() => closing=true;
    async void OnWindowClosing(object? sender,CancelEventArgs args)
    {
        if(closing||!initialized)return;
        args.Cancel=true;if(closeInProgress)return;closeInProgress=true;
        try
        {
            try { await SaveAll();await SaveNativeState(); }
            catch(Exception error)
            {
                if(App.IsSelfTest){App.FailTest(error);return;}
                if(MessageBox.Show(this,"Не удалось сохранить изменения.\n\n"+error.Message+"\n\nЗакрыть без сохранения?","Закрытие DevForge",MessageBoxButton.YesNo,MessageBoxImage.Warning,MessageBoxResult.No)!=MessageBoxResult.Yes)return;
            }
            closing=true;Backend.Event-=ReceiveEvent;
            try { await Call("windowClose"); }
            finally { if(Application.Current.Windows.OfType<MainWindow>().Count()==1)await Backend.DisposeAsync(); }
            Close();
        }
        catch(Exception error)
        {
            if(App.IsSelfTest){App.FailTest(error);return;}
            // Project files have already been saved or the user explicitly chose
            // to discard changes. A failed service shutdown must not trap a window.
            closing=true;Close();
        }
        finally { closeInProgress=false; }
    }
}
