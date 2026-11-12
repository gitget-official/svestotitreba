using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Planiraj.API.Auth;
using Planiraj.Model.Dtos;
using Planiraj.Services.Notifications;

namespace Planiraj.API.Chat;

/// <summary>
/// /api/hubs/chat: preglednik ovdje samo prima događaje ("message" i "conversation"). Poruke se šalju preko
/// /api/conversations, pa validacija, ograničenje zahtjeva i e-mail rade kao za svaki drugi zahtjev.
/// WebSocket ne može poslati zaglavlje, pa token dolazi kao access_token u adresi (vidi Program.cs).
/// Pretpostavka je jedna instanca API-ja; za više instanci treba backplane (Redis ili Azure SignalR).
/// </summary>
[Authorize]
public class ChatHub : Hub
{
    public const string Path = "/api/hubs/chat";
}

/// <summary>Korisnik u SignalR-u je "sub" iz tokena (MapInboundClaims je isključen, pa nema NameIdentifier).</summary>
public class SubjectUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User?.FindFirst(AppClaims.UserId)?.Value;
}

/// <summary>Šalje događaj svim otvorenim karticama korisnika. Greška se samo bilježi: poruka je već snimljena.</summary>
public class SignalRChatRealtime(IHubContext<ChatHub> hub, ILogger<SignalRChatRealtime> logger) : IChatRealtime
{
    public Task MessageAsync(int userId, ChatSendResultDto payload) => SendAsync(userId, "message", payload);

    public Task ConversationAsync(int userId, ConversationDto conversation) => SendAsync(userId, "conversation", conversation);

    private async Task SendAsync(int userId, string method, object payload)
    {
        try
        {
            await hub.Clients.User(userId.ToString()).SendAsync(method, payload);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Događaj {Method} nije poslan korisniku {UserId}.", method, userId);
        }
    }
}
