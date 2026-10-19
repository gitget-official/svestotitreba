# Definicija zahtjeva projekta: Platforma za planiranje vjenčanja

> Status dokumenta: **nacrt v0.1** (faza definisanja zahtjeva)
> Datum: 19.10.2026.
> Napomena: dokument se postepeno dopunjava. Stavke označene sa `@TODO` ili `[OTVORENO]` još nisu odlučene.

---

## 1. Opis projekta

Web aplikacija koja mladencima olakšava planiranje vjenčanja. Funkcioniše kao **oglasna ploča / imenik svih usluga** koje ulaze u organizaciju svadbe. Mladenci mogu sami pretraživati ponuđače usluga ili koristiti **AI planiranje**, gdje na osnovu nekoliko pitanja i preferencija dobiju preporuku kompletnog paketa usluga.

Ponuđači usluga (saloni) dobijaju vlastiti nalog, personalizovanu stranicu i, ako to žele, mogućnost primanja rezervacija termina kroz platformu.

### Ciljevi
- Na jednom mjestu okupiti sve usluge potrebne za organizaciju vjenčanja.
- Uštedjeti mladencima vrijeme pri traženju i poređenju ponuđača.
- Ponuđačima dati vidljivost i jednostavan kanal za dobijanje upita i rezervacija.
- Dugoročno: monetizacija kroz pretplatu za isticanje ponuđača.

### Tržište
- Početno: **samo Bosna i Hercegovina**.
- Jezik: `[OTVORENO]` pretpostavka je bosanski jezik; preporuka je da se arhitektura od početka pripremi za višejezičnost (i18n) radi eventualnog proširenja.

---

## 2. Uloge korisnika

| Uloga | Opis | Kako dobija nalog |
|---|---|---|
| **Mladenci** (korisnik) | Pretražuju ponudu, koriste AI planiranje, kontaktiraju salone, rezervišu termine, ostavljaju recenzije | Samostalna registracija |
| **Ponuđač / salon** | Održava svoju stranicu, cjenovnik, galeriju, upravlja upitima i terminima | Nalog kreira administrator |
| **Administrator** | Upravlja sadržajem i nalozima na platformi | Interni nalog |

**Pojam „ponuđač“ (grupacija):** jedan nalog predstavlja jednog ponuđača, koji može istovremeno nuditi **više kategorija usluga** (npr. frizer + iznajmljivanje svečanih automobila). Kategorije se mogu naknadno dodavati na postojeći nalog.

---

## 3. Kategorije usluga (trenutno)

1. Saloni za vjenčanice / odijela
2. Saloni za vjenčanje (prostori / sale)
3. Dekoracije
4. Fotografi
5. Rent svečanih automobila
6. Frizeri
7. Beauty / make-up saloni

> Lista kategorija **nije konačna**. Sistem mora omogućiti dodavanje, izmjenu i uklanjanje kategorija bez izmjene koda (upravlja administrator).

---

## 4. Funkcionalni zahtjevi

### 4.1 Pristup i autentifikacija
- **FR-1:** Pregledanje ponude zahtijeva prijavu. Neprijavljeni posjetilac vidi samo početnu stranicu, opis platforme i formu za prijavu/registraciju.
- **FR-2:** Mladenci samostalno kreiraju profil (registracija, prijava, odjava, reset lozinke).
- **FR-3:** Ponuđači dobijaju pristupne podatke nakon što administrator kreira nalog; pri prvoj prijavi mijenjaju lozinku.
- **FR-4:** Pristup funkcijama zavisi od uloge (RBAC: mladenci / ponuđač / administrator).

### 4.2 Mladenci: pretraga i pregled ponude
- **FR-5:** Dva načina korištenja:
  - **Samostalna pretraga:** mladenci biraju kategoriju po kategoriju i pregledaju ponuđače.
  - **Planiranje vjenčanja (AI):** vođeni upitnik i preporuka paketa (vidi 4.6).
- **FR-6:** Filtriranje ponuđača po:
  - gradu,
  - cijeni (raspon),
  - ocjeni,
  - dostupnosti datuma (samo za ponuđače koji imaju uključeno zakazivanje; `@TODO` detaljnije definisati kako se ovaj filter ponaša prema ponuđačima bez zakazivanja).
- **FR-7:** Stranica ponuđača prikazuje sve podatke iz sekcije 4.3.
- **FR-8:** Mladenci mogu ostavljati recenzije i ocjene ponuđačima (vidi 4.5).
- **FR-9:** Mladenci imaju profil u kojem vide svoje rezervacije, upite, recenzije i sačuvani plan vjenčanja.

### 4.3 Ponuđač: stranica i personalizacija
Ponuđač može uređivati svoju stranicu i imati:
- opis,
- galeriju slika,
- cjenovnik,
- radno vrijeme,
- lokaciju (prikaz na mapi),
- kontakt podatke (telefon, e-mail),
- linkove ka društvenim mrežama.

Dodatno:
- **FR-10:** Ponuđač bira kategorije usluga koje nudi (jedna ili više) i može imati poseban cjenovnik/opis po kategoriji.
- **FR-11:** Cijene se prikazuju kao **raspon „od–do“**.
- **FR-12:** Ponuđač vidi i odgovara na upite, upravlja rezervacijama (ako ih koristi) i vidi recenzije na svojoj stranici.

### 4.4 Komunikacija
- **FR-13:** Mladenci kontaktiraju ponuđača kroz **interni chat** na platformi.
- **FR-14:** Pored toga, stranica ponuđača prikazuje direktne kontakte (telefon i e-mail).
- **FR-15:** Obavještenja o novim porukama i rezervacijama (e-mail; `@TODO` odlučiti o notifikacijama unutar aplikacije).

### 4.5 Recenzije i ocjene
- **FR-16:** Prijavljeni mladenci mogu ostaviti ocjenu i tekstualnu recenziju ponuđaču.
- **FR-17:** **Administratori moderiraju recenzije** (odobravanje, uklanjanje neprikladnih).
- **FR-18:** Prosječna ocjena ponuđača se računa i prikazuje na stranici i u rezultatima pretrage.
- `[OTVORENO]` Ko smije ostaviti recenziju (bilo ko prijavljen ili samo korisnik koji je imao rezervaciju/kontakt)? Preporuka za kasnije: ograničiti radi vjerodostojnosti.
- `[OTVORENO]` Može li ponuđač odgovoriti na recenziju?

### 4.6 Zakazivanje termina (opciono po ponuđaču)
- **FR-19:** Zakazivanje je **opcija koju ponuđač sam uključuje ili isključuje**. Ponuđači koji ne žele zakazivanje i dalje su potpuno vidljivi i dostupni kroz chat i kontakt podatke.
- **FR-20:** Za ponuđače sa uključenim zakazivanjem:
  - definišu dostupne termine / kalendar,
  - mladenci šalju zahtjev za termin ili rezervišu slobodan termin,
  - ponuđač bira **automatsku potvrdu** ili **ručnu potvrdu** zahtjeva.
- **FR-21:** **Avans** nije obavezan na nivou platforme; **svaki ponuđač sam odlučuje** da li traži avans. `@TODO` definisati kako se avans evidentira (samo informativno vs. stvarna online uplata).
- **FR-22:** Početna verzija zakazivanja treba biti **jednostavna** (bez složenih pravila, paketa termina i sl.).
- **FR-23:** Statusi rezervacije: na čekanju, potvrđena, odbijena, otkazana.

### 4.7 AI planiranje vjenčanja
> Detaljna razrada ove funkcionalnosti radi se naknadno; ovdje je samo okvir zahtjeva.

- **FR-24:** Mladenci biraju opciju **„Planiranje vjenčanja“**.
- **FR-25:** Sistem postavlja nekoliko pitanja, npr.:
  - koje usluge im trebaju (od ponuđenih kategorija),
  - okvirni budžet (koliko su spremni platiti),
  - grad / mjesto vjenčanja,
  - ostale preferencije `@TODO` (npr. datum, broj gostiju, stil; lista će se dopuniti).
- **FR-26:** AI na osnovu odgovora preporučuje **cijeli paket**: ponuđače po svakoj kategoriji koji odgovaraju preferencijama, uz procjenu ukupne cijene.
- **FR-27:** Mladenci mogu **sačuvati plan** u svom profilu i vratiti mu se kasnije.
- **FR-28:** Preporuke se zasnivaju samo na ponuđačima koji postoje u bazi platforme.
- `@TODO` izbor AI modela/provajdera, način korištenja podataka iz baze, ponašanje kada nema dovoljno odgovarajućih ponuđača.

### 4.8 Administracija
Administrator:
- **FR-29:** dodaje nove ponuđače i **kreira njihove naloge**,
- **FR-30:** upravlja kategorijama usluga,
- **FR-31:** moderira recenzije (vidi 4.5),
- **FR-32:** pregleda i uređuje podatke ponuđača po potrebi.

> Napomena: obim administracije je za sada namjerno ograničen na navedeno. Statistike, blokiranje korisnika, odobravanje izmjena sadržaja i slično mogu se dodati u kasnijim fazama.

### 4.9 Monetizacija (buduća faza, ali treba pripremiti)
- **FR-33:** Plaćanjem **pretplate** ponuđači mogu postati istaknutiji na platformi (npr. viša pozicija u rezultatima, oznaka „istaknuto“).
- **Zahtjev za arhitekturu:** već sada predvidjeti u modelu podataka i redoslijedu rezultata mogućnost isticanja ponuđača (npr. polje plana/pretplate, datum isteka, težina u sortiranju), da se kasnije ne mora raditi veliko preoblikovanje.
- `@TODO` planovi pretplate, cijene, način naplate (payment provider za BiH), fakturisanje.

---

## 5. Nefunkcionalni zahtjevi

- **NFR-1 Platforma:** responzivna web aplikacija (desktop, tablet, mobilni browser). Zasebna mobilna aplikacija **nije** u opsegu.
- **NFR-2 Tehnologije:** frontend **Angular**, backend **.NET** (Web API).
- **NFR-3 Sigurnost:** zaštita lozinki (hashing), autentifikacija tokenima, kontrola pristupa po ulogama, zaštita od uobičajenih web ranjivosti.
- **NFR-4 Privatnost:** s obzirom da se radi o pravom proizvodu, predvidjeti zaštitu ličnih podataka, uslove korištenja i politiku privatnosti. `@TODO` detaljna pravna razrada (GDPR/lokalni propisi) u kasnijoj fazi.
- **NFR-5 Skalabilnost:** model podataka podržava dodavanje novih kategorija, novih gradova/regija i novih jezika bez većih izmjena.
- **NFR-6 Upotrebljivost:** jednostavan interfejs prilagođen mladencima i ponuđačima koji nisu tehnički potkovani.
- **NFR-7 Performanse:** brza pretraga i filtriranje, optimizovane slike u galerijama.
- **NFR-8 Održivost:** čist, dokumentovan kod; razdvojen frontend i backend.

---

## 6. Prijedlog faza razvoja

> Prijedlog radi lakšeg planiranja; faze se mogu mijenjati. Funkcionalnosti će se dodavati postepeno.

**Faza 1: Osnova (MVP)**
- Registracija/prijava, uloge
- Admin: kreiranje ponuđača i naloga, upravljanje kategorijama
- Stranica ponuđača (opis, galerija, cjenovnik, radno vrijeme, mapa, kontakt, društvene mreže)
- Pregled i pretraga ponude (kategorija, grad, cijena)

**Faza 2: Interakcija**
- Interni chat
- Recenzije i ocjene + moderacija
- Filter po ocjeni

**Faza 3: Zakazivanje**
- Opciono zakazivanje termina po ponuđaču
- Automatska/ručna potvrda, evidencija avansa po izboru ponuđača
- Filter po dostupnosti datuma

**Faza 4: AI planiranje**
- Upitnik, preporuka cijelog paketa, čuvanje plana u profilu

**Faza 5: Monetizacija**
- Pretplate i isticanje ponuđača

---

## 7. Pretpostavke i ograničenja

- Početno tržište je samo BiH.
- Ponuđači ne mogu sami otvoriti nalog; nalog uvijek kreira administrator.
- Zakazivanje nije obavezno za ponuđače.
- Obim administratorskih funkcija je za sada ograničen.
- Plaćanje i pretplate nisu dio prve verzije.

---

## 8. Lista otvorenih odluka

| # | Tema | Status |
|---|---|---|
| 1 | Jezici platforme (samo bosanski ili i18n od početka) | `[OTVORENO]` |
| 2 | Podaci koje AI prikuplja osim usluga, budžeta i lokacije | `@TODO` |
| 3 | Ponašanje filtera „dostupnost datuma“ prema ponuđačima bez zakazivanja | `@TODO` |
| 4 | Ko smije ostaviti recenziju; može li ponuđač odgovoriti | `[OTVORENO]` |
| 5 | Avans: samo informativno ili stvarna online uplata | `@TODO` |
| 6 | Obavještenja (e-mail, unutar aplikacije) | `@TODO` |
| 7 | Izbor AI modela/provajdera i način integracije | `@TODO` |
| 8 | Planovi pretplate, cijene i payment provider | `@TODO` |
| 9 | Pravna dokumentacija (uslovi korištenja, privatnost, GDPR) | `@TODO` |
| 10 | Dodatne administratorske funkcije (statistike, blokiranje, odobravanje izmjena) | Odgođeno |
| 11 | Konačna lista kategorija usluga | Podložno promjenama |
