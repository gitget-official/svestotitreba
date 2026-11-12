using System.Linq.Expressions;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model;
using Planiraj.Model.Dtos;
using Planiraj.Model.Enums;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Notifications;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>
/// Poruke mladenaca i salona (FR-13). Mladenci pišu salonima koji imaju vlasnika na platformi; salon odgovara,
/// ali ne može prvi pisati. Razgovor vide samo mladenci i trenutni vlasnik salona (administrator ne).
/// Nova poruka ide učesnicima odmah (IChatRealtime), a e-mailom (FR-15) samo prva nepročitana.
/// </summary>
public partial class ChatService : IChatService
{
    private const string VendorClosedMessage =
        "Ovaj salon još ne prima poruke preko platforme. Kontaktirajte ga telefonom ili e-mailom sa njegove stranice.";

    private readonly PlanirajDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IChatRealtime _realtime;
    private readonly IChatEmailNotifier _emails;

    public ChatService(PlanirajDbContext context, ICurrentUserService currentUser, IChatRealtime realtime, IChatEmailNotifier emails)
    {
        _context = context;
        _currentUser = currentUser;
        _realtime = realtime;
        _emails = emails;
    }

    /// <summary>Prijavljeni korisnik i njegova strana u razgovoru.</summary>
    private readonly record struct Viewer(int UserId, bool IsVendor);

    public async Task<ConversationListDto> ListAsync(ConversationSearchObject search)
    {
        var viewer = CurrentViewer();
        var query = Visible(viewer);

        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(c => c.VendorId == vendorId);
        }

        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = viewer.IsVendor
                ? query.Where(c => (c.CoupleUser.FirstName + " " + c.CoupleUser.LastName).Contains(term))
                : query.Where(c => c.Vendor.Name.Contains(term));
        }

        var page = Math.Max(1, search.Page);
        var pageSize = Math.Clamp(search.PageSize, 1, ChatLimits.MaxPageSize);
        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(c => c.LastMessageAt).ThenByDescending(c => c.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Projection(viewer.IsVendor))
            .ToListAsync();

        return new ConversationListDto
        {
            Items = items,
            TotalCount = total,
            Page = page,
            PageSize = pageSize,
            UnreadTotal = await UnreadTotalAsync(viewer)
        };
    }

    public async Task<ConversationDto> GetAsync(int id)
    {
        var viewer = CurrentViewer();
        // Tuđi razgovor je "nije pronađen", da se ne otkriva ni da postoji.
        return await Visible(viewer).Where(c => c.Id == id).Select(Projection(viewer.IsVendor)).FirstOrDefaultAsync()
               ?? throw new NotFoundException("Razgovor nije pronađen.");
    }

    public async Task<ConversationDto?> GetWithVendorAsync(int vendorId)
    {
        var viewer = CurrentViewer();
        if (viewer.IsVendor)
            throw new ForbiddenException("Salon vidi razgovore u svom sandučetu.");

        return await Visible(viewer).Where(c => c.VendorId == vendorId).Select(Projection(false)).FirstOrDefaultAsync();
    }

    public async Task<ChatMessagePageDto> GetMessagesAsync(int conversationId, int? beforeId, int pageSize)
    {
        var viewer = CurrentViewer();
        if (!await Visible(viewer).AnyAsync(c => c.Id == conversationId))
            throw new NotFoundException("Razgovor nije pronađen.");

        var size = Math.Clamp(pageSize, 1, ChatLimits.MaxPageSize);
        var query = _context.ChatMessages.AsNoTracking().Where(m => m.ConversationId == conversationId);
        if (beforeId.HasValue)
        {
            var before = beforeId.Value;
            query = query.Where(m => m.Id < before);
        }

        // Jedna više od tražene stranice govori da li postoje starije poruke.
        var rows = await query.OrderByDescending(m => m.Id).Take(size + 1).Select(MessageProjection).ToListAsync();
        var hasMore = rows.Count > size;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        rows.Reverse();

        return new ChatMessagePageDto { Items = rows, HasMore = hasMore };
    }

    public async Task<ChatSendResultDto> StartAsync(ConversationStartRequest request)
    {
        var viewer = CurrentViewer();
        if (viewer.IsVendor)
            throw new ForbiddenException("Salon ne može prvi pisati; odgovorite na poruku mladenaca.");

        var conversation = await WithParticipants(_context.Conversations)
            .FirstOrDefaultAsync(c => c.VendorId == request.VendorId && c.CoupleUserId == viewer.UserId);

        if (conversation == null)
        {
            var vendor = await _context.Vendors.Include(v => v.Owner)
                             .FirstOrDefaultAsync(v => v.Id == request.VendorId && v.IsActive)
                         ?? throw new NotFoundException("Ponuđač nije pronađen.");
            if (!AcceptsMessages(vendor))
                throw new UserException(VendorClosedMessage);

            var couple = await _context.Users.FindAsync(viewer.UserId)
                         ?? throw new NotFoundException("Korisnik nije pronađen.");
            conversation = new Conversation { Vendor = vendor, CoupleUser = couple, CreatedAt = DateTime.UtcNow };
            _context.Conversations.Add(conversation);
        }

        return await AppendAsync(conversation, request.Body, viewer);
    }

    public async Task<ChatSendResultDto> SendAsync(int conversationId, ChatMessageSendRequest request)
    {
        var viewer = CurrentViewer();
        var conversation = await WithParticipants(Visible(viewer)).FirstOrDefaultAsync(c => c.Id == conversationId)
                           ?? throw new NotFoundException("Razgovor nije pronađen.");
        return await AppendAsync(conversation, request.Body, viewer);
    }

    public async Task<ConversationDto> MarkReadAsync(int conversationId)
    {
        var viewer = CurrentViewer();
        var conversation = await Visible(viewer).Include(c => c.Vendor).FirstOrDefaultAsync(c => c.Id == conversationId)
                           ?? throw new NotFoundException("Razgovor nije pronađen.");

        var latest = await _context.ChatMessages.Where(m => m.ConversationId == conversationId).MaxAsync(m => (int?)m.Id) ?? 0;
        var current = viewer.IsVendor ? conversation.VendorLastReadMessageId : conversation.CoupleLastReadMessageId;
        if (latest > current)
        {
            if (viewer.IsVendor) conversation.VendorLastReadMessageId = latest;
            else conversation.CoupleLastReadMessageId = latest;
            await _context.SaveChangesAsync();

            // Druga strana vidi "Viđeno", a ostale kartice istog korisnika skidaju oznaku nepročitanog.
            var views = await BothViewsAsync(conversation.Id);
            await _realtime.ConversationAsync(conversation.CoupleUserId, views.Couple);
            if (conversation.Vendor.OwnerUserId is int ownerId)
                await _realtime.ConversationAsync(ownerId, views.Vendor);
            return viewer.IsVendor ? views.Vendor : views.Couple;
        }

        return await ProjectAsync(conversation.Id, viewer.IsVendor);
    }

    // ---------------- Pomoćno ----------------

    private async Task<ChatSendResultDto> AppendAsync(Conversation conversation, string body, Viewer viewer)
    {
        var text = body.Trim();
        if (text.Length == 0)
            throw new UserException("Poruka je prazna.");

        var fromVendor = viewer.IsVendor;
        if (fromVendor && !CanReceive(conversation.CoupleUser))
            throw new UserException("Mladenci više nisu na platformi, pa im ne možete pisati.");
        if (!fromVendor && !AcceptsMessages(conversation.Vendor))
            throw new UserException(VendorClosedMessage);

        // E-mail ide samo za prvu nepročitanu poruku: dok primalac ne otvori razgovor, ne dobija nove e-mailove.
        var recipient = fromVendor ? conversation.CoupleUser : conversation.Vendor.Owner;
        var recipientLastRead = fromVendor ? conversation.CoupleLastReadMessageId : conversation.VendorLastReadMessageId;
        var recipientHadUnread = conversation.Id != 0 && await _context.ChatMessages.AnyAsync(m =>
            m.ConversationId == conversation.Id && m.FromVendor == fromVendor && m.Id > recipientLastRead);

        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            Conversation = conversation,
            SenderUserId = viewer.UserId,
            FromVendor = fromVendor,
            Body = text,
            CreatedAt = now
        };
        _context.ChatMessages.Add(message);
        conversation.LastMessageAt = now;
        conversation.LastMessagePreview = Preview(text);
        conversation.LastMessageFromVendor = fromVendor;

        // Poruka i e-mail u jednoj transakciji: e-mailu treba Id razgovora (link), pa se snima dvaput.
        await using (var transaction = await _context.Database.BeginTransactionAsync())
        {
            await _context.SaveChangesAsync();

            // Ko piše, vidio je i sve prije svoje poruke.
            if (fromVendor) conversation.VendorLastReadMessageId = message.Id;
            else conversation.CoupleLastReadMessageId = message.Id;
            if (!recipientHadUnread && recipient != null && CanReceive(recipient))
                _emails.Queue(conversation, message, recipient);

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }

        var messageDto = ToDto(message);
        var views = await BothViewsAsync(conversation.Id);
        await _realtime.MessageAsync(conversation.CoupleUserId, new ChatSendResultDto { Conversation = views.Couple, Message = messageDto });
        if (conversation.Vendor.OwnerUserId is int ownerId)
            await _realtime.MessageAsync(ownerId, new ChatSendResultDto { Conversation = views.Vendor, Message = messageDto });

        return new ChatSendResultDto { Conversation = fromVendor ? views.Vendor : views.Couple, Message = messageDto };
    }

    private Viewer CurrentViewer()
    {
        var userId = _currentUser.RequireUserId();
        return _currentUser.Role switch
        {
            UserRole.Couple => new Viewer(userId, false),
            UserRole.Vendor => new Viewer(userId, true),
            _ => throw new ForbiddenException("Poruke su dostupne samo mladencima i salonima.")
        };
    }

    /// <summary>Razgovori koje korisnik smije vidjeti: svoje (mladenci) ili svih salona kojima je vlasnik (salon).</summary>
    private IQueryable<Conversation> Visible(Viewer viewer)
    {
        var userId = viewer.UserId;
        return viewer.IsVendor
            ? _context.Conversations.Where(c => c.Vendor.OwnerUserId == userId)
            : _context.Conversations.Where(c => c.CoupleUserId == userId);
    }

    private static IQueryable<Conversation> WithParticipants(IQueryable<Conversation> query) =>
        query.Include(c => c.CoupleUser).Include(c => c.Vendor).ThenInclude(v => v.Owner);

    private Task<int> UnreadTotalAsync(Viewer viewer)
    {
        var userId = viewer.UserId;
        return viewer.IsVendor
            ? _context.ChatMessages.CountAsync(m => !m.FromVendor && m.Conversation.Vendor.OwnerUserId == userId
                                                    && m.Id > m.Conversation.VendorLastReadMessageId)
            : _context.ChatMessages.CountAsync(m => m.FromVendor && m.Conversation.CoupleUserId == userId
                                                    && m.Id > m.Conversation.CoupleLastReadMessageId);
    }

    private async Task<(ConversationDto Couple, ConversationDto Vendor)> BothViewsAsync(int id) =>
        (await ProjectAsync(id, forVendor: false), await ProjectAsync(id, forVendor: true));

    private Task<ConversationDto> ProjectAsync(int id, bool forVendor) =>
        _context.Conversations.AsNoTracking().Where(c => c.Id == id).Select(Projection(forVendor)).FirstAsync();

    /// <summary>Salon prima poruke kad je aktivan i ima aktivnog vlasnika (isto pravilo kao VendorDto.AcceptsMessages).</summary>
    private static bool AcceptsMessages(Vendor vendor) =>
        vendor.IsActive && vendor.Owner != null && CanReceive(vendor.Owner);

    private static bool CanReceive(User user) => user.IsActive && user.DeletedAt == null;

    private static Expression<Func<Conversation, ConversationDto>> Projection(bool forVendor) => c => new ConversationDto
    {
        Id = c.Id,
        VendorId = c.VendorId,
        VendorName = c.Vendor.Name,
        VendorSlug = c.Vendor.Slug,
        VendorLogoUrl = c.Vendor.LogoUrl,
        CoupleUserId = c.CoupleUserId,
        CoupleFirstName = c.CoupleUser.FirstName,
        CoupleLastName = c.CoupleUser.LastName,
        CoupleAvatarUrl = c.CoupleUser.AvatarUrl != null && c.CoupleUser.AvatarUrl.StartsWith("avatar:") ? c.CoupleUser.AvatarUrl : null,
        CreatedAt = Utc(c.CreatedAt),
        LastMessageAt = Utc(c.LastMessageAt),
        LastMessagePreview = c.LastMessagePreview,
        LastMessageFromVendor = c.LastMessageFromVendor,
        UnreadCount = forVendor
            ? c.Messages.Count(m => !m.FromVendor && m.Id > c.VendorLastReadMessageId)
            : c.Messages.Count(m => m.FromVendor && m.Id > c.CoupleLastReadMessageId),
        OtherLastReadMessageId = forVendor ? c.CoupleLastReadMessageId : c.VendorLastReadMessageId,
        CanReply = forVendor
            ? c.CoupleUser.IsActive && c.CoupleUser.DeletedAt == null
            : c.Vendor.IsActive && c.Vendor.Owner != null && c.Vendor.Owner.IsActive && c.Vendor.Owner.DeletedAt == null
    };

    private static readonly Expression<Func<ChatMessage, ChatMessageDto>> MessageProjection = m => new ChatMessageDto
    {
        Id = m.Id,
        ConversationId = m.ConversationId,
        FromVendor = m.FromVendor,
        Body = m.Body,
        CreatedAt = Utc(m.CreatedAt)
    };

    private static ChatMessageDto ToDto(ChatMessage m) => new()
    {
        Id = m.Id,
        ConversationId = m.ConversationId,
        FromVendor = m.FromVendor,
        Body = m.Body,
        CreatedAt = Utc(m.CreatedAt)
    };

    /// <summary>Vremena se čuvaju u UTC-u, ali baza vraća DateTime bez oznake; sa oznakom ih preglednik prikaže u lokalnom vremenu.</summary>
    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static string Preview(string text)
    {
        var line = Whitespace().Replace(text, " ");
        return line.Length <= ChatLimits.PreviewLength ? line : line[..(ChatLimits.PreviewLength - 1)] + "…";
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
