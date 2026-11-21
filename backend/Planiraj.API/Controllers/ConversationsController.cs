using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Planiraj.API.Auth;
using Planiraj.Model;
using Planiraj.Model.Dtos;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>
/// /api/conversations: poruke mladenaca i salona (FR-13). Mladenci i vlasnici salona vide samo svoje razgovore;
/// nove poruke stižu i preko /api/hubs/chat (vidi ChatHub).
/// </summary>
[ApiController]
[Route("api/conversations")]
[Authorize]
public class ConversationsController : ControllerBase
{
    private readonly IChatService _service;

    public ConversationsController(IChatService service) => _service = service;

    [HttpGet]
    public Task<ConversationListDto> Get([FromQuery] ConversationSearchObject search) => _service.ListAsync(search);

    [HttpGet("{id:int}")]
    public Task<ConversationDto> GetById(int id) => _service.GetAsync(id);

    /// <summary>Razgovor mladenaca sa salonom; 204 kad mu još nisu pisali.</summary>
    [HttpGet("vendor/{vendorId:int}")]
    public async Task<ActionResult<ConversationDto>> GetWithVendor(int vendorId)
    {
        var conversation = await _service.GetWithVendorAsync(vendorId);
        return conversation == null ? NoContent() : conversation;
    }

    [HttpGet("{id:int}/messages")]
    public Task<ChatMessagePageDto> GetMessages(int id, [FromQuery] int? beforeId, [FromQuery] int pageSize = 30) =>
        _service.GetMessagesAsync(id, beforeId, Math.Min(pageSize, ChatLimits.MaxPageSize));

    /// <summary>Prva poruka salonu (samo mladenci); ako razgovor već postoji, poruka ide u njega.</summary>
    [HttpPost]
    [EnableRateLimiting(RateLimits.Chat)]
    public Task<ChatSendResultDto> Start([FromBody] ConversationStartRequest request) => _service.StartAsync(request);

    [HttpPost("{id:int}/messages")]
    [EnableRateLimiting(RateLimits.Chat)]
    public Task<ChatSendResultDto> Send(int id, [FromBody] ChatMessageSendRequest request) => _service.SendAsync(id, request);

    [HttpPut("{id:int}/read")]
    public Task<ConversationDto> MarkRead(int id) => _service.MarkReadAsync(id);
}
