using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Zhizhuxia.Desktop.Services;

public sealed class ChatApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;

    public ChatApiClient(HttpClient? httpClient = null)
    {
        _httpClient = httpClient ?? new HttpClient { BaseAddress = new Uri("http://localhost:5177") };
    }

    public async Task<ChatResponse> SendAsync(ChatRequest request, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.PostAsJsonAsync("/api/chat", request, JsonOptions, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var error = JsonSerializer.Deserialize<ChatErrorResponse>(content, JsonOptions);
            var message = error?.Errors.Count > 0 ? string.Join(" / ", error.Errors) : "请求失败";
            throw new InvalidOperationException(message);
        }

        return JsonSerializer.Deserialize<ChatResponse>(content, JsonOptions)
            ?? throw new InvalidOperationException("服务返回为空。");
    }
}

public sealed record ChatRequest(
    string ApiKey,
    string AgentId,
    string GameName,
    string Message,
    string? ModelId = null,
    IReadOnlyList<ChatImageInput>? Images = null,
    string? VisionApiKey = null,
    ChatImageInput? Screenshot = null);

public sealed record ChatImageInput(string MediaType, string Data);

public sealed record ChatResponse
{
    public string Status { get; init; } = "";
    public string Model { get; init; } = "";
    public string AgentId { get; init; } = "";
    public string Confidence { get; init; } = "";
    public bool NeedResearch { get; init; }
    public int ImagesUsed { get; init; }
    public ModelCapabilities ModelCapabilities { get; init; } = new();
    public List<string> UsedAgents { get; init; } = [];
    public List<SourceCard> Sources { get; init; } = [];
    public string Answer { get; init; } = "";
    public HarnessReport Harness { get; init; } = new();
}

public sealed record ModelCapabilities
{
    public bool Text { get; init; }
    public bool Vision { get; init; }
    public bool Tools { get; init; }
    public bool ImageGeneration { get; init; }
}

public sealed record SourceCard
{
    public string Source { get; init; } = "";
    public string Title { get; init; } = "";
    public string Url { get; init; } = "";
    public string Summary { get; init; } = "";
    public string Freshness { get; init; } = "";
}

public sealed record HarnessReport
{
    public bool Ok { get; init; }
    public List<string> Warnings { get; init; } = [];
}

public sealed record ChatErrorResponse
{
    public string Status { get; init; } = "";
    public List<string> Errors { get; init; } = [];
}
