# Planiraj: frontend (Angular 22)

Web aplikacija za mladence, salone i administratore. Backend je u `../backend`.

## Pokretanje

Potrebno: **Node.js 24** (vidi `.nvmrc`; Angular CLI 22 traži najmanje 22.22.3 ili 24.15).

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit testovi (Vitest): planer, linkovi, množina
```

`ng serve` prosljeđuje sve `/api` pozive na backend `http://localhost:5080` (vidi `proxy.conf.json`),
pa prvo pokrenite API (`dotnet run --project Planiraj.API --launch-profile http` u folderu `backend`).

Produkcijski build: `npm run build` → `dist/frontend/browser`. Server mora sve nepoznate putanje vraćati na
`index.html` (SPA fallback), inače osvježavanje npr. `/istrazi` daje 404.

CI (`.github/workflows/ci.yml`) na svaki push pravi build i pokreće testove frontenda i build backenda.

Test nalozi (iz seed-a): `admin / Admin123!`, `salon / Salon123!`, `mladenci / Mladenci123!`.

## Prijava mladenaca preko Googlea

Registracija (`/registracija`) i prijava (`/prijava`) za mladence imaju samo Googleovo dugme
(`shared/ui/google-button.ts`). Client ID frontend čita sa backenda (`GET /api/auth/config`), pa nije u kodu.
Dok backend nema `Google:ClientId`, umjesto dugmeta stoji napomena. Prijava korisničkim imenom i lozinkom
(saloni, administratori, test nalozi) je ispod, u sklopljenom dijelu „Prijava korisničkim imenom i lozinkom“.

Nakon prve prijave novi nalog ide na `/dobrodosli` (profilna slika, ime i prezime, grad, telefon; može se preskočiti).
Kod naloga bez lozinke profil umjesto promjene lozinke prikazuje da se prijava radi preko Googlea.

## Struktura

```
src/app/
  core/          modeli (DTO), API klijenti, auth + guardovi, tema, formatiranje, gradovi/kategorije,
                 brend (ime na jednom mjestu), linkovi ponuđača, Sačuvano, algoritam planera
  layout/        okvir aplikacije (prozirna gornja traka, donja traka sa karticama na telefonu)
  shared/motion  spring animacije, projekcija zamaha, rubber-band, praćenje brzine
  shared/ui      ikone, sheet, toast, potvrda, ocjena, kartica ponuđača, galerija
  pages/         landing, auth, istraži, ponuđač, sačuvano, planer, moje rezervacije/recenzije, salon,
                 admin, profil, 404
src/styles/      dizajn tokeni, tipografija, zajedničke komponente
```

## Ekrani po ulogama

| Uloga | Ekrani |
|---|---|
| Gost | Početna (brza pretraga, izdvojeni ponuđači, planer, forma za salone, česta pitanja), prijava, registracija, uslovi korištenja (`/uslovi`), privatnost (`/privatnost`). Istraži, stranica ponuđača, planer i Sačuvano rade bez prijave; rezervacija i recenzija vode na prijavu i nazad na istu stranicu |
| Mladenci | Istraži (filteri: kategorija, grad, cijena, ocjena, slobodan datum), stranica ponuđača (galerija, usluge po kategoriji, raspodjela ocjena, mapa, dijeljenje, rezervacija sa provjerom datuma uživo), Sačuvano sa poređenjem do 3 ponuđača, planer vjenčanja, moje rezervacije, moje recenzije |
| Salon | Pregled (zahtjevi na čekanju, potvrđeni termini, ocjena, kontrolna lista kompletnosti stranice), uređivanje (stranica, usluge, galerija, radno vrijeme; `?kartica=` otvara tačnu karticu), rezervacije |
| Administrator | Ponuđači (dodavanje, vlasnik, aktivnost, pretplata), korisnici, moderacija recenzija, šifarnici |

Svi: profil, promjena lozinke, tema (sistemska/svijetla/tamna). Nalog koji kreira administrator mora promijeniti lozinku pri prvoj prijavi.

Linkovi ponuđača su čitljivi: `/ponudjaci/17-foto-trenutak` (stari `/ponudjaci/17` i dalje radi).

### Planer vjenčanja

Tri koraka: usluge → budžet, grad, datum i broj gostiju → paket. Budžet se raspoređuje po kategorijama
(sala 45 %, vjenčanica 14 %, fotograf 13 %…), a u svakoj se bira najbolje ocijenjen ponuđač čija početna
cijena staje u taj dio (ocjena je ublažena brojem recenzija). Ako ukupno prelazi budžet, najveća prekoračenja
se spuštaju na jeftinije opcije. Bira se samo iz baze (FR-28). Logika je u `core/planner.ts` i pokrivena je testovima.

### Gdje se čuvaju Sačuvano i plan

| Podatak | Gost | Prijavljen korisnik |
|---|---|---|
| Sačuvano (favoriti) | `localStorage` | Server (`/api/favorites`); preglednik čuva sažetke ponuđača da lista radi odmah |
| Moj plan (FR-27) | `localStorage` | Server (`/api/plans/me`), automatski kratko poslije svake promjene i odmah na "Sačuvaj" |

Pri prijavi se gostova lista Sačuvanog spaja sa profilom (`POST /api/favorites/sync`), a gostov plan ide u
profil ako profil još nema plan. Bez mreže plan ostaje u pregledniku i ide na server pri sljedećoj promjeni ili prijavi.

Upit salona sa početne još otvara e-mail sa popunjenim podacima (backend nema endpoint za upite).

## Dizajn i pokret

**Vizuelni pravac: „topla elegancija“** (tokeni u `src/styles/_tokens.scss`):
slonovača `#FAF7F2` kao pozadina, bordo `#8C2F39` za akcije, žalfija `#5E6E4B` za „u okviru budžeta“ i potvrde,
zlato samo za ocjene i „istaknuto“. Naslovi su u serifu **Fraunces** (optičko skaliranje, učitava se lokalno iz
`@fontsource-variable/fraunces`), a sav ostali tekst u sistemskom fontu. Tamna tema ima vlastitu, usklađenu paletu.

Pokret i ponašanje prate `.claude/skills/apple-design`:

Rađeno po principima Apple dizajna prilagođenim za web:

- **Odziv odmah:** dugmad i kartice reaguju na pritisak (`:active`), ne tek na klik.
- **Gestovi 1:1 i prekidivi:** sheet (telefon) i galerija prate prst, mogu se uhvatiti usred animacije, a na otpuštanju projekcija zamaha bira krajnju poziciju i spring preuzima brzinu prsta (`shared/motion/spring.ts`).
- **Springovi:** zadano kritično prigušeni (bez odskoka); mali odskok samo nakon gesta sa zamahom.
- **Prostorna dosljednost:** sheet izlazi odozdo i tamo se vraća; meni izlazi iz avatara.
- **Materijali:** prozirne trake (`backdrop-filter`) iznad sadržaja, ivica ispod gornje trake tek kad sadržaj ode ispod nje.
- **Tipografija:** sistemski font, tracking i prored zavise od veličine.
- **Pristupačnost:** `prefers-reduced-motion` (pretapanje umjesto pokreta), `prefers-reduced-transparency`, `prefers-contrast`, tamna tema, fokus prstenovi, ARIA uloge.
  Sve stranice, za sve uloge i u obje teme, prolaze axe provjeru bez grešaka: tekst ima kontrast najmanje 4.5:1
  (WCAG AA), dugmad čitaču ekrana kažu isto što piše na njima, a stranice prijave imaju glavni orijentir.
- **Uski ekrani:** raspored radi od 320 px naviše bez vodoravnog skrola (duži natpisi se na uskim telefonima skrate,
  npr. „Napravite profil“ u „Registracija“). Na stranici ponuđača telefon prikazuje samo traku „Rezerviši“,
  bez plutajućeg dugmeta „Moj plan“.
- **Datumi i cijene:** `core/format.ts` piše ih bez `Intl` podataka preglednika („7. oktobar 2026.“, „6.000 KM“,
  ocjena „4,5“), jer neki preglednici (npr. Chrome na Androidu) nemaju bosanski i pisali bi „2026 M10 7“ i „6,000“.
- **Prelaz na ponuđača:** fotografija sa kartice se „otvori“ u galeriju na stranici ponuđača (View Transitions).

Zajednički pokret (`shared/motion`, stilovi u `styles/_motion.scss`):

| Alat | Šta radi | Gdje se koristi |
|---|---|---|
| `appReveal` / `appReveal="stagger"` | sadržaj blago uđe kad dođe u vidno polje, jednom; djeca redom | sekcije početne, usluge i recenzije ponuđača |
| `img[appFadeIn]` | fotografija se pretopi kad se učita (iz keša odmah) | kartice, galerija, kolaž, Sačuvano, planer, Moj plan |
| `springNumber()` | broj springom prati drugi broj (odbrojavanje) | ukupna procjena i traka budžeta u planeru |
| `<app-ink>` | potez pera ispod riječi, iscrta se jednom | naslov početne („vjenčanje“) |

Sitni odzivi: srce pri čuvanju pusti jedan prsten, trake ocjena se pune od pet zvjezdica naniže, odgovori u
čestim pitanjima izlaze iz pitanja, ikone kategorija se pod mišem blago nagnu, a tri koraka „Kako funkcioniše“
povezuje linija puta (desktop). Nema petlji ni odskoka bez gesta.

## Napomene

- Slike se za sada dodaju preko URL-a; upload dolazi kasnije.
- Planer je deterministički; AI sloj (faza 4) može se dodati iznad njega. Interni chat (faza 2) još nije urađen.
- Ime platforme se mijenja u `src/app/core/brand.ts` i u `src/index.html`.
