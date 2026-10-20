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
| Gost | Početna (brza pretraga, izdvojeni ponuđači, planer, forma za salone, česta pitanja), prijava, registracija. Istraži, stranica ponuđača, planer i Sačuvano su otvoreni u frontendu; dok backend traži prijavu, gost se na 401 vodi na prijavu i vraća na istu stranicu |
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

### Šta se za sada čuva samo u pregledniku

| Podatak | Gdje | Zašto |
|---|---|---|
| Sačuvano (favoriti) | `localStorage`, po korisniku | Backend još nema endpoint |
| Sačuvani plan | `localStorage`, po korisniku | Backend još nema endpoint (FR-27) |
| Upit salona sa početne | otvara e-mail sa popunjenim podacima | Backend još nema endpoint za upite |

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

## Napomene

- Slike se za sada dodaju preko URL-a; upload dolazi kasnije.
- Planer je deterministički; AI sloj (faza 4) može se dodati iznad njega. Interni chat (faza 2) još nije urađen.
- Ime platforme se mijenja u `src/app/core/brand.ts` i u `src/index.html`.
