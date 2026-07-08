namespace Zhizhuxia.Desktop.Services;

public static class LoginState
{
    public static bool CanEnterChat(string? apiKey)
    {
        return !string.IsNullOrWhiteSpace(apiKey);
    }
}
