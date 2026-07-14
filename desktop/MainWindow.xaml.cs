using System.ComponentModel;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Zhizhuxia.Desktop.Services;
using FormsNotifyIcon = System.Windows.Forms.NotifyIcon;
using MediaBrush = System.Windows.Media.Brush;
using MediaBrushes = System.Windows.Media.Brushes;
using MediaColor = System.Windows.Media.Color;
using WpfHorizontalAlignment = System.Windows.HorizontalAlignment;

namespace Zhizhuxia.Desktop;

public partial class MainWindow : Window
{
    private readonly LocalServerService _serverService = new();
    private readonly ChatApiClient _chatApiClient = new();
    private readonly HotkeyService _hotkeyService = new();
    private readonly HotkeyService _screenshotHotkeyService = new();
    private readonly HotkeyService _enableHotkeyService = new();
    private readonly ScreenshotService _screenshotService = new();
    private readonly VisualSettingsStore _visualSettingsStore = new();
    private FormsNotifyIcon? _trayIcon;
    private string _apiKey = "";
    private string _iconColorMode = "white";
    private double _iconOpacityPercent = 70;
    private double _panelOpacityPercent = 45;
    private double _bubbleOpacityPercent = 100;
    private bool _topmostEnabled = true;
    private bool _clickThroughCollapsedOnly = false;
    private bool _shortcutsEnabled = true;
    private bool _forceExit;
    private ChatImageInput? _pendingScreenshot;
    private Border? _pendingMessage;

    public MainWindow()
    {
        ApplySettingsValues(_visualSettingsStore.Load());
        InitializeComponent();
        ApplyVisualSettings();
        ConfigureTrayIcon();
        Loaded += MainWindow_Loaded;
        SourceInitialized += MainWindow_SourceInitialized;
        Closing += MainWindow_Closing;
    }

    private void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        if (!_forceExit)
        {
            var result = System.Windows.MessageBox.Show(
                "要隐藏到托盘，还是彻底退出？\n\n是：隐藏到托盘\n否：彻底退出\n取消：留在窗口",
                "关闭智助侠",
                MessageBoxButton.YesNoCancel,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                e.Cancel = true;
                Hide();
                return;
            }

            if (result == MessageBoxResult.Cancel)
            {
                e.Cancel = true;
                return;
            }
        }

        _hotkeyService.Dispose();
        _screenshotHotkeyService.Dispose();
        _enableHotkeyService.Dispose();
        _trayIcon?.Dispose();
        _serverService.Dispose();
    }

    private void ApplySettingsValues(VisualSettings settings)
    {
        _apiKey = settings.ZhipuApiKey;
        _iconColorMode = settings.IconColorMode;
        _iconOpacityPercent = settings.IconOpacityPercent;
        _panelOpacityPercent = settings.PanelOpacityPercent;
        _bubbleOpacityPercent = settings.BubbleOpacityPercent;
        _topmostEnabled = settings.TopmostEnabled;
        _clickThroughCollapsedOnly = settings.ClickThroughCollapsedOnly;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        PositionNearRightEdge();

        try
        {
            await _serverService.EnsureServerAsync();
            MessageBox.Focus();
        }
        catch (Exception ex)
        {
            AddMessage("智助侠", ex.Message, isUser: false, isError: true);
        }
    }

    private void MainWindow_SourceInitialized(object? sender, EventArgs e)
    {
        try
        {
            var handle = new WindowInteropHelper(this).Handle;
            _hotkeyService.Register(handle, Key.F9);
            _hotkeyService.Pressed += (_, _) => ToggleVisibleFromHotkey();
            _screenshotHotkeyService.Register(handle, Key.F10);
            _screenshotHotkeyService.Pressed += async (_, _) => await CaptureScreenshotFromHotkeyAsync();
            _enableHotkeyService.Register(handle, Key.Home, useModifiers: false);
            _enableHotkeyService.Pressed += (_, _) => ToggleShortcutsEnabled();
        }
        catch (Exception ex)
        {
            AddMessage("智助侠", ex.Message, isUser: false, isError: true);
        }
    }

    private void PositionNearRightEdge()
    {
        var workArea = SystemParameters.WorkArea;
        Left = Math.Max(workArea.Left + 20, workArea.Right - Width - 28);
        Top = Math.Max(workArea.Top + 20, workArea.Top + (workArea.Height - Height) / 2);
    }

    private void ToggleVisible()
    {
        if (IsVisible && WindowState != WindowState.Minimized)
        {
            Hide();
            return;
        }

        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void ToggleVisibleFromHotkey()
    {
        if (!_shortcutsEnabled)
        {
            return;
        }

        ToggleVisible();
    }

    private void ToggleShortcutsEnabled()
    {
        _shortcutsEnabled = !_shortcutsEnabled;
    }

    private async Task CaptureScreenshotFromHotkeyAsync()
    {
        if (!_shortcutsEnabled)
        {
            return;
        }

        await CaptureScreenshotAsync();
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private async void SendButton_Click(object sender, RoutedEventArgs e)
    {
        await SendMessageAsync();
    }

    private async void MessageBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Enter
            && (Keyboard.Modifiers == ModifierKeys.None || Keyboard.Modifiers == ModifierKeys.Shift))
        {
            e.Handled = true;
            await SendMessageAsync();
        }
    }

    private async Task SendMessageAsync()
    {
        var message = MessageBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        if (!LoginState.CanEnterChat(_apiKey))
        {
            AddMessage("智助侠", "请在右下角托盘图标右键打开配置，填写智谱 API Key。", isUser: false, isError: true);
            return;
        }

        AddMessage("你", message, isUser: true);
        MessageBox.Text = "";
        _pendingMessage = AddMessage("智助侠", "思考中...", isUser: false);

        try
        {
            await _serverService.EnsureServerAsync();
            var response = await _chatApiClient.SendAsync(new ChatRequest(
                _apiKey,
                GetSelectedAgentId(),
                GetSelectedGameName(),
                message,
                GetSelectedModelId(),
                Screenshot: _pendingScreenshot));

            RemovePending();
            AddAssistantResponse(response);
            ClearPendingScreenshot();
        }
        catch (Exception ex)
        {
            RemovePending();
            AddMessage("智助侠", ex.Message, isUser: false, isError: true);
        }
    }

    private string GetSelectedAgentId()
    {
        return AgentComboBox.SelectedItem is ComboBoxItem item && item.Tag is string tag
            ? tag
            : "chief";
    }

    private string GetSelectedGameName()
    {
        if (GameComboBox.SelectedItem is ComboBoxItem item)
        {
            return item.Content?.ToString() ?? "";
        }

        return "";
    }

    private string GetSelectedModelId()
    {
        return "glm-5.2";
    }

    private async void ScreenshotButton_Click(object sender, RoutedEventArgs e)
    {
        await CaptureScreenshotAsync();
    }

    private async Task CaptureScreenshotAsync()
    {
        Hide();
        await Task.Delay(120);

        try
        {
            var overlay = new ScreenshotOverlayWindow { Owner = this };
            if (overlay.ShowDialog() == true && overlay.CapturedRegion is Rect region)
            {
                _pendingScreenshot = _screenshotService.CaptureRegion(region);
                ScreenshotPreviewText.Text = $"已添加截图 · {Math.Round(region.Width)}×{Math.Round(region.Height)}";
                ScreenshotPreviewImage.Source = CreateScreenshotPreviewImage(_pendingScreenshot);
                ScreenshotPreviewPanel.Visibility = Visibility.Visible;
            }
        }
        catch (Exception ex)
        {
            AddMessage("智助侠", ex.Message, isUser: false, isError: true);
        }
        finally
        {
            Show();
            Activate();
        }
    }

    private void ConfigureTrayIcon()
    {
        _trayIcon = new FormsNotifyIcon
        {
            Text = "智助侠",
            Icon = TrayIconFactory.CreateIcon(_iconColorMode, _iconOpacityPercent),
            Visible = true,
            ContextMenuStrip = TrayMenuFactory.CreateContextMenu(
                onToggle: () => Dispatcher.Invoke(ToggleVisible),
                onScreenshot: async () => await Dispatcher.InvokeAsync(CaptureScreenshotAsync),
                onSettings: () => Dispatcher.Invoke(OpenSettingsWindow),
                onExit: () => Dispatcher.Invoke(() =>
                {
                    _forceExit = true;
                    Close();
                }))
        };

        _trayIcon.DoubleClick += (_, _) => Dispatcher.Invoke(ToggleVisible);
    }

    private void OpenSettingsWindow()
    {
        var settingsWindow = new SettingsWindow(
            _apiKey,
            _iconColorMode,
            _iconOpacityPercent,
            _panelOpacityPercent,
            _bubbleOpacityPercent,
            _topmostEnabled,
            _clickThroughCollapsedOnly)
        {
            Owner = this
        };

        if (settingsWindow.ShowDialog() == true)
        {
            _apiKey = settingsWindow.ZhipuApiKey;
            _iconColorMode = settingsWindow.IconColorMode;
            _iconOpacityPercent = settingsWindow.IconOpacityPercent;
            _panelOpacityPercent = settingsWindow.PanelOpacityPercent;
            _bubbleOpacityPercent = settingsWindow.BubbleOpacityPercent;
            _topmostEnabled = settingsWindow.TopmostEnabled;
            _clickThroughCollapsedOnly = settingsWindow.ClickThroughCollapsedOnly;
            _visualSettingsStore.Save(new VisualSettings(
                _apiKey,
                _iconColorMode,
                _iconOpacityPercent,
                _panelOpacityPercent,
                _bubbleOpacityPercent,
                _topmostEnabled,
                _clickThroughCollapsedOnly));
            ApplyVisualSettings();
        }
    }

    private void ApplyVisualSettings()
    {
        Topmost = _topmostEnabled;
        var panelAlpha = PercentToAlpha(_panelOpacityPercent);
        RootPanel.Background = MediaBrushes.Transparent;
        var panelBrush = new SolidColorBrush(MediaColor.FromArgb(panelAlpha, 5, 8, 12));
        HeaderBar.Background = panelBrush;
        AgentPill.Background = panelBrush;
        GamePill.Background = panelBrush;
        ComposerShell.Background = panelBrush;

        var eyeColor = ResolveMediaIconColor(_iconColorMode, PercentToAlpha(_iconOpacityPercent));
        HeaderEyeOuter.Stroke = new SolidColorBrush(eyeColor);
        HeaderEyeAccent.Stroke = new SolidColorBrush(eyeColor);

        if (_trayIcon is not null)
        {
            var oldIcon = _trayIcon.Icon;
            _trayIcon.Icon = TrayIconFactory.CreateIcon(_iconColorMode, _iconOpacityPercent);
            oldIcon?.Dispose();
        }
    }

    private static byte PercentToAlpha(double percent)
    {
        return (byte)Math.Clamp((int)Math.Round(percent / 100d * 255), 0, 255);
    }

    private static MediaColor ResolveMediaIconColor(string colorMode, byte alpha)
    {
        return colorMode switch
        {
            "red" => MediaColor.FromArgb(alpha, 255, 51, 77),
            "cyan" => MediaColor.FromArgb(alpha, 121, 242, 220),
            "dim" => MediaColor.FromArgb(alpha, 148, 163, 184),
            _ => MediaColor.FromArgb(alpha, 248, 251, 255)
        };
    }

    private MediaBrush CreateBubbleBrush(bool isUser, bool isError)
    {
        var alpha = PercentToAlpha(_bubbleOpacityPercent);
        if (isError)
        {
            return new SolidColorBrush(MediaColor.FromArgb(alpha, 88, 22, 28));
        }

        return isUser
            ? new SolidColorBrush(MediaColor.FromArgb(alpha, 28, 32, 38))
            : new SolidColorBrush(MediaColor.FromArgb(alpha, 5, 8, 12));
    }

    private void ClearScreenshotButton_Click(object sender, RoutedEventArgs e)
    {
        ClearPendingScreenshot();
    }

    private void ClearPendingScreenshot()
    {
        _pendingScreenshot = null;
        ScreenshotPreviewImage.Source = null;
        ScreenshotPreviewPanel.Visibility = Visibility.Collapsed;
        ScreenshotPreviewText.Text = "已添加截图";
    }

    private static BitmapImage CreateScreenshotPreviewImage(ChatImageInput screenshot)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.StreamSource = new MemoryStream(Convert.FromBase64String(screenshot.Data));
        image.EndInit();
        image.Freeze();
        return image;
    }

    private void AddAssistantResponse(ChatResponse response)
    {
        var panel = new StackPanel();
        AddMarkdownText(panel, response.Answer);

        if (response.Sources.Count > 0)
        {
            panel.Children.Add(new TextBlock
            {
                Text = "来源",
                Foreground = FindBrush("MutedBrush"),
                FontSize = 12,
                Margin = new Thickness(0, 12, 0, 6)
            });

            foreach (var source in response.Sources)
            {
                panel.Children.Add(CreateSourceCard(source));
            }
        }

        if (response.ToolCards.Count > 0)
        {
            panel.Children.Add(new TextBlock
            {
                Text = "地图工具",
                Foreground = FindBrush("MutedBrush"),
                FontSize = 12,
                Margin = new Thickness(0, 12, 0, 6)
            });

            foreach (var toolCard in response.ToolCards)
            {
                panel.Children.Add(CreateToolCard(toolCard));
            }
        }

        if (response.Harness.Warnings.Count > 0)
        {
            panel.Children.Add(CreateWarningBlock(response.Harness.Warnings));
        }

        AddMessageContainer(GetAgentLabel(response.AgentId), panel, isUser: false);
    }

    private void AddMarkdownText(StackPanel panel, string markdown)
    {
        var lines = markdown.Replace("\r\n", "\n").Split('\n');
        var codeBlock = new StringBuilder();
        var inCodeBlock = false;

        foreach (var rawLine in lines)
        {
            var line = rawLine.TrimEnd();
            if (line.TrimStart().StartsWith("```", StringComparison.Ordinal))
            {
                if (inCodeBlock)
                {
                    panel.Children.Add(CreateCodeBlock(codeBlock.ToString().TrimEnd()));
                    codeBlock.Clear();
                    inCodeBlock = false;
                }
                else
                {
                    inCodeBlock = true;
                }
                continue;
            }

            if (inCodeBlock)
            {
                codeBlock.AppendLine(line);
                continue;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                panel.Children.Add(new Border { Height = 6 });
                continue;
            }

            panel.Children.Add(CreateMarkdownLine(line));
        }

        if (inCodeBlock && codeBlock.Length > 0)
        {
            panel.Children.Add(CreateCodeBlock(codeBlock.ToString().TrimEnd()));
        }
    }

    private UIElement CreateMarkdownLine(string line)
    {
        var headingLevel = line.TakeWhile(character => character == '#').Count();
        if (headingLevel is >= 1 and <= 3 && line.Length > headingLevel && line[headingLevel] == ' ')
        {
            var heading = new TextBlock
            {
                FontWeight = FontWeights.Bold,
                FontSize = headingLevel == 1 ? 16 : 14,
                LineHeight = 22,
                Margin = new Thickness(0, 2, 0, 4),
                TextWrapping = TextWrapping.Wrap
            };
            AddMarkdownInlineText(heading.Inlines, line[(headingLevel + 1)..]);
            return heading;
        }

        var bulletMatch = Regex.Match(line, @"^\s*[-*]\s+(.+)$");
        var numberedMatch = Regex.Match(line, @"^\s*(\d+)\.\s+(.+)$");
        var textBlock = new TextBlock
        {
            LineHeight = 21,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 4)
        };

        if (bulletMatch.Success)
        {
            textBlock.Inlines.Add(new Run("• "));
            AddMarkdownInlineText(textBlock.Inlines, bulletMatch.Groups[1].Value);
            return textBlock;
        }

        if (numberedMatch.Success)
        {
            textBlock.Inlines.Add(new Run($"{numberedMatch.Groups[1].Value}. "));
            AddMarkdownInlineText(textBlock.Inlines, numberedMatch.Groups[2].Value);
            return textBlock;
        }

        AddMarkdownInlineText(textBlock.Inlines, line);
        return textBlock;
    }

    private Border CreateCodeBlock(string code)
    {
        return new Border
        {
            Child = new TextBlock
            {
                Text = code,
                FontFamily = new System.Windows.Media.FontFamily("Cascadia Mono, Consolas"),
                FontSize = 12,
                LineHeight = 18,
                TextWrapping = TextWrapping.Wrap,
                Foreground = FindBrush("TextBrush")
            },
            Padding = new Thickness(10),
            Margin = new Thickness(0, 4, 0, 8),
            Background = new SolidColorBrush(MediaColor.FromArgb(210, 8, 10, 14)),
            CornerRadius = new CornerRadius(8)
        };
    }

    private void AddMarkdownInlineText(InlineCollection inlines, string text)
    {
        var remaining = text;
        while (remaining.Length > 0)
        {
            var start = remaining.IndexOf("**", StringComparison.Ordinal);
            if (start < 0)
            {
                inlines.Add(new Run(remaining));
                return;
            }

            if (start > 0)
            {
                inlines.Add(new Run(remaining[..start]));
            }

            var end = remaining.IndexOf("**", start + 2, StringComparison.Ordinal);
            if (end < 0)
            {
                inlines.Add(new Run(remaining[start..]));
                return;
            }

            inlines.Add(new Run(remaining[(start + 2)..end]) { FontWeight = FontWeights.Bold });
            remaining = remaining[(end + 2)..];
        }
    }

    private Border CreateSourceCard(SourceCard source)
    {
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock
        {
            Text = $"{source.Source} · {source.Freshness}",
            Foreground = FindBrush("MutedBrush"),
            FontSize = 11
        });
        stack.Children.Add(new TextBlock
        {
            Text = source.Title,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 3, 0, 3)
        });
        stack.Children.Add(new TextBlock
        {
            Text = source.Summary,
            Foreground = FindBrush("MutedBrush"),
            LineHeight = 18
        });

        return new Border
        {
            Child = stack,
            Padding = new Thickness(10),
            Margin = new Thickness(0, 0, 0, 8),
            Background = new SolidColorBrush(MediaColor.FromArgb(72, 5, 8, 12)),
            BorderBrush = FindBrush("LineBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12)
        };
    }

    private Border CreateToolCard(ToolCard toolCard)
    {
        var layers = toolCard.Layers.Count > 0 ? string.Join(" / ", toolCard.Layers) : "默认图层";
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock
        {
            Text = $"{toolCard.Source} · {toolCard.Freshness}",
            Foreground = FindBrush("AccentBrush"),
            FontSize = 11
        });
        stack.Children.Add(new TextBlock
        {
            Text = toolCard.Title,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 3, 0, 3)
        });
        stack.Children.Add(new TextBlock
        {
            Text = toolCard.Summary,
            Foreground = FindBrush("MutedBrush"),
            LineHeight = 18
        });
        stack.Children.Add(new TextBlock
        {
            Text = $"图层：{layers}",
            Foreground = FindBrush("MutedBrush"),
            FontSize = 11,
            Margin = new Thickness(0, 5, 0, 0)
        });

        return new Border
        {
            Child = stack,
            Padding = new Thickness(10),
            Margin = new Thickness(0, 0, 0, 8),
            Background = new SolidColorBrush(MediaColor.FromArgb(84, 6, 18, 16)),
            BorderBrush = FindBrush("AccentBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12)
        };
    }

    private Border CreateWarningBlock(IReadOnlyCollection<string> warnings)
    {
        var text = string.Join(Environment.NewLine, warnings.Select(warning => $"• {warning}"));
        return new Border
        {
            Child = new TextBlock
            {
                Text = text,
                Foreground = FindBrush("WarningBrush"),
                LineHeight = 18
            },
            Padding = new Thickness(10),
            Margin = new Thickness(0, 10, 0, 0),
            Background = new SolidColorBrush(MediaColor.FromArgb(30, 248, 198, 107)),
            CornerRadius = new CornerRadius(12)
        };
    }

    private Border AddMessage(string label, string text, bool isUser, bool isError = false)
    {
        var body = new TextBlock
        {
            Text = text,
            LineHeight = 21,
            TextWrapping = TextWrapping.Wrap
        };
        return AddMessageContainer(label, body, isUser, isError);
    }

    private Border AddMessageContainer(string label, UIElement body, bool isUser, bool isError = false)
    {
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock
        {
            Text = label,
            Foreground = FindBrush("MutedBrush"),
            FontSize = 12,
            Margin = new Thickness(0, 0, 0, 6)
        });
        stack.Children.Add(body);

        var border = new Border
        {
            Child = stack,
            Padding = new Thickness(13),
            Background = CreateBubbleBrush(isUser, isError),
            BorderBrush = isError ? FindBrush("ErrorBrush") : MediaBrushes.Transparent,
            BorderThickness = new Thickness(isError ? 1 : 0),
            CornerRadius = new CornerRadius(12),
            Margin = isUser ? new Thickness(42, 0, 0, 12) : new Thickness(0, 0, 42, 12),
            HorizontalAlignment = isUser ? WpfHorizontalAlignment.Right : WpfHorizontalAlignment.Left,
            MaxWidth = 342
        };

        MessageStack.Children.Add(border);
        Dispatcher.BeginInvoke(() => ChatScrollViewer.ScrollToEnd());
        return border;
    }

    private void RemovePending()
    {
        if (_pendingMessage is not null)
        {
            MessageStack.Children.Remove(_pendingMessage);
            _pendingMessage = null;
        }
    }

    private MediaBrush FindBrush(string key)
    {
        return (MediaBrush)FindResource(key);
    }

    private static string GetAgentLabel(string agentId)
    {
        return agentId switch
        {
            "research" => "资料检索代理",
            "mechanics" => "机制分析代理",
            "build" => "配装建议代理",
            "route" => "路线规划代理",
            "combat" => "战斗教练代理",
            "critic" => "质量审查代理",
            _ => "总控攻略代理"
        };
    }

    private void HideButton_Click(object sender, RoutedEventArgs e)
    {
        Hide();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
