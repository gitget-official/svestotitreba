using Planiraj.Services.Email;
using Planiraj.Services.Notifications;

namespace Planiraj.API.Email;

/// <summary>Pozadinsko slanje: svakih Email:PollSeconds obradi red (EmailOutboxProcessor).</summary>
public class EmailDispatcher(IServiceScopeFactory scopes, EmailSettings settings, ILogger<EmailDispatcher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Slanje e-mailova je uključeno ({Mode}).", settings.Mode);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Max(1, settings.PollSeconds)));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<EmailOutboxProcessor>().ProcessAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Greška pri obradi reda za e-mail.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

public static class EmailSetup
{
    /// <summary>
    /// Registruje e-mail. Zadano je isključen (Email:Mode = Disabled): ništa se ne upisuje i ne šalje.
    /// Neispravne postavke zaustavljaju pokretanje, umjesto da se tiho šalje pogrešno ili nikako.
    /// </summary>
    public static IServiceCollection AddPlanirajEmail(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var settings = configuration.GetSection(EmailSettings.SectionName).Get<EmailSettings>() ?? new EmailSettings();
        settings.SiteUrl = ResolveSiteUrl(settings.SiteUrl, configuration);
        Validate(settings, environment.IsProduction());

        services.AddSingleton(settings);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<EmailRecipientPolicy>();
        services.AddScoped<IEmailOutbox, EmailOutbox>();
        services.AddScoped<IBookingNotifier, BookingNotifier>();
        services.AddScoped<EmailOutboxProcessor>();

        if (settings.Mode == EmailMode.Smtp)
            services.AddSingleton<IEmailSender, SmtpEmailSender>();
        else
            services.AddSingleton<IEmailSender, LogEmailSender>();

        if (settings.Mode != EmailMode.Disabled && settings.DispatcherEnabled)
            services.AddHostedService<EmailDispatcher>();

        return services;
    }

    /// <summary>Email:SiteUrl, pa Seo:SiteUrl, pa prvi Cors:Origins (kao za sitemap).</summary>
    private static string? ResolveSiteUrl(string? value, IConfiguration configuration)
    {
        var url = value;
        if (string.IsNullOrWhiteSpace(url)) url = configuration["Seo:SiteUrl"];
        if (string.IsNullOrWhiteSpace(url)) url = configuration.GetSection("Cors:Origins").Get<string[]>()?.FirstOrDefault();
        return string.IsNullOrWhiteSpace(url) ? null : url.TrimEnd('/');
    }

    public static void Validate(EmailSettings settings, bool isProduction)
    {
        if (settings.Mode != EmailMode.Smtp)
            return;

        if (!EmailRecipientPolicy.IsValid(settings.FromAddress.Trim().ToLowerInvariant()))
            throw new InvalidOperationException("Email:FromAddress mora biti ispravna adresa kad je Email:Mode = Smtp.");
        if (string.IsNullOrWhiteSpace(settings.Smtp.Host))
            throw new InvalidOperationException("Email:Smtp:Host nije postavljen.");
        if (!string.IsNullOrWhiteSpace(settings.RedirectAllTo)
            && !EmailRecipientPolicy.IsValid(settings.RedirectAllTo.Trim().ToLowerInvariant()))
            throw new InvalidOperationException("Email:RedirectAllTo nije ispravna adresa.");

        // Van produkcije pravo slanje mora biti ograničeno, da nijedna poruka ne ode stvarnom korisniku
        // (npr. lokalna kopija produkcijske baze).
        if (!isProduction
            && string.IsNullOrWhiteSpace(settings.RedirectAllTo)
            && !settings.AllowedRecipients.Any(a => !string.IsNullOrWhiteSpace(a)))
            throw new InvalidOperationException(
                "Van produkcije Email:Mode = Smtp traži Email:RedirectAllTo ili Email:AllowedRecipients, " +
                "da poruke ne odu stvarnim korisnicima.");
    }
}
