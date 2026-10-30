using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace DevForge.Native;

internal static class NativeEntry
{
    [STAThread]
    public static int Main(string[] args)
    {
        App.Arguments=args;
        if(args.Contains("--self-test"))
        {
            try
            {
                if(!args.Contains("--isolated"))throw new InvalidOperationException("Self-tests require an isolated data directory");
                // Never switch the user's input desktop. The test creates real
                // native controls on its own desktop, including keyboard focus.
                var child=args.FirstOrDefault(a=>a.StartsWith("--test-desktop-child="))?[21..];
                if(child is null)return RunIsolatedDesktop(args);
                var name=new StringBuilder(256);
                if(!child.StartsWith("DevForgeTest-",StringComparison.Ordinal)||!GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,name,512,out _)||name.ToString()!=child)throw new InvalidOperationException("Test child is not attached to its isolated desktop");
            }
            catch(Exception error){NativeChecks.Failed(error).GetAwaiter().GetResult();return 1;}
        }
        var app=new App();app.InitializeComponent();return app.Run();
    }
    static int RunIsolatedDesktop(string[] args)
    {
        var name="DevForgeTest-"+Guid.NewGuid().ToString("N");var desktop=CreateDesktop(name,null,IntPtr.Zero,0,0x10000000,IntPtr.Zero);
        if(desktop==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
        ProcessInfo process=default;
        try
        {
            // Assign the desktop before the child CLR initializes COM/WPF. A
            // running STA thread may already own windows and cannot be moved.
            var startup=new StartupInfo{Size=Marshal.SizeOf<StartupInfo>(),Desktop=name};
            var executable=Environment.ProcessPath??throw new InvalidOperationException("Executable unavailable");
            var command=new StringBuilder(string.Join(" ",new[]{executable}.Concat(args).Append("--test-desktop-child="+name).Select(Quote)));
            if(!CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,false,0,IntPtr.Zero,Environment.CurrentDirectory,ref startup,out process))throw new Win32Exception(Marshal.GetLastWin32Error());
            WaitForSingleObject(process.Process,uint.MaxValue);GetExitCodeProcess(process.Process,out var code);return unchecked((int)code);
        }
        finally { if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);CloseDesktop(desktop); }
    }
    static string Quote(string value)
    {
        var result=new StringBuilder("\"");var slashes=0;foreach(var c in value){if(c=='\\'){slashes++;continue;}result.Append('\\',c=='"'?slashes*2+1:slashes);result.Append(c);slashes=0;}return result.Append('\\',slashes*2).Append('"').ToString();
    }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct StartupInfo {public int Size;public string? Reserved,Desktop,Title;public int X,Y,Width,Height,Columns,Rows,Fill,Flags;public short Show,ReservedSize;public IntPtr ReservedPointer,Input,Output,Error;}
    [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr Process,Thread;public uint Id,ThreadId;}
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateDesktop(string name,string? device,IntPtr mode,uint flags,uint access,IntPtr security);
    [DllImport("user32.dll",SetLastError=true)]static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")]static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,uint bytes,out uint needed);
    [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref StartupInfo startup,out ProcessInfo process);
    [DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll")]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
}
