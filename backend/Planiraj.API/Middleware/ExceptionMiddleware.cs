using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Exceptions;

namespace Planiraj.API.Middleware;

/// <summary>Pretvara izuzetke iz servisa u HTTP odgovore: { status, message }.</summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleAsync(context, ex);
        }
    }

    private async Task HandleAsync(HttpContext context, Exception exception)
    {
        var (status, message) = exception switch
        {
            UserException => (StatusCodes.Status400BadRequest, exception.Message),
            NotFoundException => (StatusCodes.Status404NotFound, exception.Message),
            ForbiddenException => (StatusCodes.Status403Forbidden, exception.Message),
            ConflictException => (StatusCodes.Status409Conflict, exception.Message),
            DbUpdateException => (StatusCodes.Status409Conflict,
                "Operacija nije moguća: zapis je povezan sa drugim podacima ili već postoji."),
            _ => (StatusCodes.Status500InternalServerError, "Došlo je do greške na serveru.")
        };

        if (status == StatusCodes.Status500InternalServerError)
            _logger.LogError(exception, "Neobrađena greška");
        else if (exception is DbUpdateException)
            _logger.LogWarning(exception, "Greška pri upisu u bazu");

        if (context.Response.HasStarted)
            return;

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { status, message });
    }
}
