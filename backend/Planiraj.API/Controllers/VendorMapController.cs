using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Planiraj.Model.Dtos;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>
/// /api/vendors/map — javne tačke za mapu ponuđača na početnoj. Kratko keširanje: novi ponuđač se pojavi
/// za par minuta, a početna ne opterećuje bazu pri svakom posjetu.
/// </summary>
[ApiController]
[AllowAnonymous]
public class VendorMapController(IVendorMapService map) : ControllerBase
{
    [HttpGet("/api/vendors/map")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public Task<IReadOnlyList<VendorMapPointDto>> Get() => map.GetPointsAsync();
}
