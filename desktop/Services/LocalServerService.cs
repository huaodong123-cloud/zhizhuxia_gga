using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;

namespace Zhizhuxia.Desktop.Services;

public sealed class LocalServerService : IDisposable
{
    private readonly HttpClient _httpClient;
    private Process? _ownedProcess;

    public LocalServerService(HttpClient? httpClient = null)
    {
        _httpClient = httpClient ?? new HttpClient { BaseAddress = new Uri("http://localhost:5177") };
    }

    public async Task<bool> IsServerHealthyAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await _httpClient.GetAsync("/api/health", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            var payload = await response.Content.ReadFromJsonAsync<HealthResponse>(cancellationToken);
            return payload?.Ok == true &&
                payload.Model == "glm-5.2" &&
                payload.Provider == "zhipu";
        }
        catch
        {
            return false;
        }
    }

    public async Task EnsureServerAsync(CancellationToken cancellationToken = default)
    {
        if (await IsServerHealthyAsync(cancellationToken))
        {
            return;
        }

        ReleaseStaleServerPort();

        var root = FindProjectRoot();
        _ownedProcess = Process.Start(new ProcessStartInfo
        {
            FileName = "node",
            Arguments = "server/src/server.js",
            WorkingDirectory = root,
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden
        });

        for (var attempt = 0; attempt < 30; attempt += 1)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await Task.Delay(200, cancellationToken);
            if (await IsServerHealthyAsync(cancellationToken))
            {
                return;
            }
        }

        throw new InvalidOperationException("本地服务启动失败。");
    }

    private static void ReleaseStaleServerPort()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "netstat",
                Arguments = "-ano",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            if (process is null)
            {
                return;
            }

            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(3000);

            foreach (var line in output.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries))
            {
                if (!line.Contains(":5177", StringComparison.Ordinal) ||
                    !line.Contains("LISTENING", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5 || !int.TryParse(parts[^1], out var processId))
                {
                    continue;
                }

                using var owner = Process.GetProcessById(processId);
                if (!owner.ProcessName.Equals("node", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                owner.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Best effort: if the port is not occupied or cannot be released, normal startup will report the real failure.
        }
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                Directory.Exists(Path.Combine(directory.FullName, "server")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("无法定位项目根目录。");
    }

    public void Dispose()
    {
        if (_ownedProcess is { HasExited: false })
        {
            _ownedProcess.Kill(entireProcessTree: true);
        }

        _ownedProcess?.Dispose();
        _httpClient.Dispose();
    }
}

public sealed record HealthResponse
{
    public bool Ok { get; init; }
    public string Name { get; init; } = "";
    public string Model { get; init; } = "";
    public string Provider { get; init; } = "";
}
