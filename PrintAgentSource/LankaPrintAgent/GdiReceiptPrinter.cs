using System.Drawing;
using System.Drawing.Printing;
using ZXing;
using ZXing.Windows.Compatibility;

namespace LunaPOSPrintAgent;

public static class GdiReceiptPrinter
{
    public static void Print(string printerName, ReceiptData r, int paperWidth = 80)
    {
        var pd = new PrintDocument();
        pd.PrinterSettings.PrinterName = printerName;
        if (!pd.PrinterSettings.IsValid)
            throw new InvalidOperationException($"Printer '{printerName}' is not valid");

        // Set paper size to match thermal roll width
        int widthHundredths = paperWidth == 58 ? 228 : 315; // ~58mm or ~80mm in 1/100 inch
        pd.DefaultPageSettings.PaperSize = new PaperSize("Receipt", widthHundredths, 1100);
        pd.DefaultPageSettings.Margins   = new Margins(10, 10, 5, 5);

        pd.PrintPage += (_, e) => DrawReceipt(e, r, paperWidth);
        pd.Print();
    }

    static void DrawReceipt(PrintPageEventArgs e, ReceiptData r, int paperWidth)
    {
        var g      = e.Graphics!;
        float pageW = paperWidth == 58 ? 200f : 280f;
        float cx   = pageW / 2f;
        float y    = 5f;
        float lh   = 16f;

        string fontName = "Arial";
        try { using var t = new Font("Iskola Potha", 10); if (t.Name=="Iskola Potha") fontName = "Iskola Potha"; } catch {}
        var fBold  = new Font(fontName, 10, FontStyle.Bold);
        var fNorm  = new Font(fontName, 9);
        var fSmall = new Font(fontName, 8);
        var fBig   = new Font("Arial", 13, FontStyle.Bold);
        var black  = Brushes.Black;

        void Center(string s, Font f) { var sz = g.MeasureString(s, f); g.DrawString(s, f, black, cx - sz.Width / 2f, y); y += lh; }
        void Left(string s, Font f)   { g.DrawString(s, f, black, 0, y); y += lh; }
        void Row(string l, string v, Font f = null!) {
            f ??= fNorm;
            g.DrawString(l, f, black, 0, y);
            var vs = g.MeasureString(v, f);
            g.DrawString(v, f, black, pageW - vs.Width, y);
            y += lh;
        }
        void Dash() { g.DrawLine(Pens.Black, 0, y, pageW, y); y += 5; }

        // Store name
        Center(r.StoreName ?? "Store", fBig);
        if (!string.IsNullOrWhiteSpace(r.StoreAddress)) Center(r.StoreAddress, fSmall);
        if (!string.IsNullOrWhiteSpace(r.StorePhone))   Center(r.StorePhone,   fSmall);
        Dash();

        // Invoice info
        Row("Invoice:", r.InvoiceNo ?? "");
        Row("Date:",    r.CreatedAt ?? DateTime.Now.ToString("dd/MM/yyyy, hh:mm:ss tt"));
        if (!string.IsNullOrWhiteSpace(r.Cashier))      Row("Cashier:", r.Cashier);
        if (!string.IsNullOrWhiteSpace(r.CustomerName) && r.CustomerName != "Walk-in")
            Row("Customer:", r.CustomerName);
        if (!string.IsNullOrWhiteSpace(r.CustomerPhone)) Row("Phone:", r.CustomerPhone);
        Dash();

        // Items header
        g.DrawString("Item",  fBold, black, 0,       y);
        g.DrawString("Qty",   fBold, black, pageW - 90, y);
        g.DrawString("Total", fBold, black, pageW - 55, y);
        y += lh;
        Dash();

        // Items
        foreach (var item in r.Items)
        {
            double lineTotal = item.LineTotal > 0 ? item.LineTotal : item.Price * item.Qty - item.Discount;
            string name = item.Name ?? "";
            if (name.Length > 20) name = name[..20];
            g.DrawString(name,                    fNorm, black, 0,          y);
            string qtyDisplay = item.Qty % 1 == 0 ? item.Qty.ToString("0") : item.Qty.ToString("0.###");
            g.DrawString(qtyDisplay,              fNorm, black, pageW - 90, y);
            g.DrawString($"Rs.{lineTotal:N2}",    fNorm, black, pageW - 55, y);
            y += lh;
        }
        Dash();

        // Totals
        if (r.Subtotal > 0 && Math.Abs(r.Subtotal - r.Total) > 0.01) Row("Subtotal:", $"Rs.{r.Subtotal:N2}");
        if (r.Discount > 0)      Row("Discount:", $"-Rs.{r.Discount:N2}");
        if (r.Tax > 0)           Row("Tax:",       $"Rs.{r.Tax:N2}");
        Dash();
        Row("TOTAL:", $"Rs.{r.Total:N2}", fBold);
        Dash();

        // Payment
        if (r.Payments.Count > 0)
            foreach (var p in r.Payments)
                Row((p.Method ?? "").ToUpper() + ":", $"Rs.{p.Amount:N2}");
        else if (!string.IsNullOrWhiteSpace(r.PaymentMethod))
            Row(r.PaymentMethod.ToUpper() + ":", $"Rs.{r.Paid:N2}");

        if (r.CashGiven > 0.001) Row("Cash Given:", $"Rs.{r.CashGiven:N2}");
        if (r.Change    > 0.001) Row("Change:",     $"Rs.{r.Change:N2}");
        if (r.Balance   > 0.001) Row("BALANCE DUE:", $"Rs.{r.Balance:N2}", fBold);

        Dash();

        // Footer
        if (!string.IsNullOrWhiteSpace(r.HeaderText)) Center(r.HeaderText, fNorm);
        if (!string.IsNullOrWhiteSpace(r.FooterText))
        {
            var fLines = r.FooterText.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            foreach (var fl in fLines)
            {
                var tr = fl.Trim();
                if (!string.IsNullOrWhiteSpace(tr)) Center(tr, fSmall);
                else y += 8f;
            }
        }
        y += 5;
        Center("Software by Lunatech Creations", fSmall);
        y += 20;
    }
}
