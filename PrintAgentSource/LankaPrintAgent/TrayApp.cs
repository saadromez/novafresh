using System.Drawing;
using System.Windows.Forms;

namespace LunaPOSPrintAgent;

public class TrayApp : ApplicationContext
{
    private readonly NotifyIcon      _tray;
    private readonly PrintServer     _server;
    private readonly ContextMenuStrip _menu;
    private ToolStripMenuItem _statusItem  = null!;
    private ToolStripMenuItem _printerItem = null!;
    private LogForm? _logForm;
    private readonly List<string> _logs = [];

    public TrayApp()
    {
        _server = new PrintServer(Log);
        _menu   = BuildMenu();

        _tray = new NotifyIcon
        {
            Icon             = SystemIcons.Application,
            Text             = "LunaPOS Print Agent",
            Visible          = true,
            ContextMenuStrip = _menu,
        };
        _tray.DoubleClick += (_, _) => ShowLog();

        try
        {
            _server.Start();
            SetStatus(true);
            Log("LunaPOS Print Agent started on port 7777");
        }
        catch (Exception ex)
        {
            Log($"Failed to start: {ex.Message}");
            SetStatus(false);
        }

        StartupHelper.Enable();

        var settings = AppSettings.Load();
        if (string.IsNullOrWhiteSpace(settings.PrinterName))
        {
            _tray.ShowBalloonTip(3500, "LunaPOS Print Agent",
                "First time setup — please select your thermal printer.", ToolTipIcon.Info);
            var t = new System.Windows.Forms.Timer { Interval = 1200 };
            t.Tick += (_, _) => { t.Stop(); OpenPrinterSetup(); };
            t.Start();
        }
        else
        {
            _tray.ShowBalloonTip(2000, "LunaPOS Print Agent",
                $"Ready  ·  {settings.PrinterName}", ToolTipIcon.None);
        }
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        _statusItem  = new ToolStripMenuItem("● Starting...") { Enabled = false };
        _printerItem = new ToolStripMenuItem("🖨  Select Printer", null, (_, _) => OpenPrinterSetup());

        menu.Items.Add(new ToolStripMenuItem("LunaPOS Print Agent") { Enabled = false, Font = new Font("Segoe UI", 9, FontStyle.Bold) });
        menu.Items.Add(new ToolStripMenuItem("by Lunatech Creations") { Enabled = false, Font = new Font("Segoe UI", 8) });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_statusItem);
        menu.Items.Add(_printerItem);
        menu.Items.Add(new ToolStripMenuItem("📋  View Log",  null, (_, _) => ShowLog()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("❌  Exit",      null, (_, _) => Exit()));

        RefreshPrinterLabel();
        return menu;
    }

    void SetStatus(bool ok) =>
        _statusItem.Text = ok ? "● Running  —  port 7777" : "✗ Server not running";

    void RefreshPrinterLabel()
    {
        var s = AppSettings.Load();
        _printerItem.Text = string.IsNullOrWhiteSpace(s.PrinterName)
            ? "🖨  Select Printer  ⚠ (none)"
            : $"🖨  {s.PrinterName}  ({s.PaperWidth}mm)";
    }

    void OpenPrinterSetup()
    {
        using var f = new PrinterSelectForm();
        f.ShowDialog();
        RefreshPrinterLabel();
        var s = AppSettings.Load();
        if (!string.IsNullOrWhiteSpace(s.PrinterName))
            Log($"Printer: {s.PrinterName} ({s.PaperWidth}mm)");
    }

    void ShowLog()
    {
        if (_logForm == null || _logForm.IsDisposed) { _logForm = new LogForm(_logs); _logForm.Show(); }
        else _logForm.BringToFront();
    }

    void Log(string msg)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {msg}";
        _logs.Add(line);
        if (_logs.Count > 300) _logs.RemoveAt(0);
        _logForm?.AppendLog(line);
    }

    void Exit() { _server.Dispose(); _tray.Visible = false; Application.Exit(); }
}
