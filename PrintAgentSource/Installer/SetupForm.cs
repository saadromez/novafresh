using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);
Application.Run(new SetupForm());

public class SetupForm : Form
{
    static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "LunaPOS Print Agent");
    static readonly string ExePath    = Path.Combine(InstallDir, "LunaPOSPrintAgent.exe");
    const string REG_RUN    = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const string REG_UNINST = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LunaPOSPrintAgent";
    const string APP_NAME   = "LunaPOS Print Agent";

    private Label       _lblStatus = null!;
    private ProgressBar _bar       = null!;
    private Button      _btnInstall= null!;
    private Button      _btnCancel = null!;

    public SetupForm()
    {
        Text            = $"{APP_NAME} — Setup";
        Size            = new Size(500, 340);
        StartPosition   = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        BackColor       = Color.FromArgb(10, 10, 20);

        // Purple accent bar at top
        var accent = new Panel { Left = 0, Top = 0, Width = 500, Height = 5, BackColor = Color.FromArgb(124, 58, 237) };

        var title = new Label
        {
            Text = APP_NAME, ForeColor = Color.White,
            Font = new Font("Segoe UI", 20, FontStyle.Bold),
            Left = 24, Top = 22, Width = 440, Height = 38,
        };
        var byLine = new Label
        {
            Text = "by Lunatech Creations  ·  ESC/POS Thermal Print Service",
            ForeColor = Color.FromArgb(124, 58, 237),
            Font = new Font("Segoe UI", 9),
            Left = 24, Top = 62, Width = 440, Height = 18,
        };
        var sep = new Panel { Left = 24, Top = 88, Width = 440, Height = 1, BackColor = Color.FromArgb(40, 40, 60) };

        var info = new Label
        {
            Text =
                "Install location:\r\n" +
                $"   {InstallDir}\r\n\r\n" +
                "  ✔  Runs silently in the Windows system tray\r\n" +
                "  ✔  Auto-starts with Windows for all users (Task Scheduler)\r\n" +
                "  ✔  Listens on localhost:7777 for print jobs\r\n" +
                "  ✔  First launch opens printer setup automatically",
            ForeColor = Color.FromArgb(200, 200, 220),
            Font      = new Font("Segoe UI", 9),
            Left = 24, Top = 100, Width = 440, Height = 118,
        };

        _bar = new ProgressBar
        {
            Left = 24, Top = 228, Width = 440, Height = 14,
            Minimum = 0, Maximum = 100, Value = 0,
            Style = ProgressBarStyle.Continuous, Visible = false,
        };
        _lblStatus = new Label
        {
            Text = "", ForeColor = Color.FromArgb(124, 58, 237),
            Font = new Font("Segoe UI", 8),
            Left = 24, Top = 246, Width = 440, Height = 16,
        };

        _btnInstall = new Button
        {
            Text = "Install Now", Left = 270, Top = 272, Width = 110, Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(124, 58, 237), ForeColor = Color.White,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
        };
        _btnInstall.FlatAppearance.BorderSize = 0;
        _btnInstall.Click += (_, _) => RunInstall();

        _btnCancel = new Button
        {
            Text = "Cancel", Left = 390, Top = 272, Width = 80, Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(40, 40, 60), ForeColor = Color.FromArgb(180, 180, 200),
            Font = new Font("Segoe UI", 10),
        };
        _btnCancel.FlatAppearance.BorderSize = 0;
        _btnCancel.Click += (_, _) => Close();

        Controls.AddRange([accent, title, byLine, sep, info, _bar, _lblStatus, _btnInstall, _btnCancel]);
    }

    private async void RunInstall()
    {
        _btnInstall.Enabled = false;
        _btnCancel.Enabled  = false;
        _bar.Visible        = true;

        try
        {
            await Task.Run(() =>
            {
                SetStatus("Creating install directory...", 15);
                Directory.CreateDirectory(InstallDir);

                SetStatus("Extracting LunaPOS Print Agent...", 35);
                ExtractAgent();

                SetStatus("Writing uninstaller...", 50);
                WriteUninstaller();

                SetStatus("Registering auto-start...", 65);
                RegisterStartup();

                SetStatus("Adding to Programs & Features...", 78);
                RegisterUninstall();

                SetStatus("Creating Start Menu shortcut...", 90);
                CreateStartMenuShortcut();

                SetStatus("Complete!", 100);
            });

            MessageBox.Show(
                $"{APP_NAME} installed successfully!\n\nIt will now launch and ask you to select your thermal printer.\nAfter that it runs silently — no setup needed again.",
                "Installation Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);

            Process.Start(new ProcessStartInfo(ExePath) { UseShellExecute = true });
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Installation failed:\n\n{ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            _btnInstall.Enabled = true;
            _btnCancel.Enabled  = true;
        }
    }

    void SetStatus(string msg, int pct) =>
        Invoke(() => { _lblStatus.Text = msg; _bar.Value = pct; });

    static void ExtractAgent()
    {
        var asm     = Assembly.GetExecutingAssembly();
        var resName = asm.GetManifestResourceNames().First(n => n.EndsWith("LunaPOSPrintAgent.exe"));
        using var src  = asm.GetManifestResourceStream(resName)!;
        using var dest = File.Create(ExePath);
        src.CopyTo(dest);
    }

    static void WriteUninstaller()
    {
        File.WriteAllText(Path.Combine(InstallDir, "Uninstall.bat"),
            $"""
            @echo off
            taskkill /IM LunaPOSPrintAgent.exe /F >nul 2>&1
            schtasks /Delete /TN "LunaPOS Print Agent" /F >nul 2>&1
            reg delete "HKCU\{REG_RUN}" /v LunaPOSPrintAgent /f >nul 2>&1
            reg delete "HKLM\{REG_UNINST}" /f >nul 2>&1
            rmdir /s /q "{InstallDir}"
            echo LunaPOS Print Agent uninstalled.
            pause
            """);
    }

    static void RegisterStartup()
    {
        // HKCU Run — works for the current user
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(REG_RUN, true);
            key?.SetValue("LunaPOSPrintAgent", $"\"{ExePath}\"");
        }
        catch { }

        // Task Scheduler — runs at logon for ANY user, survives UAC, most reliable
        try
        {
            string xml = $"""
                <?xml version="1.0" encoding="UTF-16"?>
                <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
                  <RegistrationInfo><Description>LunaPOS Print Agent auto-start</Description></RegistrationInfo>
                  <Triggers>
                    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
                  </Triggers>
                  <Principals>
                    <Principal id="Author">
                      <GroupId>S-1-5-32-545</GroupId>
                      <RunLevel>LeastPrivilege</RunLevel>
                    </Principal>
                  </Principals>
                  <Settings>
                    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                    <Priority>7</Priority>
                  </Settings>
                  <Actions>
                    <Exec>
                      <Command>"{ExePath}"</Command>
                    </Exec>
                  </Actions>
                </Task>
                """;

            string xmlPath = Path.Combine(Path.GetTempPath(), "LunaPOSAgent.xml");
            File.WriteAllText(xmlPath, xml, System.Text.Encoding.Unicode);
            Process.Start(new ProcessStartInfo(
                "schtasks",
                $"/Create /TN \"LunaPOS Print Agent\" /XML \"{xmlPath}\" /F")
            {
                UseShellExecute  = false,
                CreateNoWindow   = true,
                RedirectStandardOutput = true,
            })?.WaitForExit(8000);
            File.Delete(xmlPath);
        }
        catch { }
    }

    static void RegisterUninstall()
    {
        using var key = Registry.LocalMachine.CreateSubKey(REG_UNINST);
        if (key == null) return;
        key.SetValue("DisplayName",     APP_NAME);
        key.SetValue("DisplayVersion",  "1.0.0");
        key.SetValue("Publisher",       "Lunatech Creations");
        key.SetValue("InstallLocation", InstallDir);
        key.SetValue("UninstallString", $"\"{Path.Combine(InstallDir, "Uninstall.bat")}\"");
        key.SetValue("NoModify",        1, RegistryValueKind.DWord);
        key.SetValue("NoRepair",        1, RegistryValueKind.DWord);
    }

    static void CreateStartMenuShortcut()
    {
        try
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
                APP_NAME);
            Directory.CreateDirectory(dir);
            string lnk = Path.Combine(dir, $"{APP_NAME}.lnk");
            string ps  = $"$s=(New-Object -COM WScript.Shell).CreateShortcut('{lnk}');$s.TargetPath='{ExePath}';$s.Description='{APP_NAME}';$s.Save()";
            Process.Start(new ProcessStartInfo("powershell", $"-NoProfile -Command \"{ps}\"")
            { UseShellExecute = false, CreateNoWindow = true })?.WaitForExit(5000);
        }
        catch { }
    }
}
