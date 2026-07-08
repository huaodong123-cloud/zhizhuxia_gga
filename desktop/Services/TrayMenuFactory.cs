using System.Windows.Forms;

namespace Zhizhuxia.Desktop.Services;

public static class TrayMenuFactory
{
    public static ContextMenuStrip CreateContextMenu(
        Action onToggle,
        Action onScreenshot,
        Action onSettings,
        Action onExit)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(CreateItem("显示/隐藏智助侠", onToggle));
        menu.Items.Add(CreateItem("区域截图", onScreenshot));
        menu.Items.Add(CreateItem("配置", onSettings));
        menu.Items.Add(CreateItem("退出", onExit));
        return menu;
    }

    private static ToolStripMenuItem CreateItem(string text, Action action)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += (_, _) => action();
        return item;
    }
}
