using Microsoft.Win32;

namespace LunaPOSPrintAgent;

public static class StartupHelper
{
    const string KEY  = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const string NAME = "LunaPOSPrintAgent";

    public static void Enable()
    {
        try { using var key = Registry.CurrentUser.OpenSubKey(KEY, true); key?.SetValue(NAME, $"\"{Environment.ProcessPath}\""); }
        catch { }
    }

    public static void Disable()
    {
        try { using var key = Registry.CurrentUser.OpenSubKey(KEY, true); key?.DeleteValue(NAME, false); }
        catch { }
    }
}
