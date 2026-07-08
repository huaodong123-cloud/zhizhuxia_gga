using System.Drawing;
using System.Drawing.Drawing2D;

namespace Zhizhuxia.Desktop.Services;

public static class TrayIconFactory
{
    public static Icon CreateIcon() => CreateIcon("white", 70);

    public static Icon CreateIcon(string colorMode, double opacityPercent)
    {
        var alpha = Math.Clamp((int)Math.Round(opacityPercent / 100d * 255), 51, 255);
        var iconColor = ResolveIconColor(colorMode, alpha);

        using var bitmap = new Bitmap(32, 32);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.Clear(Color.Transparent);

            using var outer = new GraphicsPath();
            outer.AddBezier(3, 23, 8, 11, 17, 6, 29, 4);
            outer.AddBezier(27, 12, 20, 23, 10, 28, 5, 28);
            outer.CloseFigure();

            using var inner = new GraphicsPath();
            inner.AddBezier(8, 22, 12, 15, 18, 10, 25, 8);
            inner.AddBezier(22, 15, 17, 21, 10, 24, 8, 22);
            inner.CloseFigure();

            using var blackBrush = new SolidBrush(Color.FromArgb(235, 4, 5, 8));
            graphics.FillPath(blackBrush, outer);

            using var iconBrush = new SolidBrush(iconColor);
            graphics.FillPath(iconBrush, inner);

            using var cutout = new GraphicsPath();
            cutout.AddBezier(11, 21, 15, 16, 19, 13, 23, 11);
            cutout.AddBezier(20, 16, 16, 20, 11, 22, 11, 21);
            cutout.CloseFigure();

            using var clearBrush = new SolidBrush(Color.FromArgb(235, 4, 5, 8));
            graphics.FillPath(clearBrush, cutout);
        }

        return Icon.FromHandle(bitmap.GetHicon());
    }

    private static Color ResolveIconColor(string colorMode, int alpha)
    {
        return colorMode switch
        {
            "red" => Color.FromArgb(alpha, 255, 51, 77),
            "cyan" => Color.FromArgb(alpha, 121, 242, 220),
            "dim" => Color.FromArgb(alpha, 148, 163, 184),
            _ => Color.FromArgb(alpha, 248, 251, 255)
        };
    }
}
