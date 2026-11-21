using System.Runtime.InteropServices;

namespace LunaPOSPrintAgent;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    private class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string? pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string? pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string? pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytesToPrinter(string printerName, byte[] bytes)
    {
        if (!OpenPrinter(printerName.Normalize(), out IntPtr hPrinter, IntPtr.Zero))
        {
            int err = Marshal.GetLastWin32Error();
            throw new InvalidOperationException($"Cannot open printer '{printerName}' (Win32 error {err})");
        }

        try
        {
            var di = new DOCINFOA { pDocName = "ESC/POS Receipt", pDataType = "RAW" };
            if (!StartDocPrinter(hPrinter, 1, di))
            {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException($"StartDocPrinter failed (Win32 error {err})");
            }

            if (!StartPagePrinter(hPrinter))
            {
                EndDocPrinter(hPrinter);
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException($"StartPagePrinter failed (Win32 error {err})");
            }

            IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
            try
            {
                Marshal.Copy(bytes, 0, pBytes, bytes.Length);
                if (!WritePrinter(hPrinter, pBytes, bytes.Length, out int written))
                {
                    int err = Marshal.GetLastWin32Error();
                    throw new InvalidOperationException($"WritePrinter failed (Win32 error {err}, wrote {written}/{bytes.Length} bytes)");
                }
            }
            finally { Marshal.FreeCoTaskMem(pBytes); }

            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
        }
        finally { ClosePrinter(hPrinter); }
    }
}
