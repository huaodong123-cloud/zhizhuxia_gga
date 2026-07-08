using System.Windows;
using System.Windows.Input;

namespace Zhizhuxia.Desktop;

public partial class SettingsWindow : Window
{
    public SettingsWindow(
        string zhipuApiKey,
        string iconColorMode = "white",
        double iconOpacityPercent = 70,
        double panelOpacityPercent = 45,
        double bubbleOpacityPercent = 82,
        bool topmostEnabled = true,
        bool clickThroughCollapsedOnly = false)
    {
        InitializeComponent();
        ZhipuKeyBox.Password = zhipuApiKey;
        SetIconColorMode(iconColorMode);
        IconOpacitySlider.Value = iconOpacityPercent;
        PanelOpacitySlider.Value = panelOpacityPercent;
        BubbleOpacitySlider.Value = bubbleOpacityPercent;
        TopmostCheckBox.IsChecked = topmostEnabled;
        ClickThroughCollapsedOnlyCheckBox.IsChecked = clickThroughCollapsedOnly;
    }

    public string ZhipuApiKey => ZhipuKeyBox.Password.Trim();
    public string IconColorMode => GetIconColorMode();
    public double IconOpacityPercent => IconOpacitySlider.Value;
    public double PanelOpacityPercent => PanelOpacitySlider.Value;
    public double BubbleOpacityPercent => BubbleOpacitySlider.Value;
    public bool TopmostEnabled => TopmostCheckBox.IsChecked == true;
    public bool ClickThroughCollapsedOnly => ClickThroughCollapsedOnlyCheckBox.IsChecked == true;

    private string GetIconColorMode()
    {
        if (IconColorRedRadio.IsChecked == true) return "red";
        if (IconColorCyanRadio.IsChecked == true) return "cyan";
        if (IconColorDimRadio.IsChecked == true) return "dim";
        return "white";
    }

    private void SetIconColorMode(string iconColorMode)
    {
        IconColorWhiteRadio.IsChecked = iconColorMode == "white";
        IconColorRedRadio.IsChecked = iconColorMode == "red";
        IconColorCyanRadio.IsChecked = iconColorMode == "cyan";
        IconColorDimRadio.IsChecked = iconColorMode == "dim";
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void SettingsHeader_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }
}
