using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media.Imaging;

namespace Zhizhuxia.Desktop.Services;

public sealed class ScreenshotService
{
    public static ChatImageInput EncodeBitmapToPngBase64(BitmapSource bitmap)
    {
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));

        using var stream = new MemoryStream();
        encoder.Save(stream);

        return new ChatImageInput("image/png", Convert.ToBase64String(stream.ToArray()));
    }

    public ChatImageInput CaptureRegion(Rect region)
    {
        var left = (int)Math.Round(region.Left);
        var top = (int)Math.Round(region.Top);
        var width = Math.Max(1, (int)Math.Round(region.Width));
        var height = Math.Max(1, (int)Math.Round(region.Height));

        var screenDc = NativeMethods.GetDC(IntPtr.Zero);
        var memoryDc = NativeMethods.CreateCompatibleDC(screenDc);
        var handle = NativeMethods.CreateCompatibleBitmap(screenDc, width, height);
        var oldObject = NativeMethods.SelectObject(memoryDc, handle);
        try
        {
            NativeMethods.BitBlt(memoryDc, 0, 0, width, height, screenDc, left, top, NativeMethods.Srccopy);
            var source = System.Windows.Interop.Imaging.CreateBitmapSourceFromHBitmap(
                handle,
                IntPtr.Zero,
                Int32Rect.Empty,
                BitmapSizeOptions.FromEmptyOptions());

            return EncodeBitmapToPngBase64(source);
        }
        finally
        {
            NativeMethods.SelectObject(memoryDc, oldObject);
            NativeMethods.DeleteObject(handle);
            NativeMethods.DeleteDC(memoryDc);
            NativeMethods.ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    private static class NativeMethods
    {
        public const int Srccopy = 0x00CC0020;

        [DllImport("user32.dll")]
        public static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDc);

        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateCompatibleDC(IntPtr hDc);

        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateCompatibleBitmap(IntPtr hDc, int width, int height);

        [DllImport("gdi32.dll")]
        public static extern IntPtr SelectObject(IntPtr hDc, IntPtr hObject);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int width, int height, IntPtr hdcSrc, int xSrc, int ySrc, int rop);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool DeleteDC(IntPtr hDc);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool DeleteObject(IntPtr hObject);
    }
}
