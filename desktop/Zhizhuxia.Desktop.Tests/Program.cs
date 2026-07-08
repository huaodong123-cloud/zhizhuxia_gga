using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Zhizhuxia.Desktop.Services;

var tests = new List<(string Name, Func<Task> Run)>
{
    ("ChatApiClient sends api key, agent, game name, and message", ChatApiClientSendsExpectedPayload),
    ("ChatApiClient sends image inputs", ChatApiClientSendsImageInputs),
    ("ChatApiClient sends screenshot without requiring a separate vision key", ChatApiClientSendsScreenshotWithoutSeparateVisionKey),
    ("ScreenshotService encodes bitmap to PNG base64", ScreenshotServiceEncodesBitmapToPngBase64),
    ("ChatApiClient surfaces response fields", ChatApiClientSurfacesResponseFields),
    ("MainWindow uses dark combo box item styling", MainWindowUsesDarkComboBoxItemStyling),
    ("MainWindow keeps settings out of the in-game panel", MainWindowKeepsSettingsOutOfInGamePanel),
    ("MainWindow starts directly in chat without a login gate", MainWindowStartsDirectlyInChatWithoutLoginGate),
    ("MainWindow follows the HUD prototype visual direction", MainWindowFollowsHudPrototypeVisualDirection),
    ("MainWindow uses icon-only composer actions", MainWindowUsesIconOnlyComposerActions),
    ("MainWindow uses frameless icons, a narrow composer, hollow middle, and configurable solid bubbles", MainWindowUsesFramelessComposerAndSolidConfigurableBubbles),
    ("MainWindow fixes close behavior, unclipped icons, hollow shell, solid bubbles, and full composer", MainWindowFixesReportedHudIssues),
    ("SettingsWindow contains tray configuration fields", SettingsWindowContainsTrayConfigurationFields),
    ("SettingsWindow exposes visual settings controls that MainWindow applies", SettingsWindowExposesAppliedVisualSettings),
    ("SettingsWindow is modern frameless and local settings persist with API key cache", SettingsWindowIsFramelessAndLocalSettingsPersistWithApiKeyCache),
    ("TrayMenuFactory exposes expected commands", TrayMenuFactoryExposesExpectedCommands),
    ("LoginState rejects empty API keys", LoginStateRejectsEmptyApiKeys),
    ("LocalServerService detects healthy existing server", LocalServerServiceDetectsHealthyServer),
    ("LocalServerService rejects stale non-GLM health responses", LocalServerServiceRejectsStaleHealthResponses),
    ("LocalServerService clears stale port owners before startup", LocalServerServiceClearsStalePortOwnersBeforeStartup),
};

var failures = new List<string>();

foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception ex)
    {
        failures.Add($"{test.Name}: {ex.Message}");
        Console.WriteLine($"FAIL {test.Name}: {ex.Message}");
    }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine($"{failures.Count} desktop test(s) failed.");
    Environment.Exit(1);
}

static async Task ChatApiClientSendsExpectedPayload()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""
        {
          "agentId": "chief",
          "confidence": "low",
          "needResearch": true,
          "usedAgents": ["research", "critic"],
          "sources": [],
          "answer": "ok",
          "harness": { "ok": true, "warnings": [] }
        }
        """)
    });

    var client = new ChatApiClient(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    await client.SendAsync(new ChatRequest("sk-test", "chief", "Example RPG", "help me"));

    Assert(handler.LastRequest is not null, "request was not sent");
    Assert(handler.LastRequest!.RequestUri!.AbsolutePath == "/api/chat", "wrong path");

    using var document = JsonDocument.Parse(handler.LastBody);
    var root = document.RootElement;
    Assert(root.GetProperty("apiKey").GetString() == "sk-test", "apiKey not sent");
    Assert(root.GetProperty("agentId").GetString() == "chief", "agentId not sent");
    Assert(root.GetProperty("gameName").GetString() == "Example RPG", "gameName not sent");
    Assert(root.GetProperty("message").GetString() == "help me", "message not sent");
}

static async Task ChatApiClientSurfacesResponseFields()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""
        {
          "agentId": "combat",
          "confidence": "medium",
          "needResearch": false,
          "usedAgents": ["combat"],
          "sources": [
            {
              "source": "bilibili",
              "title": "Boss guide",
              "url": "https://example.test",
              "summary": "Save burst.",
              "freshness": "likely-current"
            }
          ],
          "answer": "Save burst for shield.",
          "harness": { "ok": false, "warnings": ["verify patch"] }
        }
        """)
    });

    var client = new ChatApiClient(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    var response = await client.SendAsync(new ChatRequest("sk-test", "combat", "Example RPG", "boss"));

    Assert(response.AgentId == "combat", "agent id not mapped");
    Assert(response.Confidence == "medium", "confidence not mapped");
    Assert(response.Sources.Count == 1, "sources not mapped");
    Assert(response.Harness.Warnings.Count == 1, "warnings not mapped");
    Assert(response.Answer.Contains("shield", StringComparison.OrdinalIgnoreCase), "answer not mapped");
}

static async Task ChatApiClientSendsImageInputs()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""
        {
          "status": "completed",
          "model": "glm-5.2",
          "agentId": "chief",
          "confidence": "medium",
          "needResearch": false,
          "imagesUsed": 1,
          "modelCapabilities": { "text": true, "vision": true, "tools": true, "imageGeneration": true },
          "usedAgents": ["research", "critic"],
          "sources": [],
          "answer": "ok",
          "harness": { "ok": true, "warnings": [] }
        }
        """)
    });

    var client = new ChatApiClient(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    await client.SendAsync(new ChatRequest(
        "sk-test",
        "chief",
        "Example RPG",
        "read screenshot",
        "glm-5.2",
        [new ChatImageInput("image/png", "iVBORw0KGgo=")]));

    using var document = JsonDocument.Parse(handler.LastBody);
    var root = document.RootElement;
    var images = root.GetProperty("images");

    Assert(root.GetProperty("modelId").GetString() == "glm-5.2", "modelId not sent");
    Assert(images.GetArrayLength() == 1, "image count not sent");
    Assert(images[0].GetProperty("mediaType").GetString() == "image/png", "mediaType not sent");
    Assert(images[0].GetProperty("data").GetString() == "iVBORw0KGgo=", "image data not sent");
}

static async Task ChatApiClientSendsScreenshotWithoutSeparateVisionKey()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""
        {
          "status": "completed",
          "intent": "screenshot_question",
          "workflowStages": ["intent", "vision", "research", "answer"],
          "visionAnalysis": { "summary": "截图显示体力不足。", "observations": ["体力不足"] },
          "searchQuery": "示例游戏 体力不足",
          "agentId": "chief",
          "confidence": "medium",
          "needResearch": true,
          "usedAgents": ["research", "critic"],
          "sources": [],
          "answer": "ok",
          "harness": { "ok": true, "warnings": [] }
        }
        """)
    });

    var client = new ChatApiClient(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    await client.SendAsync(new ChatRequest(
        "sk-zhipu",
        "chief",
        "Example RPG",
        "read screenshot",
        Screenshot: new ChatImageInput("image/png", "iVBORw0KGgo=")));

    using var document = JsonDocument.Parse(handler.LastBody);
    var root = document.RootElement;

    Assert(root.GetProperty("apiKey").GetString() == "sk-zhipu", "Zhipu apiKey not sent");
    Assert(!root.TryGetProperty("visionApiKey", out _), "separate visionApiKey should not be sent");
    Assert(root.GetProperty("screenshot").GetProperty("mediaType").GetString() == "image/png", "screenshot mediaType not sent");
    Assert(root.GetProperty("screenshot").GetProperty("data").GetString() == "iVBORw0KGgo=", "screenshot data not sent");
}

static Task ScreenshotServiceEncodesBitmapToPngBase64()
{
    var pixels = new byte[] { 255, 0, 0, 255 };
    var bitmap = BitmapSource.Create(1, 1, 96, 96, PixelFormats.Bgra32, null, pixels, 4);

    var input = ScreenshotService.EncodeBitmapToPngBase64(bitmap);
    var bytes = Convert.FromBase64String(input.Data);

    Assert(input.MediaType == "image/png", "screenshot media type should be image/png");
    Assert(bytes.Length > 8, "PNG bytes missing");
    Assert(bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47, "PNG header missing");

    return Task.CompletedTask;
}

static Task MainWindowUsesDarkComboBoxItemStyling()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));

    Assert(xaml.Contains("TargetType=\"ComboBoxItem\"", StringComparison.Ordinal), "ComboBoxItem style missing");
    Assert(xaml.Contains("Background\" Value=\"#16000000\"", StringComparison.Ordinal), "translucent dark item background missing");
    Assert(xaml.Contains("SystemColors.WindowBrushKey", StringComparison.Ordinal), "dropdown window brush override missing");
    Assert(xaml.Contains("x:Name=\"PART_Popup\"", StringComparison.Ordinal), "combo box popup template missing");
    Assert(xaml.Contains("Background=\"#0B0B0B\"", StringComparison.Ordinal), "combo selected and dropdown areas should use black background");
    Assert(xaml.Contains("Text=\"{Binding SelectedItem.Content, RelativeSource={RelativeSource TemplatedParent}}\"", StringComparison.Ordinal), "combo selected text should render from the selected item content");

    return Task.CompletedTask;
}

static Task MainWindowKeepsSettingsOutOfInGamePanel()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));

    Assert(!xaml.Contains("SettingsButton", StringComparison.Ordinal), "in-game settings button should be removed");
    Assert(!xaml.Contains("SettingsPanel", StringComparison.Ordinal), "in-game settings panel should be removed");

    return Task.CompletedTask;
}

static Task MainWindowStartsDirectlyInChatWithoutLoginGate()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));

    Assert(!xaml.Contains("LoginView", StringComparison.Ordinal), "startup login view should be removed");
    Assert(!xaml.Contains("ApiKeyBox", StringComparison.Ordinal), "in-game API key input should be removed");
    Assert(!xaml.Contains("进入智助侠", StringComparison.Ordinal), "login enter button should be removed");
    Assert(!xaml.Contains("ChatView\" Visibility=\"Collapsed", StringComparison.Ordinal), "chat view should not start collapsed");

    return Task.CompletedTask;
}

static Task MainWindowFollowsHudPrototypeVisualDirection()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));
    var code = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml.cs"));

    Assert(xaml.Contains("Width=\"410\"", StringComparison.Ordinal), "HUD window width should be compact");
    Assert(xaml.Contains("Height=\"600\"", StringComparison.Ordinal), "HUD window height should be compact");
    Assert(xaml.Contains("x:Name=\"RootPanel\"", StringComparison.Ordinal), "main panel should be named");
    Assert(xaml.Contains("Data=\"M8 43 C26 9 68 2 112 13 C95 50 59 78 17 76 C10 65 6 54 8 43 Z\"", StringComparison.Ordinal), "spider-eye mark missing from header");
    Assert(xaml.Contains("x:Name=\"AgentPill\"", StringComparison.Ordinal), "agent selector should be presented as a compact pill");
    Assert(xaml.Contains("x:Name=\"GamePill\"", StringComparison.Ordinal), "game input should be presented as a compact pill");
    Assert(xaml.Contains("CornerRadius=\"16\"", StringComparison.Ordinal), "HUD composer rounded shell missing");
    Assert(code.Contains("CreateBubbleBrush", StringComparison.Ordinal), "user and assistant messages should use configurable solid bubble fill");
    Assert(code.Contains("MediaColor.FromArgb(72, 5, 8, 12)", StringComparison.Ordinal), "source cards should use translucent HUD fill");

    return Task.CompletedTask;
}

static Task MainWindowUsesIconOnlyComposerActions()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));

    Assert(!xaml.Contains("Content=\"截屏\"", StringComparison.Ordinal), "screenshot action should be icon-only");
    Assert(!xaml.Contains("Content=\"发送\"", StringComparison.Ordinal), "send action should be icon-only");
    Assert(xaml.Contains("x:Name=\"ScreenshotIcon\"", StringComparison.Ordinal), "screenshot icon path missing");
    Assert(xaml.Contains("x:Name=\"SendIcon\"", StringComparison.Ordinal), "send icon path missing");
    Assert(xaml.Contains("ToolTip=\"区域截图\"", StringComparison.Ordinal), "screenshot icon should have a tooltip");
    Assert(xaml.Contains("ToolTip=\"发送\"", StringComparison.Ordinal), "send icon should have a tooltip");

    return Task.CompletedTask;
}

static Task MainWindowUsesFramelessComposerAndSolidConfigurableBubbles()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));
    var code = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml.cs"));
    var settingsXaml = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml"));
    var settingsCode = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml.cs"));

    Assert(xaml.Contains("Background=\"Transparent\"", StringComparison.Ordinal), "middle shell should be able to stay hollow");
    Assert(xaml.Contains("x:Name=\"ComposerShell\"", StringComparison.Ordinal), "composer shell should be named");
    Assert(!xaml.Contains("MaxWidth=\"320\"", StringComparison.Ordinal), "composer should be restored to full width");
    Assert(xaml.Contains("x:Name=\"ScreenshotButton\"", StringComparison.Ordinal), "screenshot button should be named");
    Assert(xaml.Contains("x:Name=\"SendButton\"", StringComparison.Ordinal), "send button should be named");
    Assert(xaml.Contains("Padding=\"0\"", StringComparison.Ordinal), "frameless icon buttons should not inherit text-button padding");
    Assert(xaml.Contains("BorderThickness=\"0\"", StringComparison.Ordinal), "composer icon buttons should not have visible boxes");
    Assert(settingsXaml.Contains("BubbleOpacitySlider", StringComparison.Ordinal), "bubble opacity setting should be exposed");
    Assert(settingsCode.Contains("BubbleOpacityPercent", StringComparison.Ordinal), "settings window should return bubble opacity");
    Assert(code.Contains("_bubbleOpacityPercent", StringComparison.Ordinal), "main window should store bubble opacity");
    Assert(code.Contains("CreateBubbleBrush", StringComparison.Ordinal), "chat bubbles should use configurable solid brushes");

    return Task.CompletedTask;
}

static Task MainWindowFixesReportedHudIssues()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));
    var code = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml.cs"));

    Assert(xaml.Contains("RootPanel", StringComparison.Ordinal), "root panel missing");
    Assert(xaml.Contains("BorderThickness=\"0\"", StringComparison.Ordinal), "outer shell should have no border");
    Assert(xaml.Contains("Canvas Width=\"32\" Height=\"32\"", StringComparison.Ordinal), "composer icons should use padded 32px canvases");
    Assert(!xaml.Contains("MaxWidth=\"320\"", StringComparison.Ordinal), "composer should be restored to full width");
    Assert(xaml.Contains("x:Name=\"MessageBox\"", StringComparison.Ordinal), "message box missing");
    Assert(xaml.Contains("Background=\"#0B0B0B\"", StringComparison.Ordinal), "message input should be solid black");
    Assert(xaml.Contains("MaxHeight=\"120\"", StringComparison.Ordinal), "message input should scroll when content grows");
    Assert(xaml.Contains("TargetType=\"ScrollBar\"", StringComparison.Ordinal), "thin black scrollbar style missing");
    Assert(code.Contains("_bubbleOpacityPercent = 100", StringComparison.Ordinal), "chat bubbles should default to solid");
    Assert(code.Contains("MessageBoxButton.YesNoCancel", StringComparison.Ordinal), "close should ask hide or exit");
    Assert(code.Contains("_forceExit", StringComparison.Ordinal), "tray exit should bypass close prompt");

    return Task.CompletedTask;
}

static Task SettingsWindowContainsTrayConfigurationFields()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml"));

    Assert(!xaml.Contains("DeepSeek API Key", StringComparison.Ordinal), "DeepSeek key setting should be removed");
    Assert(xaml.Contains("智谱 API Key", StringComparison.Ordinal), "Zhipu key setting missing");
    Assert(xaml.Contains("GLM-5.2", StringComparison.Ordinal), "GLM-5.2 model labels missing");
    Assert(xaml.Contains("Ctrl + Alt + F9", StringComparison.Ordinal), "show/hide hotkey setting missing");
    Assert(xaml.Contains("Ctrl + Alt + F10", StringComparison.Ordinal), "screenshot hotkey setting missing");
    Assert(xaml.Contains("图标颜色", StringComparison.Ordinal), "icon color setting missing");
    Assert(xaml.Contains("图标透明度", StringComparison.Ordinal), "icon opacity setting missing");
    Assert(xaml.Contains("面板透明度", StringComparison.Ordinal), "panel opacity setting missing");
    Assert(xaml.Contains("气泡透明度", StringComparison.Ordinal), "bubble opacity setting missing");

    return Task.CompletedTask;
}

static Task SettingsWindowExposesAppliedVisualSettings()
{
    var settingsXaml = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml"));
    var settingsCode = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml.cs"));
    var mainXaml = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml"));
    var mainCode = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml.cs"));
    var trayIconCode = File.ReadAllText(Path.Combine("desktop", "Services", "TrayIconFactory.cs"));

    Assert(settingsXaml.Contains("IconOpacitySlider", StringComparison.Ordinal), "icon opacity slider should be named");
    Assert(settingsXaml.Contains("PanelOpacitySlider", StringComparison.Ordinal), "panel opacity slider should be named");
    Assert(settingsXaml.Contains("IconColorRedRadio", StringComparison.Ordinal), "red icon color option should be named");
    Assert(settingsXaml.Contains("IconColorCyanRadio", StringComparison.Ordinal), "cyan icon color option should be named");
    Assert(settingsCode.Contains("IconColorMode", StringComparison.Ordinal), "settings window should expose icon color mode");
    Assert(settingsCode.Contains("PanelOpacityPercent", StringComparison.Ordinal), "settings window should expose panel opacity");
    Assert(mainXaml.Contains("x:Name=\"RootPanel\"", StringComparison.Ordinal), "main panel should be addressable for opacity updates");
    Assert(mainXaml.Contains("x:Name=\"HeaderEyeOuter\"", StringComparison.Ordinal), "header eye should be addressable for color updates");
    Assert(mainCode.Contains("ApplyVisualSettings", StringComparison.Ordinal), "main window should apply visual settings");
    Assert(mainCode.Contains("TrayIconFactory.CreateIcon(_iconColorMode, _iconOpacityPercent)", StringComparison.Ordinal), "tray icon should be redrawn from settings");
    Assert(trayIconCode.Contains("CreateIcon(string colorMode, double opacityPercent)", StringComparison.Ordinal), "tray icon factory should accept color and opacity");

    return Task.CompletedTask;
}

static Task SettingsWindowIsFramelessAndLocalSettingsPersistWithApiKeyCache()
{
    var xaml = File.ReadAllText(Path.Combine("desktop", "SettingsWindow.xaml"));
    var mainCode = File.ReadAllText(Path.Combine("desktop", "MainWindow.xaml.cs"));
    var storeCode = File.ReadAllText(Path.Combine("desktop", "Services", "VisualSettingsStore.cs"));

    Assert(xaml.Contains("WindowStyle=\"None\"", StringComparison.Ordinal), "settings window should be frameless");
    Assert(xaml.Contains("AllowsTransparency=\"True\"", StringComparison.Ordinal), "settings window should use modern rounded chrome");
    Assert(xaml.Contains("SettingsHeader_MouseLeftButtonDown", StringComparison.Ordinal), "settings window should support dragging");
    Assert(xaml.Contains("ScrollViewer", StringComparison.Ordinal), "settings window should scroll when content exceeds height");
    Assert(xaml.Contains("TargetType=\"ScrollBar\"", StringComparison.Ordinal), "settings window should use custom thin scrollbar");
    Assert(xaml.Contains("Width\" Value=\"6\"", StringComparison.Ordinal), "settings scrollbar should be thin");
    Assert(xaml.Contains("x:Name=\"SaveButton\"", StringComparison.Ordinal), "save button should be named and reachable");
    Assert(mainCode.Contains("VisualSettingsStore", StringComparison.Ordinal), "main window should load and save local settings");
    Assert(mainCode.Contains("_apiKey = settings.ZhipuApiKey", StringComparison.Ordinal), "main window should load cached API key");
    Assert(storeCode.Contains("visual-settings.json", StringComparison.Ordinal), "visual settings file name missing");
    Assert(storeCode.Contains("ZhipuApiKey", StringComparison.Ordinal), "local settings should cache the Zhipu API key");

    return Task.CompletedTask;
}

static Task TrayMenuFactoryExposesExpectedCommands()
{
    using var menu = TrayMenuFactory.CreateContextMenu(
        onToggle: () => { },
        onScreenshot: () => { },
        onSettings: () => { },
        onExit: () => { });

    var labels = menu.Items.Cast<System.Windows.Forms.ToolStripMenuItem>()
        .Select(item => item.Text)
        .ToArray();

    Assert(labels.SequenceEqual(["显示/隐藏智助侠", "区域截图", "配置", "退出"]), "tray menu labels are wrong");
    return Task.CompletedTask;
}

static Task LoginStateRejectsEmptyApiKeys()
{
    Assert(!LoginState.CanEnterChat(""), "empty key accepted");
    Assert(!LoginState.CanEnterChat("   "), "blank key accepted");
    Assert(LoginState.CanEnterChat("sk-test"), "non-empty key rejected");
    return Task.CompletedTask;
}

static async Task LocalServerServiceDetectsHealthyServer()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""{"ok":true,"name":"game-guide-agent-lab","model":"glm-5.2","provider":"zhipu"}""")
    });
    var service = new LocalServerService(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    var healthy = await service.IsServerHealthyAsync();

    Assert(healthy, "healthy server not detected");
    Assert(handler.LastRequest!.RequestUri!.AbsolutePath == "/api/health", "health endpoint not used");
}

static async Task LocalServerServiceRejectsStaleHealthResponses()
{
    using var handler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = JsonContent("""{"ok":true,"name":"game-guide-agent-lab"}""")
    });
    var service = new LocalServerService(new HttpClient(handler)
    {
        BaseAddress = new Uri("http://localhost:5177")
    });

    var healthy = await service.IsServerHealthyAsync();

    Assert(!healthy, "stale server without GLM-5.2 identity should not be reused");
}

static Task LocalServerServiceClearsStalePortOwnersBeforeStartup()
{
    var code = File.ReadAllText(Path.Combine("desktop", "Services", "LocalServerService.cs"));

    Assert(code.Contains("ReleaseStaleServerPort", StringComparison.Ordinal), "stale port release hook missing");
    Assert(code.Contains("netstat", StringComparison.Ordinal), "port owner lookup missing");
    Assert(code.Contains("GetProcessById", StringComparison.Ordinal), "stale port owner termination missing");
    Assert(code.Contains("ProcessName", StringComparison.Ordinal), "stale port cleanup should verify the owner is node before terminating it");
    return Task.CompletedTask;
}

static StringContent JsonContent(string json) => new(json, System.Text.Encoding.UTF8, "application/json");

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

internal sealed class CapturingHandler : HttpMessageHandler
{
    private readonly HttpResponseMessage _response;

    public CapturingHandler(HttpResponseMessage response)
    {
        _response = response;
    }

    public HttpRequestMessage? LastRequest { get; private set; }
    public string LastBody { get; private set; } = "";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastRequest = request;
        LastBody = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        return _response;
    }
}
