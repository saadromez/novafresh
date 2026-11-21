using System.Drawing;
using System.Windows.Forms;

namespace LunaPOSPrintAgent;

public class LogForm : Form
{
    private readonly RichTextBox _box;

    public LogForm(List<string> existing)
    {
        Text          = "LunaPOS Print Agent — Activity Log";
        Size          = new Size(580, 420);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor     = Color.FromArgb(10, 10, 20);

        _box = new RichTextBox
        {
            Dock       = DockStyle.Fill,
            ReadOnly   = true,
            BackColor  = Color.FromArgb(10, 10, 20),
            ForeColor  = Color.FromArgb(167, 243, 208),
            Font       = new Font("Consolas", 9),
            ScrollBars = RichTextBoxScrollBars.Vertical,
            BorderStyle = BorderStyle.None,
        };
        foreach (var line in existing) _box.AppendText(line + "\n");
        Controls.Add(_box);
    }

    public void AppendLog(string line)
    {
        if (InvokeRequired) { Invoke(() => AppendLog(line)); return; }
        _box.AppendText(line + "\n");
        _box.ScrollToCaret();
    }
}
