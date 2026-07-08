using System.IO;
using System.Text.Json;

namespace Zhizhuxia.Desktop.Services;

public sealed record VisualSettings(
    string ZhipuApiKey = "",
    string IconColorMode = "white",
    double IconOpacityPercent = 70,
    double PanelOpacityPercent = 45,
    double BubbleOpacityPercent = 100,
    bool TopmostEnabled = true,
    bool ClickThroughCollapsedOnly = false);

public sealed class VisualSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _path;

    public VisualSettingsStore(string? baseDirectory = null)
    {
        var directory = baseDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Zhizhuxia");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "visual-settings.json");
    }

    public VisualSettings Load()
    {
        if (!File.Exists(_path))
        {
            return new VisualSettings();
        }

        try
        {
            var json = File.ReadAllText(_path);
            return JsonSerializer.Deserialize<VisualSettings>(json) ?? new VisualSettings();
        }
        catch
        {
            return new VisualSettings();
        }
    }

    public void Save(VisualSettings settings)
    {
        File.WriteAllText(_path, JsonSerializer.Serialize(settings, JsonOptions));
    }
}
