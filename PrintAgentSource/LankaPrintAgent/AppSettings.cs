using System.Text.Json;

namespace LunaPOSPrintAgent;

public class AppSettings
{
    public string PrinterName { get; set; } = "";
    public int    PaperWidth  { get; set; } = 80;
    public string FooterText { get; set; } = "";
    public string PrintLanguage { get; set; } = "English";

    private static readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "LunaPOSPrintAgent", "settings.json");

    public static AppSettings Load()
    {
        try { if (File.Exists(_path)) return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_path)) ?? new(); }
        catch { }
        return new();
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }
}
