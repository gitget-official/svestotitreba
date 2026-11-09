using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Planiraj.Model;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>
/// GET lista (paginirano, sa filterima) i GET po Id-u. Endpointi traže prijavu, osim čitanja u kontrolerima
/// sa [PublicRead] (ponuda je javna, vidi PublicReadConvention); pravila po ulogama i vlasništvu provjeravaju servisi.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public abstract class BaseController<TModel, TSearch> : ControllerBase
    where TSearch : BaseSearchObject
{
    private readonly IService<TModel, TSearch> _service;

    protected BaseController(IService<TModel, TSearch> service)
    {
        _service = service;
    }

    [HttpGet]
    public virtual Task<PagedResult<TModel>> Get([FromQuery] TSearch search) => _service.GetPagedAsync(search);

    [HttpGet("{id:int}")]
    public virtual Task<TModel> GetById(int id) => _service.GetByIdAsync(id);
}

/// <summary>Dodaje POST, PUT i DELETE.</summary>
public abstract class BaseCRUDController<TModel, TSearch, TInsert, TUpdate> : BaseController<TModel, TSearch>
    where TSearch : BaseSearchObject
{
    private readonly ICRUDService<TModel, TSearch, TInsert, TUpdate> _crudService;

    protected BaseCRUDController(ICRUDService<TModel, TSearch, TInsert, TUpdate> service) : base(service)
    {
        _crudService = service;
    }

    [HttpPost]
    public virtual Task<TModel> Insert([FromBody] TInsert request) => _crudService.InsertAsync(request);

    [HttpPut("{id:int}")]
    public virtual Task<TModel> Update(int id, [FromBody] TUpdate request) => _crudService.UpdateAsync(id, request);

    [HttpDelete("{id:int}")]
    public virtual async Task<IActionResult> Delete(int id)
    {
        await _crudService.DeleteAsync(id);
        return NoContent();
    }
}
