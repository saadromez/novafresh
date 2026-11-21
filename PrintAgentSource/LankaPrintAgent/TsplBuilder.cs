using System.Text;

namespace LunaPOSPrintAgent;

/// <summary>
/// Generates TSPL commands for XP-365B (203 DPI thermal label printer).
/// TSPL reference: https://www.tscprinters.com/en/support/download/TSPL_TSPL2_Programming_Manual
/// </summary>
public static class TsplBuilder
{
    public static byte[] Build(List<LabelItem> items, LabelOpts opts)
    {
        int dpi      = opts.Dpi > 0 ? opts.Dpi : 203;
        double mmToDot = dpi / 25.4;

        int labelW   = (int)Math.Round(opts.WidthMm  * mmToDot);
        int labelH   = (int)Math.Round(opts.HeightMm * mmToDot);
        int gapDots  = (int)Math.Round(opts.GapMm    * mmToDot);

        // Font sizes: TSPL font 3 = 12×20 dots, font 4 = 14×24 dots
        // We map pt sizes to TSPL built-in fonts (0-8) or use FONT command
        // Simplest: use TEXT with font "3" (12pt-ish) or "4" (larger)
        // We'll use scalable font via FONT command with size in dots

        var sb = new StringBuilder();

        // Printer setup — sent once before all labels
        sb.AppendLine($"SIZE {opts.WidthMm} mm, {opts.HeightMm} mm");
        sb.AppendLine($"GAP {opts.GapMm} mm, 0 mm");
        sb.AppendLine("DIRECTION 1");   // top-to-bottom
        sb.AppendLine("REFERENCE 0,0");
        sb.AppendLine("OFFSET 0 mm");
        sb.AppendLine("SET PEEL OFF");
        sb.AppendLine("SET CUTTER OFF");
        sb.AppendLine("CLS");

        foreach (var item in items)
        {
            // Layout: top margin 4 dots, left margin 8 dots
            int x = 8;
            int y = 4;
            int lineH;

            // Brand (small, bold)
            if (opts.ShowBrand && !string.IsNullOrWhiteSpace(item.Brand))
            {
                lineH = FontDots(opts.BrandFontSize);
                sb.AppendLine($"TEXT {x},{y},\"3\",0,1,1,\"{Esc(item.Brand.ToUpper())}\"");
                y += lineH + 2;
            }

            // Product name
            if (opts.ShowName && !string.IsNullOrWhiteSpace(item.Name))
            {
                lineH = FontDots(opts.NameFontSize);
                // Truncate to fit label width
                string name = TruncateToWidth(item.Name, labelW - x * 2, lineH);
                sb.AppendLine($"TEXT {x},{y},\"3\",0,1,1,\"{Esc(name)}\"");
                y += lineH + 2;
            }

            // Size / color
            if (opts.ShowSize && !string.IsNullOrWhiteSpace(item.Size))
            {
                lineH = FontDots(opts.BrandFontSize);
                sb.AppendLine($"TEXT {x},{y},\"3\",0,1,1,\"{Esc(item.Size)}\"");
                y += lineH + 2;
            }

            // Item code
            if (opts.ShowItemCode && !string.IsNullOrWhiteSpace(item.ItemCode))
            {
                sb.AppendLine($"TEXT {x},{y},\"2\",0,1,1,\"{Esc(item.ItemCode)}\"");
                y += 16 + 2;
            }

            // Barcode — place it with enough room, height = remaining space minus price row
            if (opts.ShowBarcode && !string.IsNullOrWhiteSpace(item.Barcode))
            {
                int priceH = opts.ShowPrice ? FontDots(opts.PriceFontSize) + 4 : 0;
                int barcodeH = Math.Max(24, labelH - y - priceH - 8);
                barcodeH = Math.Min(barcodeH, 60); // cap at 60 dots
                sb.AppendLine($"BARCODE {x},{y},\"128\",{barcodeH},1,0,2,2,\"{Esc(item.Barcode)}\"");
                y += barcodeH + 2;
            }

            // Price — bottom area, large font
            if (opts.ShowPrice)
            {
                string priceStr = $"{opts.CurrencySymbol} {item.Price:N2}";
                int py = labelH - FontDots(opts.PriceFontSize) - 4;
                sb.AppendLine($"TEXT {x},{py},\"4\",0,1,1,\"{Esc(priceStr)}\"");
            }

            // Print n copies then clear for next label
            sb.AppendLine($"PRINT {opts.Copies},1");
            sb.AppendLine("CLS");
        }

        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    // Map approximate pt size to TSPL dot height
    static int FontDots(double pt) => pt switch
    {
        <= 5  => 12,
        <= 7  => 16,
        <= 9  => 20,
        <= 11 => 24,
        _     => 32,
    };

    // Rough char-width estimate for truncation (TSPL font 3 ≈ 12 dots wide per char)
    static string TruncateToWidth(string s, int maxDots, int fontDots)
    {
        int charW = Math.Max(6, fontDots - 4);
        int maxChars = maxDots / charW;
        return s.Length <= maxChars ? s : s[..maxChars];
    }

    static string Esc(string s) => s.Replace("\"", "'").Replace("\\", "/");
}
