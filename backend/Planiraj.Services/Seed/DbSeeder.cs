using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Enums;
using Planiraj.Services.Database;
using Planiraj.Services.Helpers;
using Planiraj.Services.Security;

namespace Planiraj.Services.Seed;

/// <summary>
/// Početni podaci za razvoj: 10 gradova, 7 kategorija, 2 plana pretplate, 3 korisnika
/// (admin, vlasnik salona, mladenci) i po 5 usluga u svakoj kategoriji (35 usluga, 34 ponuđača,
/// jer "Studio ljepote Amra" nudi i frizure i šminku).
/// Pokreće se samo nad praznom bazom (kad nema nijednog korisnika).
/// </summary>
public static class DbSeeder
{
    public const string AdminPassword = "Admin123!";
    public const string VendorPassword = "Salon123!";
    public const string CouplePassword = "Mladenci123!";

    private const string DemoVendorName = "Studio ljepote Amra";

    private record CitySeed(string Name, double Latitude, double Longitude, string Street);

    private record CategorySeed(string Slug, string Name, string Description, int SortOrder);

    private record VendorSeed(
        string Name,
        string City,
        string CategorySlug,
        string Description,
        string OfferTitle,
        string OfferDescription,
        decimal PriceFrom,
        decimal PriceTo,
        bool BookingEnabled = false,
        bool AutoConfirm = false,
        bool RequiresDeposit = false,
        string? DepositNote = null);

    private static readonly CitySeed[] Cities =
    [
        new("Sarajevo", 43.8563, 18.4131, "Zmaja od Bosne"),
        new("Mostar", 43.3438, 17.8078, "Kralja Tvrtka"),
        new("Banja Luka", 44.7722, 17.1910, "Kralja Petra I Karađorđevića"),
        new("Tuzla", 44.5384, 18.6763, "Maršala Tita"),
        new("Zenica", 44.2034, 17.9077, "Masarykova"),
        new("Bihać", 44.8169, 15.8708, "Bosanska"),
        new("Travnik", 44.2264, 17.6658, "Bosanska"),
        new("Brčko", 44.8726, 18.8098, "Bulevar mira"),
        new("Konjic", 43.6519, 17.9617, "Maršala Tita"),
        new("Trebinje", 42.7110, 18.3434, "Njegoševa")
    ];

    private static readonly CategorySeed[] Categories =
    [
        new("vjencanice-i-odijela", "Vjenčanice i odijela", "Saloni vjenčanica i svečanih muških odijela: najam, prodaja i šivenje po mjeri.", 1),
        new("saloni-za-vjencanje", "Saloni za vjenčanje", "Sale, restorani i prostori za svadbeno slavlje.", 2),
        new("dekoracije", "Dekoracije", "Cvjetni aranžmani, dekoracija sale, stolova i ceremonije.", 3),
        new("fotografi", "Fotografi", "Fotografisanje i snimanje vjenčanja, foto knjige i video.", 4),
        new("svecani-automobili", "Rent svečanih automobila", "Najam oldtimera, limuzina i luksuznih automobila za mladence.", 5),
        new("frizeri", "Frizeri", "Frizure za mladu, mladoženju i svatove.", 6),
        new("beauty-makeup", "Beauty i make-up saloni", "Šminka za mladu, manikir i tretmani ljepote pred vjenčanje.", 7)
    ];

    private static readonly VendorSeed[] Vendors =
    [
        // ---- Vjenčanice i odijela ----
        new("Bijeli San Vjenčanice", "Sarajevo", "vjencanice-i-odijela",
            "Salon vjenčanica sa kolekcijama domaćih i stranih dizajnera. Nudimo najam i prodaju, uz besplatnu prilagodbu.",
            "Vjenčanice: najam i prodaja", "Najam uključuje prilagodbu i hemijsko čišćenje. Proba uz prethodno zakazan termin.",
            900, 4500, BookingEnabled: true, RequiresDeposit: true, DepositNote: "Avans 20% pri rezervaciji vjenčanice."),
        new("Gospodin Elegance", "Sarajevo", "vjencanice-i-odijela",
            "Svečana muška odijela, smokinzi i dodaci za mladoženju i kumove.",
            "Odijela za mladoženju", "Odijela po mjeri ili iz kolekcije, uz košulju, kravatu ili leptir mašnu.",
            450, 1800, BookingEnabled: true, AutoConfirm: true),
        new("Atelier Mostarska Ruža", "Mostar", "vjencanice-i-odijela",
            "Atelje koji šije vjenčanice po mjeri, od skice do posljednje probe.",
            "Vjenčanice po mjeri", "Izrada traje 8 do 12 sedmica. Uključene tri probe.",
            1100, 5000),
        new("Vjenčanice Krajina", "Banja Luka", "vjencanice-i-odijela",
            "Veliki izbor vjenčanica u svim stilovima i veličinama.",
            "Vjenčanice iz kolekcije", "Najam ili kupovina, uz veo i dodatke po izboru.",
            800, 3500),
        new("Salon Svečana Linija", "Tuzla", "vjencanice-i-odijela",
            "Vjenčanice i odijela na jednom mjestu, za mladence koji žele usklađen izgled.",
            "Vjenčanice i odijela", "Paket za mladence uz popust pri istovremenom najmu.",
            600, 3200),

        // ---- Saloni za vjenčanje ----
        new("Sala Panorama", "Sarajevo", "saloni-za-vjencanje",
            "Sala sa pogledom na grad, kapaciteta do 400 gostiju, sa vlastitom kuhinjom i parkingom.",
            "Svadbeno slavlje do 400 gostiju", "Cijena zavisi od broja gostiju i menija (od 45 KM po osobi). Dekoracija stolova uključena.",
            6000, 24000, BookingEnabled: true, RequiresDeposit: true, DepositNote: "Avans 1.000 KM za rezervaciju datuma."),
        new("Svečana sala Neretva", "Mostar", "saloni-za-vjencanje",
            "Svečana sala uz rijeku, za do 300 gostiju, sa terasom za ceremoniju.",
            "Svadba do 300 gostiju", "Meni po izboru, muzika i ozvučenje po dogovoru.",
            4500, 18000, BookingEnabled: true, RequiresDeposit: true, DepositNote: "Avans 500 KM."),
        new("Event centar Vrbas", "Banja Luka", "saloni-za-vjencanje",
            "Moderan event centar sa dvije sale koje se mogu spojiti.",
            "Najam sale sa menijem", "Dvije sale (150 i 250 gostiju), mogućnost spajanja.",
            5000, 20000),
        new("Sala Kristal", "Tuzla", "saloni-za-vjencanje",
            "Klasična svadbena sala sa kristalnim lusterima i plesnim podijem.",
            "Svadbeni paket", "Paket uključuje meni, tortu i osnovnu dekoraciju.",
            3500, 15000),
        new("Vila Lašva Garden", "Travnik", "saloni-za-vjencanje",
            "Vjenčanja na otvorenom u vrtu vile, uz natkrivenu salu za loše vrijeme.",
            "Vjenčanje u vrtu", "Do 200 gostiju u vrtu, ceremonija i slavlje na istom mjestu.",
            3000, 12000),

        // ---- Dekoracije ----
        new("Cvjetni Kutak Dekor", "Sarajevo", "dekoracije",
            "Cvjećara i studio za dekoraciju vjenčanja: bidermajeri, aranžmani i dekoracija sale.",
            "Kompletna dekoracija vjenčanja", "Bidermajer, rever cvjetovi, aranžmani za stolove i ulaz.",
            600, 3500),
        new("Dekor Studio Bajka", "Zenica", "dekoracije",
            "Tematske dekoracije za vjenčanja, od rustičnog do glamuroznog stila.",
            "Dekoracija sale", "Stolnjaci, prekrivači za stolice, centralni aranžmani i rasvjeta.",
            400, 2500),
        new("Ruža i Svila", "Mostar", "dekoracije",
            "Dekoracija od svježeg i svilenog cvijeća, po mjeri vašeg vjenčanja.",
            "Cvjetni aranžmani", "Aranžmani za ceremoniju, sto mladenaca i automobil.",
            500, 3000),
        new("Balon i Cvijet", "Tuzla", "dekoracije",
            "Dekoracije balonima i cvijećem po pristupačnim cijenama.",
            "Dekoracija balonima i cvijećem", "Lukovi od balona, foto zid i dekoracija stolova.",
            300, 2000),
        new("Una Dekor", "Bihać", "dekoracije",
            "Dekoracija vjenčanja na otvorenom i u salama širom Unsko-sanskog kantona.",
            "Dekoracija ceremonije", "Luk za ceremoniju, staza i dekoracija stolica.",
            350, 2200),

        // ---- Fotografi ----
        new("Foto Trenutak", "Sarajevo", "fotografi",
            "Fotografi vjenčanja sa desetogodišnjim iskustvom, reportažni stil.",
            "Fotografisanje vjenčanja", "Cijeli dan fotografisanja, obrađene fotografije i foto knjiga.",
            900, 2800, BookingEnabled: true, AutoConfirm: true, RequiresDeposit: true, DepositNote: "Avans 300 KM za rezervaciju datuma."),
        new("Objektiv Studio", "Banja Luka", "fotografi",
            "Foto i video studio za vjenčanja, uključujući snimanje dronom.",
            "Foto i video paket", "Fotografije, kratki film i snimci dronom.",
            800, 2500, BookingEnabled: true),
        new("Kadar po Kadar", "Mostar", "fotografi",
            "Fotografisanje vjenčanja i pre-wedding sesije u Hercegovini.",
            "Foto paket za vjenčanje", "Pre-wedding sesija i fotografisanje na dan vjenčanja.",
            700, 2200),
        new("Svjetlo i Sjena Foto", "Zenica", "fotografi",
            "Umjetnički pristup fotografiji vjenčanja.",
            "Fotografisanje vjenčanja", "Do 10 sati fotografisanja i online galerija.",
            600, 1800),
        new("Foto Studio Una", "Bihać", "fotografi",
            "Fotografi vjenčanja i proslava.",
            "Osnovni foto paket", "Fotografisanje ceremonije i slavlja, 300+ obrađenih fotografija.",
            500, 1600),

        // ---- Rent svečanih automobila ----
        new("Oldtimer Klasik", "Sarajevo", "svecani-automobili",
            "Najam restauriranih oldtimera za vjenčanja, sa vozačem.",
            "Najam oldtimera sa vozačem", "Do 6 sati najma, dekoracija automobila uključena.",
            200, 700, BookingEnabled: true, AutoConfirm: true),
        new("Elegant Drive", "Mostar", "svecani-automobili",
            "Luksuzni automobili za mladence i svatove.",
            "Najam luksuznog automobila", "Mercedes, BMW i Audi limuzine, sa vozačem.",
            150, 500),
        new("Royal Cars", "Banja Luka", "svecani-automobili",
            "Limuzine i kabrioleti za posebne prilike.",
            "Limuzina za vjenčanje", "Bijela limuzina sa šampanjcem i dekoracijom.",
            250, 800),
        new("Svadbeni Oldtimeri Tuzla", "Tuzla", "svecani-automobili",
            "Kolekcija oldtimera iz 50-ih i 60-ih godina.",
            "Oldtimer za mladence", "Najam za fotografisanje i dolazak na ceremoniju.",
            180, 600),
        new("Limuzine Brčko", "Brčko", "svecani-automobili",
            "Najam limuzina za vjenčanja u Brčkom i okolini.",
            "Najam limuzine", "Limuzina sa vozačem, do 5 sati.",
            200, 650),

        // ---- Frizeri ----
        new(DemoVendorName, "Sarajevo", "frizeri",
            "Salon ljepote koji uređuje mladu na jednom mjestu: frizura, šminka i probni termin.",
            "Frizura za mladu", "Probna frizura i frizura na dan vjenčanja. Moguć dolazak na adresu.",
            80, 350, BookingEnabled: true, RequiresDeposit: true, DepositNote: "Avans 50 KM pri potvrdi termina."),
        new("Frizerski salon Lana", "Mostar", "frizeri",
            "Ženski frizerski salon specijalizovan za svečane frizure.",
            "Svečane frizure", "Frizure za mladu, kumu i svatove.",
            60, 250),
        new("Hair Studio Bella", "Tuzla", "frizeri",
            "Moderni frizerski studio sa timom od pet frizera.",
            "Frizura za mladu i svatove", "Grupni termini za mladu i djeveruše.",
            70, 280),
        new("Frizerski studio Mia", "Zenica", "frizeri",
            "Frizure za vjenčanja, maturske i svečane prilike.",
            "Frizura za vjenčanje", "Uključuje pranje, njegu i stilizovanje.",
            50, 220),
        new("Salon Kosa i Stil", "Trebinje", "frizeri",
            "Frizerski salon za žene i muškarce.",
            "Frizure za mladence", "Frizura za mladu i šišanje za mladoženju.",
            60, 240),

        // ---- Beauty i make-up ----
        new(DemoVendorName, "Sarajevo", "beauty-makeup",
            "Salon ljepote koji uređuje mladu na jednom mjestu: frizura, šminka i probni termin.",
            "Šminka za mladu", "Probna šminka i šminka na dan vjenčanja, dugotrajni proizvodi.",
            100, 400, BookingEnabled: true, RequiresDeposit: true, DepositNote: "Avans 50 KM pri potvrdi termina."),
        new("Glow Makeup Studio", "Banja Luka", "beauty-makeup",
            "Make-up studio za mlade i svatove.",
            "Bridal make-up", "Šminka za mladu i do tri osobe iz pratnje.",
            90, 350),
        new("Beauty Lounge Ena", "Mostar", "beauty-makeup",
            "Kozmetički salon: šminka, manikir, pedikir i tretmani lica.",
            "Paket ljepote za mladu", "Tretman lica, manikir i šminka.",
            80, 320),
        new("Make-up by Selma", "Tuzla", "beauty-makeup",
            "Profesionalna make-up umjetnica sa dolaskom na adresu.",
            "Šminka za vjenčanje", "Dolazak na adresu u Tuzli i okolini.",
            70, 300),
        new("Salon ljepote Iris", "Bihać", "beauty-makeup",
            "Salon ljepote sa kompletnom ponudom za mladu.",
            "Šminka i manikir za mladu", "Šminka, gel lak i trepavice.",
            60, 260)
    ];

    public static async Task SeedAsync(PlanirajDbContext db)
    {
        if (await db.Users.AnyAsync())
            return;

        var now = DateTime.UtcNow;

        // ---------- Šifarnici ----------
        var cities = Cities.ToDictionary(c => c.Name, c => new City { Name = c.Name, Latitude = c.Latitude, Longitude = c.Longitude });
        db.Cities.AddRange(cities.Values);

        var categories = Categories.ToDictionary(c => c.Slug, c => new ServiceCategory
        {
            Name = c.Name,
            Slug = c.Slug,
            Description = c.Description,
            SortOrder = c.SortOrder,
            IsActive = true
        });
        db.ServiceCategories.AddRange(categories.Values);

        var standardPlan = new SubscriptionPlan
        {
            Name = "Standard",
            Description = "Oznaka \"istaknuto\" i viša pozicija u pretrazi.",
            Price = 49,
            DurationDays = 30,
            PriorityWeight = 1,
            IsActive = true
        };
        var premiumPlan = new SubscriptionPlan
        {
            Name = "Premium",
            Description = "Najviša pozicija u pretrazi i prioritet u AI preporukama.",
            Price = 99,
            DurationDays = 30,
            PriorityWeight = 2,
            IsActive = true
        };
        db.SubscriptionPlans.AddRange(standardPlan, premiumPlan);

        // ---------- Korisnici ----------
        var admin = CreateUser("Admin", "Planiraj", "admin@planiraj.ba", "admin", AdminPassword,
            UserRole.Admin, cities["Sarajevo"], "+387 61 000 001", now);
        var vendorOwner = CreateUser("Amra", "Hodžić", "salon@planiraj.ba", "salon", VendorPassword,
            UserRole.Vendor, cities["Sarajevo"], "+387 61 222 333", now);
        var couple = CreateUser("Lejla", "Begić", "mladenci@planiraj.ba", "mladenci", CouplePassword,
            UserRole.Couple, cities["Sarajevo"], "+387 62 444 555", now);
        db.Users.AddRange(admin, vendorOwner, couple);

        // ---------- Ponuđači i usluge ----------
        var vendors = new Dictionary<string, Vendor>();
        var index = 0;

        foreach (var seed in Vendors)
        {
            if (!vendors.TryGetValue(seed.Name, out var vendor))
            {
                index++;
                var city = Cities.First(c => c.Name == seed.City);
                var slug = SlugHelper.Generate(seed.Name);

                vendor = new Vendor
                {
                    Name = seed.Name,
                    Slug = slug,
                    Description = seed.Description,
                    City = cities[seed.City],
                    Address = $"{city.Street} {10 + index}",
                    Latitude = Math.Round(city.Latitude + (index % 5) * 0.003, 6),
                    Longitude = Math.Round(city.Longitude + (index % 7) * 0.003, 6),
                    PhoneNumber = $"+387 6{index % 3 + 1} {100 + index * 17 % 800} {200 + index * 29 % 700}",
                    Email = $"info@{slug}.ba",
                    Website = $"https://www.{slug}.ba",
                    InstagramUrl = $"https://instagram.com/{slug.Replace("-", ".")}",
                    FacebookUrl = $"https://facebook.com/{slug}",
                    BookingEnabled = seed.BookingEnabled,
                    AutoConfirmBookings = seed.AutoConfirm,
                    RequiresDeposit = seed.RequiresDeposit,
                    DepositNote = seed.DepositNote,
                    IsActive = true,
                    CreatedAt = now.AddDays(-60 + index),
                    WorkingHours = CreateWorkingHours(seed.CategorySlug == "saloni-za-vjencanje"),
                    Images = new List<VendorImage>
                    {
                        new() { Url = $"https://picsum.photos/seed/{slug}-1/1200/800", Caption = seed.Name, SortOrder = 1, IsCover = true },
                        new() { Url = $"https://picsum.photos/seed/{slug}-2/1200/800", SortOrder = 2 },
                        new() { Url = $"https://picsum.photos/seed/{slug}-3/1200/800", SortOrder = 3 }
                    }
                };
                vendors[seed.Name] = vendor;
            }

            vendor.Offerings.Add(new VendorOffering
            {
                ServiceCategory = categories[seed.CategorySlug],
                Title = seed.OfferTitle,
                Description = seed.OfferDescription,
                PriceFrom = seed.PriceFrom,
                PriceTo = seed.PriceTo,
                Currency = "KM",
                IsActive = true,
                CreatedAt = vendor.CreatedAt
            });
        }

        // Vlasnik demo salona (jedan nalog, dvije kategorije usluga).
        var demoVendor = vendors[DemoVendorName];
        demoVendor.Owner = vendorOwner;

        // Primjeri istaknutih ponuđača (pretplata).
        vendors["Sala Panorama"].SubscriptionPlan = premiumPlan;
        vendors["Sala Panorama"].SubscriptionExpiresAt = now.AddDays(30);
        vendors["Foto Trenutak"].SubscriptionPlan = standardPlan;
        vendors["Foto Trenutak"].SubscriptionExpiresAt = now.AddDays(15);

        db.Vendors.AddRange(vendors.Values);
        await db.SaveChangesAsync();

        // ---------- Recenzije ----------
        db.Reviews.AddRange(
            CreateReview(vendors["Sala Panorama"], couple, 5,
                "Prelijepa sala, ljubazno osoblje i odlična hrana. Gosti su oduševljeni.",
                ReviewStatus.Approved, admin, now.AddDays(-20)),
            CreateReview(vendors["Foto Trenutak"], couple, 5,
                "Fotografije su nevjerovatne, a ekipa nenametljiva tokom cijelog dana.",
                ReviewStatus.Approved, admin, now.AddDays(-18)),
            CreateReview(demoVendor, couple, 4,
                "Frizura i šminka su trajale cijelu noć. Jedina zamjerka je kratko kašnjenje.",
                ReviewStatus.Approved, admin, now.AddDays(-15)),
            CreateReview(vendors["Cvjetni Kutak Dekor"], couple, 4,
                "Dekoracija je bila baš onakva kakvu smo zamislili.",
                ReviewStatus.Pending, null, now.AddDays(-2)));

        // ---------- Rezervacije ----------
        var weddingDate = new DateOnly(now.Year + 1, 6, 12);
        db.Bookings.AddRange(
            new Booking
            {
                Vendor = demoVendor,
                Offering = demoVendor.Offerings.First(o => o.ServiceCategory.Slug == "frizeri"),
                User = couple,
                EventDate = weddingDate,
                StartTime = new TimeOnly(9, 0),
                Note = "Frizura za mladu i dvije djeveruše. Probni termin mjesec dana ranije.",
                Status = BookingStatus.Pending,
                CreatedAt = now.AddDays(-3)
            },
            new Booking
            {
                Vendor = vendors["Foto Trenutak"],
                Offering = vendors["Foto Trenutak"].Offerings.First(),
                User = couple,
                EventDate = weddingDate,
                StartTime = new TimeOnly(10, 0),
                Note = "Fotografisanje od pripreme mlade do kraja slavlja.",
                Status = BookingStatus.Confirmed,
                CreatedAt = now.AddDays(-10)
            },
            new Booking
            {
                Vendor = vendors["Sala Panorama"],
                Offering = vendors["Sala Panorama"].Offerings.First(),
                User = couple,
                EventDate = weddingDate,
                StartTime = new TimeOnly(18, 0),
                Note = "Okvirno 250 gostiju.",
                Status = BookingStatus.Pending,
                CreatedAt = now.AddDays(-5)
            });

        await db.SaveChangesAsync();
    }

    private static User CreateUser(string firstName, string lastName, string email, string username, string password,
        UserRole role, City city, string phone, DateTime now)
    {
        var user = new User
        {
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            Username = username,
            PhoneNumber = phone,
            Role = role,
            City = city,
            IsActive = true,
            MustChangePassword = false,
            CreatedAt = now
        };
        PasswordHasher.SetPassword(user, password);
        return user;
    }

    private static Review CreateReview(Vendor vendor, User author, int rating, string comment,
        ReviewStatus status, User? moderator, DateTime createdAt) => new()
    {
        Vendor = vendor,
        User = author,
        Rating = rating,
        Comment = comment,
        Status = status,
        CreatedAt = createdAt,
        ModeratedBy = moderator,
        ModeratedAt = moderator != null ? createdAt.AddDays(1) : null
    };

    private static List<WorkingHour> CreateWorkingHours(bool isVenue)
    {
        var hours = new List<WorkingHour>();
        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            if (isVenue)
                hours.Add(new WorkingHour { DayOfWeek = day, OpenTime = new TimeOnly(10, 0), CloseTime = new TimeOnly(22, 0) });
            else if (day == DayOfWeek.Sunday)
                hours.Add(new WorkingHour { DayOfWeek = day, IsClosed = true });
            else if (day == DayOfWeek.Saturday)
                hours.Add(new WorkingHour { DayOfWeek = day, OpenTime = new TimeOnly(9, 0), CloseTime = new TimeOnly(15, 0) });
            else
                hours.Add(new WorkingHour { DayOfWeek = day, OpenTime = new TimeOnly(9, 0), CloseTime = new TimeOnly(19, 0) });
        }
        return hours;
    }
}
