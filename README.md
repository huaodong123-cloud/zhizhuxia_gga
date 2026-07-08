# Game Guide Agent Lab

A small multi-agent workflow demo for game guides. The primary frontend is now a Windows native desktop tool named 智助侠. It opens as a compact WPF floating window, keeps the 智谱 API key in memory only, and calls the local Node backend for chat, vision analysis, research, specialist agents, and harness warnings.

The desktop shell registers `Ctrl+Alt+F9` as the default global hotkey to show or hide the tool and `Ctrl+Alt+F10` for region screenshots. The existing static web UI remains in the repository as a debug surface, but it is no longer the main product entry.

## Run

Desktop tool:

```powershell
dotnet run --project desktop/Zhizhuxia.Desktop.csproj
```

Backend and tests:

```powershell
npm test
npm start
```

Optional web debug surface:

```text
http://localhost:5177
```

## Project Structure

```text
game-guide-agent-lab/
  desktop/
    Services/
      ChatApiClient.cs
      HotkeyService.cs
      LocalServerService.cs
    Zhizhuxia.Desktop.csproj
    MainWindow.xaml
  server/
    src/
      chat.js
      config.js
      harness.js
      research.js
      server.js
      validation.js
      workflow.js
    test/
      harness.test.js
      validation.test.js
      workflow.test.js
  web/
    app.js
    index.html
    styles.css
```

## Current Scope

- User enters the API key in the Windows desktop tool.
- API key is kept in WPF process memory only and is not written to disk.
- 智谱 GLM-5.2 handles both text answers and screenshot vision analysis.
- The desktop window is topmost and can be shown or hidden with `Ctrl+Alt+F9`.
- The WPF UI is native XAML, not WebView2 and not Electron.
- The local Node backend still owns chat orchestration, research adapters, model calls, and harness checks.
- The desktop shell starts the local backend when it is not already running.
