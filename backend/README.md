# Planiraj: backend (.NET 10 Web API)

Backend platforme za planiranje vjenčanja. Zahtjevi su u `../docs/zahtjevi-projekta.md`.

## Struktura

| Projekat | Sadržaj |
|---|---|
| `Planiraj.Model` | DTO-ovi, request modeli, search objekti, enumi, izuzeci (bez zavisnosti) |
| `Planiraj.Services` | EF Core entiteti i `PlanirajDbContext`, migracije, seeder, servisi (poslovna logika i pravila pristupa) |
| `Planiraj.API` | Kontroleri, JWT autentifikacija, ograničenje broja zahtjeva, middleware za greške, Swagger |
| `Planiraj.Tests` | Integracioni testovi (xUnit): cijeli API u memoriji sa SQLite bazom i seed podacima |

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

Testovi (ne trebaju SQL Server ni Google):

```bash
dotnet test Planiraj.sln
```

Pokrivaju javni pregled ponude, Google prijavu, Sačuvano, plan, brisanje profila i ograničenje zahtjeva.

Za ponovno punjenje baze od nule: `dotnet ef database drop --project Planiraj.Services --startup-project Planiraj.API`, pa ponovo pokreni API.

## Prijava preko Googlea (mladenci i saloni)

Mladenci (`POST /api/auth/google`) i saloni (`POST /api/auth/google/salon`) se registruju i prijavljuju preko
Googlea, bez lozinke, svako na svojoj stranici. Administratori i saloni kojima je admin dao lozinku mogu i dalje
koristiti korisničko ime i lozinku. Reset lozinke i potvrda e-maila dolaze kasnije.

1. U [Google Cloud Console](https://console.cloud.google.com/apis/credentials) napravi **OAuth client ID**
   tipa **Web application**. U **Authorized JavaScript origins** dodaj `http://localhost:4200` i produkcijsku
   adresu (npr. `https://svadbeno.com`). Redirect URI nije potreban (dugme radi u popup prozoru).
2. Client ID upiši u `Google:ClientId` (`appsettings.Development.json`) ili varijablu okruženja `Google__ClientId`.
   Client ID nije tajna (vidi ga i preglednik).
3. Primijeni migraciju `AddGoogleLogin` (radi se automatski pri pokretanju API-ja).

Tok: frontend dobije ID token od Googlea i pošalje ga na `POST /api/auth/google`. Backend ga provjeri
(`Google.Apis.Auth`: potpis, izdavač, rok i client id), pa:

- nalog sa istim Google ID-om: prijava (osim mladenaca na stranici za salone, to se odbije);
- nalog iste uloge sa istim e-mailom (mladenci na stranici mladenaca, salon na stranici salona): poveže se sa Googleom
  i prijavi; tako se salon kojem je admin napravio nalog sam poveže sa svojim Google nalogom;
- nalog druge uloge sa istim e-mailom: odbije se uz poruku gdje da se prijavi (admin uvijek lozinkom);
- nema naloga: napravi se nalog (mladenci ili salon) bez lozinke, a odgovor ima `isNew: true`
  (frontend vodi mladence na `/dobrodosli`, a salon na `/salon/postavljanje`).

Jedan Google nalog je ili mladenci ili salon, nikad oboje.

## Saloni: samostalno postavljanje i slike

- Salon poslije registracije sam pravi svoju stranicu (`POST /api/vendors` sa ulogom Vendor): uvijek za sebe,
  jedan salon po nalogu (dodatni preko administratora), i objavljuje se odmah, bez odobrenja. Admin ga može
  isključiti kao i svaki drugi salon.
- Opis, usluge, cijene, slike i radno vrijeme salon uređuje sam; administrator može sve isto za bilo koji salon
  (isti endpointi, ista prava kao vlasnik), i može napraviti salon za nekoga i dodijeliti mu vlasnika.
- Upload: `POST /api/uploads/vendors/{vendorId}` (multipart, polje `file`), smije vlasnik tog salona ili admin.
  Prima JPG, PNG i WebP (provjera po sadržaju fajla, ne po imenu) do `Uploads:MaxSizeMb` (zadano 5 MB) i vraća
  `{ url }`. Ta adresa se zatim šalje kao slika galerije (`/api/vendorimages`) ili logo salona.
- Fajlovi se čuvaju na disku (`Uploads:Root`, zadano `Planiraj.API/uploads`, nije u gitu) i serviraju na
  `/api/uploads/...` uz dugo keširanje. `Uploads:PublicBaseUrl` se postavlja samo ako se slike serviraju sa druge
  adrese (npr. CDN). Za produkciju taj folder mora biti trajan i uključen u backup; kasnije se može preći na
  Cloudflare R2 zamjenom `IFileStorage`.

E-mail na Google nalogu mora biti potvrđen. `GET /api/auth/config` vraća client id (ili `null` kad nije podešen,
pa frontend ne prikazuje dugme).

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

Pregled ponude je javan: gost bez prijave može čitati gradove, kategorije, planove pretplate, ponuđače, usluge,
slike, radno vrijeme i odobrene recenzije (samo `GET` liste i `GET {id}`, oznaka `[PublicRead]` i
`PublicReadConvention`). Gost vidi samo aktivne ponuđače i odobrene recenzije. Sve izmjene, rezervacije, korisnici,
Sačuvano i plan traže prijavu. URL-ovi su malim slovima.

| Resurs | Ruta | Čitanje | Izmjene |
|---|---|---|---|
| Auth | `/api/auth/login`, `/register`, `/google`, `/config`, `/me` (GET/PUT/DELETE), `/change-password` | | Svako za sebe; `DELETE /me` briše profil (samo mladenci) |
| Korisnici | `/api/users` | Admin (ili vlastiti profil po Id-u) | Admin |
| Gradovi | `/api/cities` | Svi | Admin |
| Kategorije | `/api/servicecategories` | Svi (aktivne) | Admin |
| Planovi pretplate | `/api/subscriptionplans` | Svi (aktivni) | Admin |
| Ponuđači | `/api/vendors` | Svi (aktivni) | Kreira admin ili salon sam za sebe (jedan); briše admin; uređuje admin ili vlasnik |
| Upload slika | `POST /api/uploads/vendors/{vendorId}` | | Admin ili vlasnik salona |
| Ponuđači (admin polja) | `PUT /api/vendors/{id}/admin` | | Admin: vlasnik, aktivnost, pretplata |
| Usluge ponuđača | `/api/offerings` | Svi | Admin ili vlasnik salona |
| Slike | `/api/vendorimages` | Svi | Admin ili vlasnik salona |
| Radno vrijeme | `/api/workinghours` | Svi | Admin ili vlasnik salona |
| Recenzije | `/api/reviews` | Odobrene + vlastite | Kreira mladenci; mijenja autor; briše autor ili admin |
| Moderacija | `PUT /api/reviews/{id}/approve`, `/reject` | | Admin |
| Rezervacije | `/api/bookings` | Admin sve; salon svoje; mladenci svoje | Kreira mladenci; mijenja autor dok je na čekanju; briše admin |
| Sačuvano | `/api/favorites` (GET), `/{vendorId}` (POST/DELETE), `/sync` (POST) | Svako svoje | Svako svoje; `sync` spaja listu iz preglednika sa profilom |
| Moj plan | `/api/plans/me` (GET/PUT/DELETE) | Svako svoje (204 kad plana nema) | Svako svoje; `manual: true` bilježi vrijeme ručnog čuvanja |
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
- Admin lista korisnika odvaja obrisane profile (`isDeleted=true`, oznaka "Obrisan profil") od neaktivnih
  (`isActive=false&isDeleted=false`); obrisan profil se ne može urediti ni obrisati iz admina
- Token važi samo dok je nalog aktivan: isključen ili obrisan nalog odmah dobija 401, i prije isteka tokena
- Brisanje profila (`DELETE /api/auth/me`, samo mladenci): brišu se plan i Sačuvano, buduće rezervacije na čekanju ili
  potvrđene se otkazuju, napomene uz rezervacije se brišu, a ime, e-mail, telefon, slika, grad i veza sa Googleom se
  uklanjaju (`Obrisan korisnik`, `obrisan-{id}@obrisano.invalid`). Red korisnika ostaje zbog recenzija i rezervacija
  salona; `DeletedAt` je popunjen i admin takav nalog ne može ponovo uključiti. Saloni i admini se brišu preko admina.
- Greške se vraćaju kao `{ "status": 400, "message": "..." }` (400, 403, 404, 409)

## Sitemap za pretraživače

`GET /sitemap.xml` (i isto na `/api/sitemap.xml`) vraća sitemap uvijek svjež iz baze: opće stranice i sve aktivne
ponuđače. Novi ili isključen ponuđač se vidi odmah, bez novog builda frontenda. Adrese vode na frontend:
`Seo:SiteUrl` (npr. `https://domena.ba`), a ako nije postavljen, prvi `Cors:Origins`. Odgovor se kešira sat vremena.

Hosting treba `domena.ba/sitemap.xml` proslijediti na API, ili se u `robots.txt` (vidi `SITEMAP_URL` u
frontend README-u) navede adresa API-ja.

## Ograničenje broja zahtjeva

Sekcija `RateLimit` u `appsettings.json`:

| Postavka | Zadano | Značenje |
|---|---|---|
| `Enabled` | `true` | Isključiti samo za testiranje |
| `PermitPerMinute` | `120` | Zahtjeva u minuti po korisniku (prijavljen) ili po IP adresi (gost) |
| `AuthPermitPerMinute` | `10` | Pokušaja prijave i registracije (`login`, `register`, `google`) u minuti po IP adresi |
| `TrustForwardedHeaders` | `false` | `true` samo iza proxyja koji postavlja `X-Forwarded-For` (nginx, Cloudflare) i kad API nije direktno dostupan sa interneta |

Prekoračenje vraća `429` sa zaglavljem `Retry-After` i porukom na bosanskom. Iza proxyja bez
`TrustForwardedHeaders` svi korisnici dijele jednu IP adresu (adresu proxyja), pa bi brzo dobili 429.

## Otvoreno / sljedeće

- Odluke #3 (filter dostupnosti) i #4 (ko smije ostaviti recenziju) implementirane su privremeno, uz `@TODO` u kodu
- Brisanje uploadovanog fajla sa diska kad se slika ukloni iz galerije (sada ostaje na disku)
- Interni chat (faza 2), AI planiranje (faza 4), naplata pretplata (faza 5)
- Produkcija: `Jwt:Key` i connection string preko varijabli okruženja, ne u `appsettings`
