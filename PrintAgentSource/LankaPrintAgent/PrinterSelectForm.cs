using System.Drawing;
using System.Drawing.Printing;
using System.Windows.Forms;

namespace LunaPOSPrintAgent;

public class PrinterSelectForm : Form
{
    public PrinterSelectForm()
    {
        Text            = "LunaPOS Print Agent — Printer Setup";
        Size            = new Size(440, 300);
        StartPosition   = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        BackColor       = Color.FromArgb(10, 10, 20);

        var accent = new Panel { Left = 0, Top = 0, Width = 440, Height = 4, BackColor = Color.FromArgb(124, 58, 237) };

        var settings = AppSettings.Load();

        var lbl1 = new Label { Text = "Select ESC/POS Thermal Printer:", Left = 20, Top = 18, Width = 390,
            Font = new Font("Segoe UI", 10), ForeColor = Color.White };

        var combo = new ComboBox { Left = 20, Top = 44, Width = 390, DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10) };
        foreach (string p in PrinterSettings.InstalledPrinters) combo.Items.Add(p);
        if (!string.IsNullOrWhiteSpace(settings.PrinterName)) combo.SelectedItem = settings.PrinterName;

        var lbl2 = new Label { Text = "Paper Width:", Left = 20, Top = 94, Width = 110,
            Font = new Font("Segoe UI", 10), ForeColor = Color.White };
        var rb80 = new RadioButton { Text = "80mm", Left = 140, Top = 91, Width = 80,
            Checked = settings.PaperWidth != 58, Font = new Font("Segoe UI", 10), ForeColor = Color.White };
        var rb58 = new RadioButton { Text = "58mm", Left = 230, Top = 91, Width = 80,
            Checked = settings.PaperWidth == 58, Font = new Font("Segoe UI", 10), ForeColor = Color.White };

        var lblNote = new Label
        {
            Text = "💡 Make sure your thermal printer driver is installed in Windows.\n   The agent sends raw ESC/POS bytes — no print dialog.",
            Left = 20, Top = 130, Width = 390, Height = 44,
            Font = new Font("Segoe UI", 8.5f), ForeColor = Color.FromArgb(124, 58, 237),
        };

        var btnSave = new Button
        {
            Text = "Save & Close", Left = 20, Top = 218, Width = 160, Height = 36,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            BackColor = Color.FromArgb(124, 58, 237), ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
        };
        btnSave.FlatAppearance.BorderSize = 0;
        btnSave.Click += (_, _) =>
        {
            new AppSettings { PrinterName = combo.SelectedItem?.ToString() ?? "", PaperWidth = rb58.Checked ? 58 : 80 }.Save();
            Close();
        };

        var btnTest = new Button
        {
            Text = "🖨  Test Print", Left = 196, Top = 218, Width = 160, Height = 36,
            Font = new Font("Segoe UI", 10), FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(40, 40, 60), ForeColor = Color.White,
        };
        btnTest.FlatAppearance.BorderSize = 0;
        btnTest.Click += (_, _) =>
        {
            var printer = combo.SelectedItem?.ToString();
            if (string.IsNullOrWhiteSpace(printer)) { MessageBox.Show("Select a printer first."); return; }
            try
            {
                var receipt = new ReceiptData
                {
                    InvoiceNo = "TEST-001", StoreName = "LunaPOS Test",
                    StoreAddress = "123 Test Street", StorePhone = "0771234567",
                    CustomerName = "Test Customer", Cashier = "Admin",
                    PaymentMethod = "cash", CreatedAt = DateTime.Now.ToString("dd/MM/yyyy HH:mm"),
                    Subtotal = 1500, Total = 1500, Paid = 2000,
                    HeaderText = "Thank you for your purchase!", FooterText = "Please come again!",
                    Items = [new ReceiptItem { Name = "Test Product", Qty = 2, Price = 750 }]
                };
                int pw = rb58.Checked ? 58 : 80;
                try
                {
                    RawPrinterHelper.SendBytesToPrinter(printer, EscPosPrinter.BuildReceipt(receipt, pw));
                    MessageBox.Show("Test receipt sent (ESC/POS raw)!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch
                {
                    GdiReceiptPrinter.Print(printer, receipt, pw);
                    MessageBox.Show("Test receipt sent (GDI fallback)!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Print failed:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };

        // GDI test — uses PrintDocument exactly like ElianaPOS/PhotoStudioApp
        var btnGdi = new Button
        {
            Text = "⚡ GDI Test (like other apps)", Left = 20, Top = 262, Width = 390, Height = 32,
            Font = new Font("Segoe UI", 9), FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(20, 60, 20), ForeColor = Color.FromArgb(167, 243, 208),
        };
        btnGdi.FlatAppearance.BorderSize = 0;
        btnGdi.Click += (_, _) =>
        {
            var printer = combo.SelectedItem?.ToString();
            if (string.IsNullOrWhiteSpace(printer)) { MessageBox.Show("Select a printer first."); return; }
            try
            {
                var pd = new PrintDocument();
                pd.PrinterSettings.PrinterName = printer;
                if (!pd.PrinterSettings.IsValid) { MessageBox.Show($"Printer '{printer}' is not valid."); return; }
                pd.PrintPage += (s, e) =>
                {
                    var f = new Font("Arial", 10);
                    float y = 10;
                    e.Graphics.DrawString("*** GDI TEST ***", new Font("Arial", 12, FontStyle.Bold), Brushes.Black, 10, y); y += 22;
                    e.Graphics.DrawString(printer, f, Brushes.Black, 10, y); y += 18;
                    e.Graphics.DrawString(DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"), f, Brushes.Black, 10, y); y += 18;
                    e.Graphics.DrawString("If you see this — GDI printing works!", f, Brushes.Black, 10, y);
                };
                pd.Print();
                MessageBox.Show("GDI print job sent!", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"GDI print failed:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };

        Size = new Size(440, 340);
        Controls.AddRange([accent, lbl1, combo, lbl2, rb80, rb58, lblNote, btnSave, btnTest, btnGdi]);
    }
}
