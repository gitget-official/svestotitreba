# Planiraj: frontend (Angular 22)

Web aplikacija za mladence, salone i administratore. Backend je u `../backend`.

## Pokretanje

Potrebno: **Node.js 22.22.3+ ili 24.15+** (zahtjev Angular CLI 22).

```bash
npm install
npm start          # http://localhost:4200
```

`ng serve` prosljeđuje sve `/api` pozive na backend `http://localhost:5080` (vidi `proxy.conf.json`),
pa prvo pokrenite API (`dotnet run --project Planiraj.API --launch-profile http` u folderu `backend`).

Produkcijski build: `npm run build` → `dist/frontend/browser`.

Test nalozi (iz seed-a): `admin / Admin123!`, `salon / Salon123!`, `mladenci / Mladenci123!`.

## Struktura

```
src/app/
  core/          modeli (DTO), API klijenti, auth + guardovi, tema, formatiranje, gradovi/kategorije
  layout/        okvir aplikacije (prozirna gornja traka, donja traka sa karticama na telefonu)
  shared/motion  spring animacije, projekcija zamaha, rubber-band, praćenje brzine
  shared/ui      ikone, sheet, toast, potvrda, ocjena, kartica ponuđača, galerija
  pages/         landing, auth, istraži, ponuđač, moje rezervacije/recenzije, salon, admin, profil
src/styles/      dizajn tokeni, tipografija, zajedničke komponente
```

## Ekrani po ulogama

| Uloga | Ekrani |
|---|---|
| Gost | Početna, prijava, registracija (samo mladenci) |
| Mladenci | Istraži (filteri: kategorija, grad, cijena, ocjena, slobodan datum), stranica ponuđača, rezervacija termina, recenzije, moje rezervacije, moje recenzije, najava AI planiranja |
| Salon | Moji saloni, uređivanje (stranica, usluge, galerija, radno vrijeme), rezervacije (potvrda/odbijanje/otkazivanje) |
| Administrator | Ponuđači (dodavanje, vlasnik, aktivnost, pretplata), korisnici, moderacija recenzija, šifarnici |

Svi: profil, promjena lozinke, tema (sistemska/svijetla/tamna). Nalog koji kreira administrator mora promijeniti lozinku pri prvoj prijavi.

## Dizajn i pokret

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
- AI planiranje (faza 4) je samo najava; interni chat (faza 2) još nije urađen.
