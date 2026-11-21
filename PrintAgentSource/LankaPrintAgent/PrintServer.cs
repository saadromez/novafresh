using System.Net;
using System.Text;
using System.Text.Json;

namespace LunaPOSPrintAgent;

public class PrintServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly Action<string> _log;
    public const int PORT = 7777;

    public PrintServer(Action<string> log)
    {
        _log = log;
        _listener.Prefixes.Add($"http://localhost:{PORT}/");
        try { _listener.Prefixes.Add($"http://127.0.0.1:{PORT}/"); } catch { }
    }

    public void Start()
    {
        try
        {
            _listener.Start();
        }
        catch (HttpListenerException)
        {
            _listener.Prefixes.Clear();
            _listener.Prefixes.Add($"http://localhost:{PORT}/");
            _listener.Start();
        }
        _log($"Listening on http://localhost:{PORT} and http://127.0.0.1:{PORT}");
        Task.Run(ListenLoop);
    }

    public void Stop() => _listener.Stop();

    private async Task ListenLoop()
    {
        while (_listener.IsListening)
        {
            try
            {
                var ctx = await _listener.GetContextAsync();
                _ = Task.Run(() => HandleRequest(ctx));
            }
            catch { }
        }
    }

    private async void HandleRequest(HttpListenerContext ctx)
    {
        var req  = ctx.Request;
        var resp = ctx.Response;

        resp.Headers.Add("Access-Control-Allow-Origin",  "*");
        resp.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

        if (req.HttpMethod == "OPTIONS") { resp.StatusCode = 204; resp.Close(); return; }

        try
        {
            string path = req.Url?.AbsolutePath ?? "";

            if (req.HttpMethod == "GET" && path == "/ping")
            {
                WriteJson(resp, 200, "{\"ok\":true,\"agent\":\"LunaPOSPrintAgent\"}");
                return;
            }

            if (req.HttpMethod == "GET" && path == "/printers")
            {
                var printers = EscPosPrinter.GetPrinters();
                var selected = AppSettings.Load().PrinterName;
                WriteJson(resp, 200, JsonSerializer.Serialize(new { printers, selected }));
                return;
            }

            // Diagnostic: GET /logo-test?url=<encoded-url>
            if (req.HttpMethod == "GET" && path == "/logo-test")
            {
                var logoUrl = req.QueryString["url"] ?? "";
                if (string.IsNullOrWhiteSpace(logoUrl)) { WriteJson(resp, 400, "{\"error\":\"no url param\"}"); return; }
                try
                {
                    using var http = new HttpClient();
                    http.Timeout = TimeSpan.FromSeconds(8);
                    var imgBytes = await http.GetByteArrayAsync(logoUrl);
                    var b64 = Convert.ToBase64String(imgBytes);
                    var logoEscBytes = EscPosPrinter.TestLogo(b64, 48);
                    _log($"Logo test OK: {imgBytes.Length} bytes fetched, {logoEscBytes} ESC/POS bytes generated");
                    WriteJson(resp, 200, JsonSerializer.Serialize(new { ok = true, fetchedBytes = imgBytes.Length, escPosBytes = logoEscBytes }));
                }
                catch (Exception ex)
                {
                    _log($"Logo test FAILED: {ex.Message}");
                    WriteJson(resp, 200, JsonSerializer.Serialize(new { ok = false, error = ex.Message }));
                }
                return;
            }

            if (req.HttpMethod == "POST" && path == "/open-drawer")
            {
                var s = AppSettings.Load();
                var printerName = s.PrinterName;

                // 1. Allow passing specific printerName via query param or JSON body
                var qp = req.QueryString["printer"];
                if (!string.IsNullOrWhiteSpace(qp)) printerName = qp.Trim();

                if (string.IsNullOrWhiteSpace(printerName) && req.HasEntityBody)
                {
                    try
                    {
                        using var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8);
                        var body = reader.ReadToEnd();
                        if (!string.IsNullOrWhiteSpace(body))
                        {
                            using var doc = JsonDocument.Parse(body);
                            if (doc.RootElement.TryGetProperty("printerName", out var pElem))
                            {
                                var bp = pElem.GetString();
                                if (!string.IsNullOrWhiteSpace(bp)) printerName = bp.Trim();
                            }
                        }
                    }
                    catch { }
                }

                if (string.IsNullOrWhiteSpace(printerName))
                {
                    var printers = EscPosPrinter.GetPrinters();
                    printerName = printers.FirstOrDefault(p => p.Contains("POS", StringComparison.OrdinalIgnoreCase) 
                                                          || p.Contains("80", StringComparison.OrdinalIgnoreCase) 
                                                          || p.Contains("58", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("Thermal", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("Receipt", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("XP", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("RP", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("TM-", StringComparison.OrdinalIgnoreCase))
                               ?? printers.FirstOrDefault();
                }

                if (!string.IsNullOrWhiteSpace(printerName))
                {
                    try
                    {
                        // Universal cash drawer kick commands:
                        // 1. ESC p 0 25 250 (Pin 2 standard pulse)
                        // 2. ESC p 1 25 250 (Pin 5 standard pulse)
                        // 3. DLE DC4 1 0 5 (Real-time printer pulse)
                        // 4. BEL 0x07 (Star / Citizen / generic pulse)
                        byte[] drawerCmd = [
                            0x1B, 0x70, 0x00, 0x19, 0xFA,
                            0x1B, 0x70, 0x01, 0x19, 0xFA,
                            0x10, 0x14, 0x01, 0x00, 0x05,
                            0x07
                        ];
                        RawPrinterHelper.SendBytesToPrinter(printerName, drawerCmd);
                        _log($"Cash drawer kick sent to printer '{printerName}'");
                        WriteJson(resp, 200, JsonSerializer.Serialize(new { ok = true, printer = printerName }));
                    }
                    catch (Exception ex)
                    {
                        _log($"Failed to open cash drawer on '{printerName}': {ex.Message}");
                        WriteJson(resp, 500, JsonSerializer.Serialize(new { ok = false, error = ex.Message, printer = printerName }));
                    }
                }
                else
                {
                    _log("No printer found or configured to open drawer");
                    WriteJson(resp, 400, "{\"ok\":false,\"error\":\"No receipt printer installed or configured on this computer\"}");
                }
                return;
            }

            if (req.HttpMethod == "POST" && path == "/print")
            {
                using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
                var receipt = JsonSerializer.Deserialize<ReceiptData>(reader.ReadToEnd(),
                    new JsonSerializerOptions { 
                        PropertyNameCaseInsensitive = true,
                        NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
                    });

                if (receipt == null) { WriteJson(resp, 400, "{\"error\":\"Invalid JSON\"}"); return; }

                var s = AppSettings.Load();
                var printerName = s.PrinterName;
                if (string.IsNullOrWhiteSpace(printerName))
                {
                    var printers = EscPosPrinter.GetPrinters();
                    printerName = printers.FirstOrDefault(p => p.Contains("POS", StringComparison.OrdinalIgnoreCase) 
                                                          || p.Contains("80", StringComparison.OrdinalIgnoreCase) 
                                                          || p.Contains("58", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("Thermal", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("Receipt", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("XP", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("RP", StringComparison.OrdinalIgnoreCase)
                                                          || p.Contains("TM-", StringComparison.OrdinalIgnoreCase))
                               ?? printers.FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(printerName))
                    {
                        s.PrinterName = printerName;
                        s.Save();
                        _log($"Auto-configured printer: '{printerName}'");
                    }
                }

                if (string.IsNullOrWhiteSpace(printerName))
                {
                    WriteJson(resp, 503, "{\"error\":\"No printer configured or detected on this computer\"}");
                    return;
                }

                // Handle logo: data: URL (base64 inline) or http URL (fetch)
                if (string.IsNullOrWhiteSpace(receipt.LogoBase64) && !string.IsNullOrWhiteSpace(receipt.LogoUrl))
                {
                    var logoUrl = receipt.LogoUrl.Trim();
                    if (logoUrl.StartsWith("data:"))
                    {
                        // data:image/png;base64,<data> — strip prefix
                        var commaIdx = logoUrl.IndexOf(',');
                        if (commaIdx >= 0)
                        {
                            receipt.LogoBase64 = logoUrl[(commaIdx + 1)..];
                            _log($"Logo from data URL: {receipt.LogoBase64.Length} base64 chars");
                        }
                    }
                    else
                    {
                        try
                        {
                            using var http = new HttpClient();
                            http.Timeout = TimeSpan.FromSeconds(8);
                            var imgBytes = await http.GetByteArrayAsync(logoUrl);
                            receipt.LogoBase64 = Convert.ToBase64String(imgBytes);
                            _log($"Logo fetched: {imgBytes.Length} bytes from {logoUrl}");
                        }
                        catch (Exception ex) { _log($"Logo fetch failed: {ex.Message}"); }
                    }
                }

                _log($"Logo base64 length: {receipt.LogoBase64?.Length ?? 0}");
                if (string.IsNullOrWhiteSpace(receipt.FooterText) && !string.IsNullOrWhiteSpace(s.FooterText))
                {
                    receipt.FooterText = s.FooterText;
                }

                bool hasSinhala = (receipt.Items?.Any(i => ContainsSinhala(i.Name)) ?? false)
                    || ContainsSinhala(receipt.StoreName)
                    || ContainsSinhala(receipt.FooterText)
                    || ContainsSinhala(receipt.HeaderText)
                    || ContainsSinhala(receipt.CustomerName);

                if (s.PrintLanguage == "Sinhala" || hasSinhala) {
                    _log("Sinhala detected or configured: GDI Printing");
                    GdiReceiptPrinter.Print(printerName, receipt, s.PaperWidth);
                    WriteJson(resp, 200, "{\"ok\":true}");
                    return;
                }

                try
                {
                    var bytes = EscPosPrinter.BuildReceipt(receipt, s.PaperWidth);
                    _log($"Receipt bytes: {bytes.Length}, paper: {s.PaperWidth}mm, printer: {printerName}");
                    RawPrinterHelper.SendBytesToPrinter(printerName, bytes);
                    _log($"Printed (ESC/POS raw) #{receipt.InvoiceNo} → {printerName}");
                }
                catch (Exception rawEx)
                {
                    _log($"Raw ESC/POS failed ({rawEx.Message}), falling back to GDI...");
                    try
                    {
                        GdiReceiptPrinter.Print(printerName, receipt, s.PaperWidth);
                        _log($"Printed (GDI fallback) #{receipt.InvoiceNo} → {printerName}");
                    }
                    catch (Exception gdiEx)
                    {
                        _log($"GDI fallback also failed: {gdiEx.Message}");
                        throw;
                    }
                }
                WriteJson(resp, 200, "{\"ok\":true}");
                return;
            }

            if (req.HttpMethod == "POST" && path == "/settings")
            {
                using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
                var s = JsonSerializer.Deserialize<AppSettings>(reader.ReadToEnd(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (s != null)
                {
                    var existing = AppSettings.Load();
                    if (!string.IsNullOrWhiteSpace(s.PrinterName)) existing.PrinterName = s.PrinterName.Trim();
                    if (s.PaperWidth == 58 || s.PaperWidth == 80) existing.PaperWidth = s.PaperWidth;
                    existing.FooterText = s.FooterText ?? "";
                    if (!string.IsNullOrWhiteSpace(s.PrintLanguage)) existing.PrintLanguage = s.PrintLanguage;
                    existing.Save();
                    _log($"Settings updated: '{existing.PrinterName}' ({existing.PaperWidth}mm), footer: {existing.FooterText.Length} chars");
                }
                WriteJson(resp, 200, "{\"ok\":true}");
                return;
            }

            if (req.HttpMethod == "POST" && path == "/print-labels")
            {
                using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
                var payload = JsonSerializer.Deserialize<LabelPayload>(reader.ReadToEnd(),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (payload == null) { WriteJson(resp, 400, "{\"error\":\"Invalid JSON\"}"); return; }
                var s = AppSettings.Load();
                if (string.IsNullOrWhiteSpace(s.PrinterName))
                { WriteJson(resp, 503, "{\"error\":\"No printer configured\"}"); return; }
                var tspl = TsplBuilder.Build(payload.Items, payload.Opts);
                _log($"TSPL label bytes: {tspl.Length}, printer: {s.PrinterName}");
                RawPrinterHelper.SendBytesToPrinter(s.PrinterName, tspl);
                _log($"Labels sent to {s.PrinterName}");
                WriteJson(resp, 200, "{\"ok\":true}");
                return;
            }

            resp.StatusCode = 404; resp.Close();
        }
        catch (Exception ex)
        {
            _log($"Error: {ex.Message}");
            try
            {
                var errObj = JsonSerializer.Serialize(new { ok = false, error = ex.Message });
                WriteJson(resp, 500, errObj);
            }
            catch { }
        }
    }

    static bool ContainsSinhala(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        foreach (char c in text)
        {
            if (c >= '\u0D80' && c <= '\u0DFF') return true;
        }
        return false;
    }

    static void WriteJson(HttpListenerResponse resp, int status, string json)
    {
        resp.StatusCode  = status;
        resp.ContentType = "application/json";
        var buf = Encoding.UTF8.GetBytes(json);
        resp.ContentLength64 = buf.Length;
        resp.OutputStream.Write(buf);
        resp.Close();
    }

    public void Dispose() { Stop(); _listener.Close(); }
}
