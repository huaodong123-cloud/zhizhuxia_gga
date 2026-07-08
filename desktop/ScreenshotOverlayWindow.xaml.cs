using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Zhizhuxia.Desktop;

public partial class ScreenshotOverlayWindow : Window
{
    private System.Windows.Point _start;
    private bool _isSelecting;

    public Rect? CapturedRegion { get; private set; }

    public ScreenshotOverlayWindow()
    {
        InitializeComponent();
        Left = SystemParameters.VirtualScreenLeft;
        Top = SystemParameters.VirtualScreenTop;
        Width = SystemParameters.VirtualScreenWidth;
        Height = SystemParameters.VirtualScreenHeight;
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _start = e.GetPosition(RootCanvas);
        _isSelecting = true;
        SelectionBorder.Visibility = Visibility.Visible;
        CaptureMouse();
    }

    private void Window_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (!_isSelecting)
        {
            return;
        }

        var current = e.GetPosition(RootCanvas);
        var left = Math.Min(_start.X, current.X);
        var top = Math.Min(_start.Y, current.Y);
        var width = Math.Abs(current.X - _start.X);
        var height = Math.Abs(current.Y - _start.Y);

        Canvas.SetLeft(SelectionBorder, left);
        Canvas.SetTop(SelectionBorder, top);
        SelectionBorder.Width = width;
        SelectionBorder.Height = height;
    }

    private void Window_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isSelecting)
        {
            return;
        }

        _isSelecting = false;
        ReleaseMouseCapture();

        var left = Canvas.GetLeft(SelectionBorder);
        var top = Canvas.GetTop(SelectionBorder);
        var width = SelectionBorder.Width;
        var height = SelectionBorder.Height;

        if (width < 8 || height < 8)
        {
            DialogResult = false;
            return;
        }

        CapturedRegion = new Rect(Left + left, Top + top, width, height);
        DialogResult = true;
    }

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            DialogResult = false;
        }
    }
}
