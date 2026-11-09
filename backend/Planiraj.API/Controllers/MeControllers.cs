using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Planiraj.Model.Dtos;
using Planiraj.Model.Requests;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>/api/favorites: "Sačuvano" prijavljenog korisnika.</summary>
[ApiController]
[Route("api/favorites")]
[Authorize]
public class FavoritesController : ControllerBase
{
    private readonly IFavoriteService _service;

    public FavoritesController(IFavoriteService service) => _service = service;

    [HttpGet]
    public Task<List<FavoriteDto>> Get() => _service.ListAsync();

    [HttpPost("{vendorId:int}")]
    public Task<FavoriteDto> Add(int vendorId) => _service.AddAsync(vendorId);

    [HttpDelete("{vendorId:int}")]
    public async Task<IActionResult> Remove(int vendorId)
    {
        await _service.RemoveAsync(vendorId);
        return NoContent();
    }

    /// <summary>Spaja listu sa uređaja (npr. gost koji se upravo prijavio) sa listom na serveru.</summary>
    [HttpPost("sync")]
    public Task<List<FavoriteDto>> Sync([FromBody] FavoriteSyncRequest request) => _service.SyncAsync(request);
}

/// <summary>/api/plans/me: "Moj plan" prijavljenog korisnika (FR-27).</summary>
[ApiController]
[Route("api/plans")]
[Authorize]
public class PlansController : ControllerBase
{
    private readonly IPlanService _service;

    public PlansController(IPlanService service) => _service = service;

    /// <summary>204 kad plan još nije sačuvan.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<PlanDto>> Get()
    {
        var plan = await _service.GetAsync();
        return plan == null ? NoContent() : plan;
    }

    [HttpPut("me")]
    public Task<PlanDto> Save([FromBody] PlanSaveRequest request) => _service.SaveAsync(request);

    [HttpDelete("me")]
    public async Task<IActionResult> Delete()
    {
        await _service.DeleteAsync();
        return NoContent();
    }
}
