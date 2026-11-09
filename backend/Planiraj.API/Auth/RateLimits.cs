using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Planiraj.API.Auth;

/// <summary>Podešavanja ograničenja broja zahtjeva (sekcija "RateLimit" u appsettings).</summary>
public class RateLimitSettings
{
    public bool Enabled { get; set; } = true;
    /// <summary>Zahtjeva u minuti po korisniku (prijavljen) ili po IP adresi (gost).</summary>
    public int PermitPerMinute { get; set; } = 120;
    /// <summary>Pokušaja prijave i registracije u minuti po IP adresi.</summary>
    public int AuthPermitPerMinute { get; set; } = 10;
    /// <summary>
    /// True samo kad API stoji iza proxyja (nginx, Cloudflare...) koji postavlja X-Forwarded-For,
    /// a API nije direktno dostupan sa interneta. Inače bi svako mogao lažirati svoju IP adresu.
    /// </summary>
    public bool TrustForwardedHeaders { get; set; }
}

/// <summary>
/// Ograničenje broja zahtjeva: štiti javne endpointe od masovnog kopiranja i preopterećenja,
/// a prijavu od pogađanja lozinki. Prekoračenje vraća 429 i zaglavlje Retry-After.
/// </summary>
public static class RateLimits
{
    public const string Auth = "auth";

    public static IServiceCollection AddPlanirajRateLimits(this IServiceCollection services, RateLimitSettings settings)
    {
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, token) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retry.TotalSeconds)).ToString();
                await ctx.HttpContext.Response.WriteAsJsonAsync(
                    new { status = 429, message = "Previše zahtjeva u kratkom vremenu. Pokušajte ponovo za minut." }, token);
            };

            if (!settings.Enabled)
            {
                o.AddPolicy(Auth, _ => RateLimitPartition.GetNoLimiter("off"));
                return;
            }

            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
            {
                var sub = http.User.FindFirst(AppClaims.UserId)?.Value;
                var key = sub != null ? "u:" + sub : "ip:" + ClientIp(http);
                return RateLimitPartition.GetFixedWindowLimiter(key, _ => Window(settings.PermitPerMinute));
            });

            o.AddPolicy(Auth, http => RateLimitPartition.GetFixedWindowLimiter("auth:" + ClientIp(http), _ => Window(settings.AuthPermitPerMinute)));
        });

        if (settings.TrustForwardedHeaders)
        {
            services.Configure<ForwardedHeadersOptions>(o =>
            {
                o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                o.KnownIPNetworks.Clear();
                o.KnownProxies.Clear();
            });
        }

        return services;
    }

    private static FixedWindowRateLimiterOptions Window(int permit) => new()
    {
        PermitLimit = Math.Max(1, permit),
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
        AutoReplenishment = true
    };

    private static string ClientIp(HttpContext http) => (http.Connection.RemoteIpAddress ?? IPAddress.None).ToString();
}
