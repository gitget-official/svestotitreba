# Svadbeno: frontend (Angular 22)

Web aplikacija za mladence, salone i administratore. Backend je u `../backend`.

## Pokretanje

Potrebno: **Node.js 24** (vidi `.nvmrc`; Angular CLI 22 traži najmanje 22.22.3 ili 24.15).

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit testovi (Vitest): planer, linkovi, množina, Sačuvano, plan, poruke
```

`ng serve` prosljeđuje sve `/api` pozive na backend `http://localhost:5080` (vidi `proxy.conf.json`),
pa prvo pokrenite API (`dotnet run --project Planiraj.API --launch-profile http` u folderu `backend`).

Produkcijski build: `npm run build` → `dist/frontend/browser`. Server mora sve nepoznate putanje vraćati na
`index.html` (SPA fallback), inače osvježavanje npr. `/istrazi` daje 404. Poslije prerendera (vidi ispod) postojeće
fajlove, npr. `ponudjaci/6-sala-panorama/index.html`, server vraća direktno; većina statičnih hostinga to radi sama.

CI (`.github/workflows/ci.yml`) na svaki push i PR pravi build i pokreće testove frontenda i backenda.

## Pretraživači (SEO)

Poslije builda skripta `scripts/prerender.mjs` pravi statične stranice za pretraživače i dijeljenje linkova:

```bash
npm run build
SITE_URL=https://prava-domena.ba API_URL=http://localhost:5080/api npm run prerender
```

- `ponudjaci/{id}-{slug}/index.html` za svakog aktivnog ponuđača: naslov, opis, Open Graph (slika za WhatsApp,
  Viber, Facebook), kanonski link, strukturirani podaci (schema.org `LocalBusiness`) i osnovni sadržaj
  (naziv, grad, opis, usluge i cijene, adresa). Kad se Angular pokrene, zamijeni ga pravom stranicom.
- Isto za `/istrazi`, `/planiranje`, `/uslovi` i `/privatnost`.
- `sitemap.xml` sa svim tim adresama i `robots.txt` (lične stranice, prijava i admin nisu za indeksiranje).

Ako hosting ne prosljeđuje `/sitemap.xml` na API, postavite `SITEMAP_URL` na adresu serverskog sitemapa
(npr. `https://api.domena.ba/sitemap.xml`): tada `robots.txt` pokazuje na njega, a on je uvijek svjež. Statični
`sitemap.xml` se i dalje pravi kao rezerva.

Ime i opis se čitaju iz `core/brand.ts`. Bez `SITE_URL` adrese su relativne (samo za lokalnu provjeru). Ako API nije
dostupan, prave se samo opće stranice, sitemap i robots.txt. Statične stranice novih ponuđača nastaju pri sljedećem buildu,
pa prerender treba pokretati pri svakom deployu (sitemap sa servera ih ima odmah). U aplikaciji isto radi `core/seo.ts` (stranica ponuđača).

Test nalozi (iz seed-a): `admin / Admin123!`, `salon / Salon123!`, `mladenci / Mladenci123!`.

## Saloni

Saloni imaju svoju stranicu za prijavu i registraciju, `/za-salone` (Google, poseban endpoint). Novi salon ide na
`/salon/postavljanje` (naziv, grad, adresa, opis, kontakt), salon se odmah objavljuje, a zatim na uređivanju dodaje
usluge, cijene, radno vrijeme, logo i fotografije. Fotografije se biraju sa uređaja (više odjednom), smanjuju u
pregledniku (fotografije JPEG do 1600 px, logo PNG do 512 px) i šalju na server (`core/upload.ts`).
Administrator koristi isti ekran za uređivanje (`/admin/ponudjaci/:id`), pa može sve što i salon.
Na početnoj je dugme "Registrujte salon besplatno", a forma ispod ("Postavite salon za mene") je za salone koji
žele da im stranicu postavimo mi.

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
  shared/chat    poruke: lista sa pretragom, razgovor, traka "Poruke" u uglu (desktop)
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

### Poruke (FR-13)

- **Desktop:** traka "Poruke" zakačena za donji desni ugao (kao na Facebooku) otvara listu razgovora sa pretragom,
  a razgovori se otvaraju u prozorima lijevo od nje (do 3, zavisno od širine). Dugme "Moj plan" je tada iznad trake
  i sklanja se dok je razgovor otvoren.
- **Pretraga (mladenci):** prvo traži u razgovorima; tek ako tu nema pogotka, nudi salone kojima se može pisati, pod
  naslovom "Novi saloni" i uz napomenu da im korisnik još nije pisao. Salon traži samo po svojim razgovorima.
- **Sanduče:** `/poruke` (mladenci) i `/salon/poruke` (salon): lista i razgovor jedno pored drugog na desktopu, jedno
  po jedno na telefonu. Na telefonu mladenci otvaraju poruke ikonom u gornjoj traci, salon karticom "Poruke".
- **Stranica salona:** "Pošalji poruku" / "Nastavi razgovor" (samo saloni koji primaju poruke; gost ide na prijavu).
- Stanje je u `core/chat-store.ts`: lista, poruke po razgovoru, veza uživo (`@microsoft/signalr`, `proxy.conf.json`
  ima `ws: true`) i prozori. Poruka se prikaže odmah i ostaje sa "Pošalji ponovo" ako slanje ne uspije.
- **Bez treptanja pogrešnog prikaza** (skill `no-ui-flash`): lista i značka se iscrtavaju odmah iz nagovještaja u
  pregledniku (`planiraj.chat.{id}`: zaglavlja razgovora, bez historije poruka), a server ih zamijeni čim odgovori.
  Bez nagovještaja prikaz je neutralan dok server ne odgovori; "nemate poruka", "Novi saloni" i "napišite prvu poruku"
  se pokazuju samo kad je to potvrđeno. Nagovještaj se briše pri odjavi, isteku sesije i brisanju profila. Testovi
  u `core/chat-store.spec.ts` drže zahtjev otvorenim i provjeravaju šta je prikazano u međuvremenu.

Node 25+ ima vlastiti `localStorage` koji zaklanja jsdom-ov; `src/test-setup.ts` ga vraća, pa testovi rade i na
novijem Node-u (CI koristi verziju iz `.nvmrc`).

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
