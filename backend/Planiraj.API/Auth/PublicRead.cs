using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Planiraj.API.Auth;

/// <summary>
/// Kontroler čija su čitanja (GET lista i GET po Id-u iz BaseController-a) javna: gost vidi ponudu bez prijave.
/// Izmjene i dalje traže prijavu, a servisi gostu daju samo javne podatke (aktivni ponuđači, odobrene recenzije).
/// </summary>
[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class PublicReadAttribute : Attribute
{
}

/// <summary>Akcijama Get i GetById u kontrolerima sa [PublicRead] dodaje AllowAnonymous.</summary>
public sealed class PublicReadConvention : IApplicationModelConvention
{
    private static readonly string[] ReadActions = { "Get", "GetById" };

    public void Apply(ApplicationModel application)
    {
        foreach (var controller in application.Controllers)
        {
            if (!controller.ControllerType.IsDefined(typeof(PublicReadAttribute), false)) continue;
            foreach (var action in controller.Actions.Where(a => ReadActions.Contains(a.ActionMethod.Name)))
            {
                foreach (var selector in action.Selectors)
                    selector.EndpointMetadata.Add(new AllowAnonymousAttribute());
            }
        }
    }
}
