# Planiraj: backend (.NET 10 Web API)

Backend platforme za planiranje vjenčanja. Zahtjevi su u `../docs/zahtjevi-projekta.md`.

## Struktura

| Projekat | Sadržaj |
|---|---|
| `Planiraj.Model` | DTO-ovi, request modeli, search objekti, enumi, izuzeci (bez zavisnosti) |
| `Planiraj.Services` | EF Core entiteti i `PlanirajDbContext`, migracije, seeder, servisi (poslovna logika i pravila pristupa) |
| `Planiraj.API` | Kontroleri, JWT autentifikacija, middleware za greške, Swagger |

Generički `BaseService` / `BaseCRUDService` i `BaseController` / `BaseCRUDController` daju paginiranu listu sa filterima, GET po Id-u, POST, PUT i DELETE. Konkretni servisi pregaze samo filtere, include, sortiranje i pravila (ko smije šta).

## Pokretanje

Potrebno: **.NET 10 SDK** i **SQL Server** (Express, Developer ili LocalDB).

1. Po potrebi prilagodi connection string u `Planiraj.API/appsettings.json`:
   - SQL Server na računaru: `Server=localhost;...` (zadano)
   - SQL Express: `Server=localhost\\SQLEXPRESS;...`
   - LocalDB (dolazi sa Visual Studiom): `Server=(localdb)\\MSSQLLocalDB;...`
2. U folderu `backend` napravi početnu migraciju (samo prvi put):
   ```bash
   dotnet tool restore
   dotnet ef migrations add InitialCreate --project Planiraj.Services --startup-project Planiraj.API --output-dir Database/Migrations
   ```
3. Pokreni API:
   ```bash
   dotnet run --project Planiraj.API --launch-profile http
   ```
   Pri pokretanju se migracije primjenjuju automatski, a prazna baza se puni seed podacima.
4. Swagger: http://localhost:5080/swagger

Za ponovno punjenje baze od nule: `dotnet ef database drop --project Planiraj.Services --startup-project Planiraj.API`, pa ponovo pokreni API.

## Test nalozi (seed)

| Uloga | Korisničko ime | E-mail | Lozinka |
|---|---|---|---|
| Administrator | `admin` | admin@planiraj.ba | `Admin123!` |
| Vlasnik salona (Vendor) | `salon` | salon@planiraj.ba | `Salon123!` |
| Mladenci (Couple) | `mladenci` | mladenci@planiraj.ba | `Mladenci123!` |

U Swaggeru: `POST /api/auth/login` sa `{ "login": "admin", "password": "Admin123!" }`, kopiraj `token`, klikni **Authorize** i zalijepi ga.

## Seed podaci

- 10 gradova u BiH, 7 kategorija usluga, 2 plana pretplate (Standard, Premium)
- **5 usluga u svakoj kategoriji** (35 usluga) kod 34 ponuđača. „Studio ljepote Amra“ je jedan nalog sa dvije kategorije (frizeri + make-up) i njime upravlja korisnik `salon`. Ostali ponuđači još nemaju vlasnika (admin im kasnije dodjeljuje nalog).
- Svaki ponuđač ima radno vrijeme, 3 slike (placeholder sa picsum.photos), kontakt i društvene mreže
- 4 recenzije (3 odobrene, 1 čeka moderaciju) i 3 rezervacije mladenaca
- „Sala Panorama“ (Premium) i „Foto Trenutak“ (Standard) su istaknuti i prikazuju se prvi

Svi nazivi firmi, adrese, telefoni i e-mailovi u seedu su izmišljeni.

## Endpointi

Svi endpointi osim `login` i `register` zahtijevaju prijavu (FR-1). URL-ovi su malim slovima.

| Resurs | Ruta | Čitanje | Izmjene |
|---|---|---|---|
| Auth | `/api/auth/login`, `/register`, `/me` (GET/PUT), `/change-password` | | Svako za sebe |
| Korisnici | `/api/users` | Admin (ili vlastiti profil po Id-u) | Admin |
| Gradovi | `/api/cities` | Svi | Admin |
| Kategorije | `/api/servicecategories` | Svi (aktivne) | Admin |
| Planovi pretplate | `/api/subscriptionplans` | Svi (aktivni) | Admin |
| Ponuđači | `/api/vendors` | Svi (aktivni) | Kreira i briše admin; uređuje admin ili vlasnik |
| Ponuđači (admin polja) | `PUT /api/vendors/{id}/admin` | | Admin: vlasnik, aktivnost, pretplata |
| Usluge ponuđača | `/api/offerings` | Svi | Admin ili vlasnik salona |
| Slike | `/api/vendorimages` | Svi | Admin ili vlasnik salona |
| Radno vrijeme | `/api/workinghours` | Svi | Admin ili vlasnik salona |
| Recenzije | `/api/reviews` | Odobrene + vlastite | Kreira mladenci; mijenja autor; briše autor ili admin |
| Moderacija | `PUT /api/reviews/{id}/approve`, `/reject` | | Admin |
| Rezervacije | `/api/bookings` | Admin sve; salon svoje; mladenci svoje | Kreira mladenci; mijenja autor dok je na čekanju; briše admin |
| Status rezervacije | `PUT /api/bookings/{id}/confirm`, `/reject`, `/cancel` | | Potvrda/odbijanje: salon ili admin; otkazivanje: mladenci, salon ili admin |

### Pretraga ponuđača (FR-6)

`GET /api/vendors?cityId=1&categoryId=4&priceMin=500&priceMax=2000&minRating=4&availableOn=2027-06-12&fts=foto&page=1&pageSize=20`

Sortiranje: istaknuti (aktivna pretplata) prvi, zatim po prosječnoj ocjeni, pa po nazivu.

## Pravila koja su implementirana

- Lozinke: PBKDF2-SHA256, 100.000 iteracija, nasumični salt
- Nalog za ponuđača kreira admin; takav nalog ima `mustChangePassword = true` (FR-3)
- Zakazivanje je opciono po ponuđaču; ako je uključena automatska potvrda, rezervacija odmah dobija status `Confirmed`
- Isti ponuđač ne može imati dvije potvrđene rezervacije za isti datum i isto vrijeme
- Recenzija: jedna po paru za jednog ponuđača; nova ili izmijenjena recenzija ide na moderaciju
- Greške se vraćaju kao `{ "status": 400, "message": "..." }` (400, 403, 404, 409)

## Otvoreno / sljedeće

- Odluke #3 (filter dostupnosti) i #4 (ko smije ostaviti recenziju) implementirane su privremeno, uz `@TODO` u kodu
- Upload slika (sada se čuva samo URL)
- Interni chat (faza 2), AI planiranje (faza 4), naplata pretplata (faza 5)
- Produkcija: `Jwt:Key` i connection string preko varijabli okruženja, ne u `appsettings`
