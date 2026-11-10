using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Enums;
using Planiraj.Services.Database;
using Planiraj.Services.Email;
using Planiraj.Services.Security;

namespace Planiraj.Services.Notifications;

/// <summary>Događaji rezervacije o kojima se šalje e-mail (FR-15).</summary>
public enum BookingEmailEvent
{
    Created,
    Updated,
    Confirmed,
    Rejected,
    Cancelled,
    /// <summary>Mladenci su obrisali profil, pa su im buduće rezervacije otkazane.</summary>
    CancelledAccountDeleted
}

public interface IBookingNotifier
{
    /// <summary>
    /// Dodaje e-mailove za događaj u red (bez SaveChanges; snimaju se zajedno sa promjenom rezervacije).
    /// Pravilo: obavještavaju se mladenci i vlasnik salona, osim onoga ko je sam napravio promjenu.
    /// </summary>
    Task QueueAsync(int bookingId, BookingEmailEvent bookingEvent);
}

/// <summary>
/// E-mailovi o rezervacijama. Salonu se piše samo na e-mail korisničkog naloga vlasnika (Owner), nikad na javni
/// kontakt e-mail sa stranice (Vendor.Email): taj je unesen ručno i može biti tuđi ili izmišljen. Ponuđač bez
/// vlasnika ne dobija ništa. Obrisani i isključeni nalozi ne dobijaju ništa.
/// </summary>
public class BookingNotifier(
    PlanirajDbContext context,
    IEmailOutbox outbox,
    EmailSettings settings,
    ICurrentUserService currentUser,
    TimeProvider time) : IBookingNotifier
{
    private static readonly string[] Days = ["nedjelja", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"];

    public async Task QueueAsync(int bookingId, BookingEmailEvent bookingEvent)
    {
        if (settings.Mode == EmailMode.Disabled)
            return;

        // Upit sa praćenjem: ako je rezervacija već učitana i izmijenjena (npr. novi status), dobija se ta ista instanca.
        var booking = await context.Bookings
            .Include(b => b.User)
            .Include(b => b.Offering)
            .Include(b => b.Vendor).ThenInclude(v => v.Owner)
            .Include(b => b.Vendor).ThenInclude(v => v.City)
            .FirstOrDefaultAsync(b => b.Id == bookingId);
        if (booking == null)
            return;

        var actorId = currentUser.UserId;
        var couple = CanReceive(booking.User) && booking.User.Id != actorId ? booking.User : null;
        var owner = booking.Vendor.Owner is { } o && CanReceive(o) && o.Id != actorId ? o : null;
        var actorIsCouple = actorId == booking.UserId;

        switch (bookingEvent)
        {
            case BookingEmailEvent.Created:
                // Mladenci su sami poslali zahtjev, ali im potvrda prijema ili potvrđen termin svejedno treba.
                if (owner != null) QueueVendor(booking, owner, booking.Status == BookingStatus.Confirmed ? VendorNewConfirmed : VendorNewRequest);
                if (CanReceive(booking.User))
                {
                    if (booking.Status == BookingStatus.Confirmed) QueueCoupleConfirmed(booking, booking.User);
                    else QueueCouple(booking, booking.User, CoupleRequestSent);
                }
                break;

            case BookingEmailEvent.Updated:
                if (owner != null) QueueVendor(booking, owner, VendorUpdated);
                if (couple != null) QueueCouple(booking, couple, CoupleUpdated);
                break;

            case BookingEmailEvent.Confirmed:
                if (couple != null) QueueCoupleConfirmed(booking, couple);
                if (owner != null) QueueVendor(booking, owner, VendorConfirmedByAdmin);
                break;

            case BookingEmailEvent.Rejected:
                if (couple != null) QueueCouple(booking, couple, CoupleRejected);
                if (owner != null) QueueVendor(booking, owner, VendorRejectedByAdmin);
                break;

            case BookingEmailEvent.Cancelled:
                if (couple != null) QueueCouple(booking, couple, CoupleCancelled);
                if (owner != null) QueueVendor(booking, owner, actorIsCouple ? VendorCancelledByCouple : VendorCancelledByAdmin);
                break;

            case BookingEmailEvent.CancelledAccountDeleted:
                if (booking.Vendor.Owner is { } vendorOwner && CanReceive(vendorOwner))
                    QueueVendor(booking, vendorOwner, VendorCancelledAccountDeleted);
                break;
        }
    }

    private static bool CanReceive(User user) => user.IsActive && user.DeletedAt == null;

    // ---------------- Salon ----------------

    private delegate void VendorTemplate(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple);

    private void QueueVendor(Booking booking, User owner, VendorTemplate template)
    {
        var b = NewBuilder();
        template(b, booking, out var type, out var subject, out var includeCouple);

        var rows = new List<(string, string?)>
        {
            ("Salon", booking.Vendor.Name),
            ("Usluga", booking.Offering?.Title),
            ("Datum", FormatDate(booking.EventDate)),
            ("Vrijeme", FormatTime(booking.StartTime)),
        };
        if (includeCouple)
        {
            rows.Add(("Mladenci", FullName(booking.User)));
            rows.Add(("E-mail", booking.User.Email));
            rows.Add(("Telefon", booking.User.PhoneNumber));
        }
        b.Details(rows.ToArray());
        if (includeCouple) b.Quote("Napomena mladenaca", booking.Note);
        b.Button("Otvorite rezervacije", "/salon/rezervacije")
         .Footer($"Ovu poruku ste dobili jer upravljate stranicom „{booking.Vendor.Name}“ na {settings.FromName} i primate rezervacije putem platforme.");

        // Odgovor na poruku ide direktno mladencima (salon ionako vidi njihov e-mail uz zahtjev).
        var replyTo = includeCouple && CanReceive(booking.User) ? booking.User.Email : null;
        outbox.Queue(type, new EmailRecipient(owner.Email, FullName(owner)), b.Build(subject), booking.Id, replyTo);
    }

    private void VendorNewRequest(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.created.vendor";
        subject = $"Novi zahtjev za termin: {ShortDate(booking.EventDate)}";
        includeCouple = true;
        b.Preheader($"Zahtjev za {ShortDate(booking.EventDate)} čeka vašu potvrdu.")
         .Heading("Novi zahtjev za termin")
         .Paragraph("Imate novi zahtjev za termin. Zahtjev čeka vašu potvrdu ili odbijanje.");
    }

    private void VendorNewConfirmed(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.created.vendor";
        subject = $"Nova rezervacija: {ShortDate(booking.EventDate)}";
        includeCouple = true;
        b.Preheader($"Nova rezervacija za {ShortDate(booking.EventDate)}.")
         .Heading("Nova rezervacija")
         .Paragraph("Imate novu rezervaciju. Automatski je potvrđena jer imate uključenu automatsku potvrdu.");
    }

    private void VendorUpdated(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.updated.vendor";
        subject = $"Zahtjev je izmijenjen: {ShortDate(booking.EventDate)}";
        includeCouple = true;
        b.Heading("Zahtjev za termin je izmijenjen")
         .Paragraph("Zahtjev koji čeka vašu potvrdu je izmijenjen. Ovo su novi podaci:");
    }

    private void VendorConfirmedByAdmin(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.confirmed.vendor";
        subject = $"Rezervacija je potvrđena: {ShortDate(booking.EventDate)}";
        includeCouple = true;
        b.Heading("Rezervacija je potvrđena")
         .Paragraph($"Administrator je potvrdio rezervaciju za mladence {FullName(booking.User)}.");
    }

    private void VendorRejectedByAdmin(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.rejected.vendor";
        subject = $"Zahtjev je odbijen: {ShortDate(booking.EventDate)}";
        includeCouple = false;
        b.Heading("Zahtjev za termin je odbijen")
         .Paragraph($"Administrator je odbio zahtjev za termin mladenaca {FullName(booking.User)}.");
    }

    private void VendorCancelledByCouple(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.cancelled.vendor";
        subject = $"Mladenci su otkazali termin: {ShortDate(booking.EventDate)}";
        includeCouple = false;
        b.Preheader($"Termin {ShortDate(booking.EventDate)} je ponovo slobodan.")
         .Heading("Termin je otkazan")
         .Paragraph($"Mladenci {FullName(booking.User)} su otkazali termin. Termin je ponovo slobodan.")
         .Quote("Poruka mladenaca", booking.StatusNote);
    }

    private void VendorCancelledByAdmin(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.cancelled.vendor";
        subject = $"Termin je otkazan: {ShortDate(booking.EventDate)}";
        includeCouple = false;
        b.Heading("Termin je otkazan")
         .Paragraph($"Administrator je otkazao termin mladenaca {FullName(booking.User)}.")
         .Quote("Napomena", booking.StatusNote);
    }

    private void VendorCancelledAccountDeleted(EmailBuilder b, Booking booking, out string type, out string subject, out bool includeCouple)
    {
        type = "booking.cancelled.vendor";
        subject = $"Termin je otkazan: {ShortDate(booking.EventDate)}";
        // Profil je obrisan: u poruci nema imena ni kontakta mladenaca.
        includeCouple = false;
        b.Heading("Termin je otkazan")
         .Paragraph($"Mladenci su obrisali svoj profil na {settings.FromName}, pa je njihov termin otkazan. Termin je ponovo slobodan.");
    }

    // ---------------- Mladenci ----------------

    private delegate void CoupleTemplate(EmailBuilder b, Booking booking, out string type, out string subject);

    private void QueueCouple(Booking booking, User couple, CoupleTemplate template, EmailAttachment? attachment = null)
    {
        var b = NewBuilder();
        template(b, booking, out var type, out var subject);
        outbox.Queue(type, new EmailRecipient(couple.Email, FullName(couple)), b.Build(subject, attachment), booking.Id);
    }

    private void QueueCoupleConfirmed(Booking booking, User couple)
    {
        var vendor = booking.Vendor;
        var location = string.Join(", ", new[] { vendor.Address, vendor.City?.Name }.Where(s => !string.IsNullOrWhiteSpace(s)));
        var host = HostOf(settings.SiteUrl) ?? "planiraj";
        var ics = IcsCalendar.Event(
            $"booking-{booking.Id}@{host}",
            booking.EventDate,
            booking.StartTime,
            booking.Offering != null ? $"{vendor.Name}: {booking.Offering.Title}" : vendor.Name,
            string.Join("\n", new[] { vendor.PhoneNumber != null ? "Telefon: " + vendor.PhoneNumber : null, booking.StartTime != null ? "Trajanje u kalendaru je okvirno." : null }
                .Where(s => s != null)),
            location,
            time.GetUtcNow().UtcDateTime);
        QueueCouple(booking, couple, CoupleConfirmed, new EmailAttachment("termin.ics", IcsCalendar.ContentType, ics));
    }

    private void CoupleDetails(EmailBuilder b, Booking booking, bool withDeposit)
    {
        var vendor = booking.Vendor;
        b.Details(
            ("Salon", vendor.Name),
            ("Usluga", booking.Offering?.Title),
            ("Datum", FormatDate(booking.EventDate)),
            ("Vrijeme", FormatTime(booking.StartTime)),
            ("Adresa", string.Join(", ", new[] { vendor.Address, vendor.City?.Name }.Where(s => !string.IsNullOrWhiteSpace(s)))),
            ("Telefon salona", vendor.PhoneNumber),
            ("Avans", withDeposit && vendor.RequiresDeposit ? vendor.DepositNote ?? "Salon traži avans; dogovorite detalje sa salonom." : null));
    }

    private const string CoupleFooter = "Ovu poruku ste dobili jer ste poslali zahtjev za termin putem platforme.";

    private void CoupleRequestSent(EmailBuilder b, Booking booking, out string type, out string subject)
    {
        type = "booking.created.couple";
        subject = $"Zahtjev je poslan: {booking.Vendor.Name}";
        b.Preheader("Javićemo vam čim salon odgovori.")
         .Heading("Zahtjev je poslan")
         .Paragraph($"Vaš zahtjev za termin kod salona „{booking.Vendor.Name}“ je poslan. Javićemo vam e-mailom čim ga salon potvrdi ili odbije.");
        CoupleDetails(b, booking, withDeposit: true);
        b.Quote("Vaša napomena", booking.Note)
         .Button("Moje rezervacije", "/moje-rezervacije")
         .Footer(CoupleFooter);
    }

    private void CoupleUpdated(EmailBuilder b, Booking booking, out string type, out string subject)
    {
        type = "booking.updated.couple";
        subject = $"Vaš zahtjev je izmijenjen: {booking.Vendor.Name}";
        b.Heading("Vaš zahtjev je izmijenjen")
         .Paragraph("Administrator je izmijenio vaš zahtjev za termin. Ovo su novi podaci:");
        CoupleDetails(b, booking, withDeposit: false);
        b.Button("Moje rezervacije", "/moje-rezervacije").Footer(CoupleFooter);
    }

    private void CoupleConfirmed(EmailBuilder b, Booking booking, out string type, out string subject)
    {
        type = "booking.confirmed.couple";
        subject = $"Termin je potvrđen: {booking.Vendor.Name}, {ShortDate(booking.EventDate)}";
        b.Preheader($"{booking.Vendor.Name} vas očekuje {ShortDate(booking.EventDate)}.")
         .Heading("Termin je potvrđen")
         .Paragraph($"Salon „{booking.Vendor.Name}“ je potvrdio vaš termin. U prilogu je događaj za vaš kalendar.");
        CoupleDetails(b, booking, withDeposit: true);
        b.Button("Moje rezervacije", "/moje-rezervacije").Footer(CoupleFooter);
    }

    private void CoupleRejected(EmailBuilder b, Booking booking, out string type, out string subject)
    {
        type = "booking.rejected.couple";
        subject = $"Zahtjev nije prihvaćen: {booking.Vendor.Name}";
        b.Heading("Zahtjev nije prihvaćen")
         .Paragraph($"Salon „{booking.Vendor.Name}“ nažalost ne može prihvatiti vaš zahtjev za {FormatDate(booking.EventDate)}.")
         .Quote("Poruka salona", booking.StatusNote)
         .Paragraph("Pogledajte druge ponuđače u istoj kategoriji ili pošaljite zahtjev za drugi datum.")
         .Button("Pogledajte ponudu", "/istrazi")
         .Footer(CoupleFooter);
    }

    private void CoupleCancelled(EmailBuilder b, Booking booking, out string type, out string subject)
    {
        type = "booking.cancelled.couple";
        subject = $"Termin je otkazan: {booking.Vendor.Name}, {ShortDate(booking.EventDate)}";
        b.Heading("Termin je otkazan")
         .Paragraph($"Vaš termin kod salona „{booking.Vendor.Name}“ za {FormatDate(booking.EventDate)} je otkazan.")
         .Quote("Poruka", booking.StatusNote);
        CoupleDetails(b, booking, withDeposit: false);
        b.Button("Moje rezervacije", "/moje-rezervacije").Footer(CoupleFooter);
    }

    // ---------------- Pomoćno ----------------

    private EmailBuilder NewBuilder() => new(settings.FromName, settings.SiteUrl);

    private static string FullName(User user) => $"{user.FirstName} {user.LastName}".Trim();

    internal static string FormatDate(DateOnly date) =>
        $"{Days[(int)date.DayOfWeek]}, {date.ToString("dd.MM.yyyy.", CultureInfo.InvariantCulture)}";

    private static string ShortDate(DateOnly date) => date.ToString("dd.MM.yyyy.", CultureInfo.InvariantCulture);

    private static string? FormatTime(TimeOnly? time) => time?.ToString("HH:mm", CultureInfo.InvariantCulture);

    private static string? HostOf(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : null;
}
