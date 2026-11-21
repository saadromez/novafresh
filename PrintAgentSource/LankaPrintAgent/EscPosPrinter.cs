using System.Drawing.Printing;
using System.Text;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.PixelFormats;

namespace LunaPOSPrintAgent;

public static class EscPosPrinter
{
    static readonly Encoding _enc = GetEncoding();
    static Encoding GetEncoding() {
        try { return Encoding.GetEncoding(437); }
        catch { return Encoding.UTF8; }
    }

    static readonly byte[] INIT         = [0x1B, 0x40];
    static readonly byte[] ALIGN_LEFT   = [0x1B, 0x61, 0x00];
    static readonly byte[] ALIGN_CENTER = [0x1B, 0x61, 0x01];
    static readonly byte[] BOLD_ON      = [0x1B, 0x45, 0x01];
    static readonly byte[] BOLD_OFF     = [0x1B, 0x45, 0x00];
    static readonly byte[] DBL_ON       = [0x1D, 0x21, 0x11];
    static readonly byte[] DBL_OFF      = [0x1D, 0x21, 0x00];
    static readonly byte[] CUT          = [0x1D, 0x56, 0x41, 0x05];
    static readonly byte[] LF           = [0x0A];

    const int W80 = 48;
    const int W58 = 32;

    public static byte[] BuildReceipt(ReceiptData r, int paperWidth = 80)
    {
        int W = paperWidth == 58 ? W58 : W80;
        var buf = new List<byte[]>();

        void Add(params byte[][] parts) { foreach (var p in parts) buf.Add(p); }
        void Text(string s) => buf.Add(_enc.GetBytes(s));
        void Line(string s = "") { Text(s); Add(LF); }
        void Dash()   => Line(new string('-', W));
        void Equal()  => Line(new string('=', W));

        string Sym  = "Rs.";
        string Fmt(double v) => $"{Sym}{v:N2}";
        string Pad(string left, string right)
        {
            int sp = W - left.Length - right.Length;
            return left + new string(' ', Math.Max(1, sp)) + right;
        }
        string Cap(string s, int max) => s.Length > max ? s[..max] : s;

        // ── INIT ──
        Add(INIT, ALIGN_CENTER);
        Add(LF); // single top margin

        // ── LOGO ──
        string? logoB64 = r.LogoBase64;
        if (string.IsNullOrWhiteSpace(logoB64) && !string.IsNullOrWhiteSpace(r.LogoUrl))
        {
            var url = r.LogoUrl.Trim();
            if (url.StartsWith("data:")) { var ci = url.IndexOf(','); if (ci >= 0) logoB64 = url[(ci + 1)..]; }
        }
        if (!string.IsNullOrWhiteSpace(logoB64))
        {
            try { var lb = RenderLogo(logoB64, W); if (lb != null) { buf.Add(lb); } } // no extra LF — logo feeds its own line
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"Logo: {ex.Message}"); }
        }

        // ── STORE NAME ──
        Add(BOLD_ON, DBL_ON);
        Line(Cap(r.StoreName ?? "Store", W / 2));
        Add(DBL_OFF, BOLD_OFF);
        Add(LF);
        if (!string.IsNullOrWhiteSpace(r.StoreAddress)) Line(Cap(r.StoreAddress, W));
        if (!string.IsNullOrWhiteSpace(r.StorePhone))   Line(r.StorePhone);

        Add(ALIGN_LEFT);
        Dash();

        // ── REFUND / EXCHANGE BANNER ──
        bool isRefund = r.SaleType == "refund" || r.SaleType == "exchange";
        if (isRefund)
        {
            Add(ALIGN_CENTER, BOLD_ON);
            string banner = r.SaleType == "exchange" ? "*** EXCHANGE ***" : "*** REFUND ***";
            Line(banner);
            Add(BOLD_OFF, ALIGN_LEFT);
        }

        // ── INVOICE INFO ──
        Add(BOLD_ON); Line(Pad("Invoice:", r.InvoiceNo ?? "")); Add(BOLD_OFF);
        Line(Pad("Date:", r.CreatedAt ?? DateTime.Now.ToString("dd/MM/yyyy, hh:mm:ss tt")));
        if (isRefund) Line(Pad("Type:", r.SaleType!.ToUpper()));
        if (!string.IsNullOrWhiteSpace(r.Cashier))
            Line(Pad("Cashier:", r.Cashier));
        if (!string.IsNullOrWhiteSpace(r.CustomerName) && r.CustomerName != "Walk-in")
            Line(Pad("Customer:", Cap(r.CustomerName, W - 10)));
        if (!string.IsNullOrWhiteSpace(r.CustomerPhone))
            Line(Pad("Phone:", r.CustomerPhone));

        Dash();

        // ── ITEMS ──
        // Header: name col + right-aligned Qty / Price / Total
        int qtyW   = paperWidth == 58 ? 5 : 6;
        int priceW = 8;
        int totW   = paperWidth == 58 ? 8 : 9;
        int numCols = qtyW + 1 + priceW + 1 + totW; // " Qty Price___ Total____"
        int nameW  = W - numCols - 1;

        string PadRight(string s, int w) => s.Length >= w ? s[..w] : s + new string(' ', w - s.Length);
        string PadLeft(string s,  int w) => s.Length >= w ? s[..w] : new string(' ', w - s.Length) + s;
        string FmtQty(double q) => q % 1 == 0 ? q.ToString("0") : q.ToString("0.###");

        Add(BOLD_ON);
        Line(PadRight("Item", nameW) + " " + PadLeft("Qty", qtyW) + " " + PadLeft("Price", priceW) + " " + PadLeft("Total", totW));
        Add(BOLD_OFF);
        Dash();

        foreach (var item in r.Items)
        {
            double lineTotal = item.LineTotal > 0 ? item.LineTotal : item.Price * item.Qty - item.Discount;
            string qtyStr   = PadLeft(FmtQty(item.Qty), qtyW);
            string priceStr = PadLeft(Fmt(item.Price), priceW);
            string totStr   = PadLeft(Fmt(lineTotal), totW);
            string numPart  = " " + qtyStr + " " + priceStr + " " + totStr;

            string name = item.Name ?? "";
            if (name.Length <= nameW)
            {
                Line(PadRight(name, nameW) + numPart);
            }
            else
            {
                // wrap name, numbers on last line
                int chunkSize = nameW;
                for (int ci = 0; ci < name.Length; ci += chunkSize)
                {
                    string chunk = name.Substring(ci, Math.Min(chunkSize, name.Length - ci));
                    bool isLast = ci + chunkSize >= name.Length;
                    if (isLast)
                        Line(PadRight(chunk, nameW) + numPart);
                    else
                        Line(chunk);
                }
            }
            if (item.Discount > 0)
                Line(new string(' ', nameW + 1) + PadLeft($"-{Fmt(item.Discount)}", numCols));
        }

        Dash();

        // ── TOTALS ──
        if (r.Subtotal > 0 && Math.Abs(r.Subtotal - r.Total) > 0.01)
            Line(Pad("Subtotal:", Fmt(r.Subtotal)));
        if (r.Discount > 0)      Line(Pad("Discount:", $"-{Fmt(r.Discount)}"));
        if (r.CourierCharge > 0) Line(Pad("Courier:", Fmt(r.CourierCharge)));
        if (r.Tax > 0)           Line(Pad("Tax:", Fmt(r.Tax)));

        Equal();
        Add(BOLD_ON, DBL_ON);
        Line(Pad("TOTAL", Fmt(r.Total)));
        Add(DBL_OFF, BOLD_OFF);

        Dash();

        // ── PAYMENT LINES ──
        if (r.Payments.Count > 0)
        {
            foreach (var p in r.Payments)
            {
                string label = (p.Method ?? "").ToUpper() + ":";
                Line(Pad(label, Fmt(p.Amount)));
            }
            double totalPaid = r.Payments.Sum(p => p.Amount);
            if (r.CashGiven > 0.001)
                Line(Pad("Cash Given:", Fmt(r.CashGiven)));
            else
                Line(Pad("Paid:", Fmt(totalPaid)));
        }
        else if (!string.IsNullOrWhiteSpace(r.PaymentMethod))
        {
            string pm = r.PaymentMethod.ToUpper();
            if (!string.IsNullOrWhiteSpace(r.Reference)) pm += $" | {r.Reference}";
            Line(Pad("Payment:", pm));
            if (r.CashGiven > 0.001) Line(Pad("Cash Given:", Fmt(r.CashGiven)));
            else if (r.Paid > 0)     Line(Pad("Paid:",       Fmt(r.Paid)));
        }

        if (r.Change > 0.001) { Add(BOLD_ON); Line(Pad("Change:", Fmt(r.Change))); Add(BOLD_OFF); }
        if (r.Balance > 0.001) { Add(BOLD_ON); Line(Pad("BALANCE DUE:", Fmt(r.Balance))); Add(BOLD_OFF); }

        // ── LOYALTY ──
        if (r.ShowLoyalty && (r.PointsEarned > 0 || r.PointsRedeemed > 0))
        {
            Dash();
            if (r.PointsEarned   > 0) Line(Pad("Points Earned:",    r.PointsEarned.ToString()));
            if (r.PointsRedeemed > 0) Line(Pad("Points Redeemed:",  r.PointsRedeemed.ToString()));
        }

        Dash();

        // ── FOOTER TEXT ──
        Add(ALIGN_CENTER);
        if (!string.IsNullOrWhiteSpace(r.HeaderText)) { Add(BOLD_ON); Line(r.HeaderText); Add(BOLD_OFF); }

        // ── RETURNS POLICY / REFUND NOTE ──
        if (!string.IsNullOrWhiteSpace(r.FooterText))
        {
            try
            {
                Line();
                var rawLines = r.FooterText.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
                foreach (var rawLine in rawLines)
                {
                    var trimmed = rawLine.Trim();
                    if (string.IsNullOrWhiteSpace(trimmed))
                    {
                        Line();
                        continue;
                    }
                    string[] words = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    var lineBuilder = new StringBuilder();
                    foreach (var word in words)
                    {
                        if (lineBuilder.Length + word.Length + 1 > W)
                        {
                            if (lineBuilder.Length > 0)
                            {
                                Line(lineBuilder.ToString().Trim());
                                lineBuilder.Clear();
                            }
                        }
                        if (word.Length > W)
                        {
                            for (int i = 0; i < word.Length; i += W)
                            {
                                int len = Math.Min(W, word.Length - i);
                                Line(word.Substring(i, len));
                            }
                        }
                        else
                        {
                            lineBuilder.Append(word + " ");
                        }
                    }
                    if (lineBuilder.Length > 0) Line(lineBuilder.ToString().Trim());
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Footer render error: {ex.Message}");
            }
        }

        Line();

        // ── BARCODE ──
        if (!string.IsNullOrWhiteSpace(r.BarcodeData))
        {
            try { buf.Add(BuildCode128(r.BarcodeData)); }
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"Barcode: {ex.Message}"); }
        }

        // ── LUNATECH (centered — ALIGN_CENTER already active from above) ──
        Add(ALIGN_CENTER);
        Line("Software by Lunatech Creations");
        Line(); Line(); Line();
        Add(CUT);

        return [.. buf.SelectMany(b => b)];
    }

    // ── CODE128B via ESC/POS GS k (function B, length-prefixed) ──
    static byte[] BuildCode128(string data)
    {
        var r = new List<byte>();
        r.AddRange([0x1D, 0x48, 0x02]);        // HRI below barcode
        r.AddRange([0x1D, 0x68, 0x50]);        // height = 80 dots
        r.AddRange([0x1D, 0x77, 0x02]);        // module width x2
        r.AddRange([0x1B, 0x61, 0x01]);        // center align
        byte[] d = Encoding.ASCII.GetBytes(data);
        // GS k m n d1..dn  — m=73 (CODE128), n=total payload length incl. {B prefix
        r.Add(0x1D); r.Add(0x6B); r.Add(73);  // GS k CODE128
        r.Add((byte)(d.Length + 2));           // n = data + 2 bytes for {B
        r.Add(0x7B); r.Add(0x42);             // {B = select CODE128B subset
        r.AddRange(d);
        r.Add(0x0A); r.Add(0x0A);
        r.AddRange([0x1B, 0x61, 0x00]);        // restore left align
        return [.. r];
    }

    // ── Logo rasterisation ──
    static byte[]? RenderLogo(string base64, int printerWidthChars)
    {
        var imgBytes = Convert.FromBase64String(base64);
        using var img = SixLabors.ImageSharp.Image.Load<Rgba32>(imgBytes);

        int maxW = (int)((printerWidthChars >= 48 ? 576 : 384) * 0.95); // wider
        int maxH = 280; // taller — bigger logo
        float scale = Math.Min((float)maxW / img.Width, (float)maxH / img.Height);
        if (scale > 1f) scale = 1f;

        int wPx = ((int)(img.Width  * scale) + 7) / 8 * 8;
        int h   = Math.Max(1, (int)(img.Height * scale));

        img.Mutate(x => {
            x.Resize(wPx, h);
            x.BackgroundColor(SixLabors.ImageSharp.Color.White);
        });

        int nL = wPx & 0xFF, nH = wPx >> 8;
        var result = new List<byte>();
        result.AddRange([0x1B, 0x33, 24]);

        for (int row = 0; row < h; row += 24)
        {
            result.AddRange([0x1B, 0x2A, 33, (byte)nL, (byte)nH]);
            for (int x = 0; x < wPx; x++)
            {
                byte b0 = 0, b1 = 0, b2 = 0;
                for (int bit = 0; bit < 8; bit++)
                {
                    if (row + bit      < h && Dark(img, x, row + bit))      b0 |= (byte)(0x80 >> bit);
                    if (row + bit + 8  < h && Dark(img, x, row + bit + 8))  b1 |= (byte)(0x80 >> bit);
                    if (row + bit + 16 < h && Dark(img, x, row + bit + 16)) b2 |= (byte)(0x80 >> bit);
                }
                result.Add(b0); result.Add(b1); result.Add(b2);
            }
            result.Add(0x0A);
        }
        result.AddRange([0x1B, 0x32]);
        result.Add(0x0A);
        return [.. result];
    }

    static bool Dark(Image<Rgba32> img, int x, int y)
    {
        var px = img[x, y];
        int r = (px.R * px.A + 255 * (255 - px.A)) / 255;
        int g = (px.G * px.A + 255 * (255 - px.A)) / 255;
        int b = (px.B * px.A + 255 * (255 - px.A)) / 255;
        return (r + g + b) / 3 < 128;
    }

    public static List<string> GetPrinters()
    {
        var list = new List<string>();
        foreach (string p in PrinterSettings.InstalledPrinters) list.Add(p);
        return list;
    }

    public static int TestLogo(string base64, int widthChars)
    {
        var bytes = RenderLogo(base64, widthChars);
        return bytes?.Length ?? 0;
    }
}
