using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Input;
using System.Windows.Interop;

namespace Zhizhuxia.Desktop.Services;

public sealed class HotkeyService : IDisposable
{
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private static int s_nextId;
    private readonly int _id = Interlocked.Increment(ref s_nextId);
    private HwndSource? _source;

    public event EventHandler? Pressed;

    public void Register(nint windowHandle, Key key)
    {
        _source = HwndSource.FromHwnd(windowHandle);
        _source.AddHook(WndProc);

        var virtualKey = KeyInterop.VirtualKeyFromKey(key);
        if (!RegisterHotKey(windowHandle, _id, ModControl | ModAlt, (uint)virtualKey))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), $"无法注册快捷键 Ctrl+Alt+{key}。");
        }
    }

    private nint WndProc(nint hwnd, int msg, nint wParam, nint lParam, ref bool handled)
    {
        if (msg == WmHotkey && wParam.ToInt32() == _id)
        {
            Pressed?.Invoke(this, EventArgs.Empty);
            handled = true;
        }

        return nint.Zero;
    }

    public void Dispose()
    {
        if (_source is not null)
        {
            UnregisterHotKey(_source.Handle, _id);
            _source.RemoveHook(WndProc);
            _source = null;
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(nint hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(nint hWnd, int id);
}
