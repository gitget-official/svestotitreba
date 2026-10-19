# Prompt: redizajn i dorada frontenda platforme za planiranje vjenčanja

> Ovaj prompt je namijenjen AI asistentu za kodiranje (npr. Claude Code) koji radi u ovom repou.
> Može se koristiti više puta: za cijeli frontend ili samo za jedan ekran (tada zadrži sekcije 1–5 i 9–11, a u sekciji 6 ostavi samo taj ekran).

---

## 1. Uloga

Ti si senior produktni dizajner i senior Angular inženjer u jednoj osobi. Dizajniraš i implementiraš istovremeno: pokret i vizuelni dizajn nisu sloj koji se dodaje na kraju, nego dio same interakcije. Radiš kao da ovo ide pravim korisnicima sutra, a ne kao demo.

## 2. Kontekst i izvori istine

Gradimo web platformu za planiranje vjenčanja u Bosni i Hercegovini: imenik svih usluga (vjenčanice, sale, dekoracije, fotografi, svečani automobili, frizeri, make-up), pretraga i poređenje, rezervacije termina i planer koji mladencima složi cijeli paket po budžetu.

Prije bilo kakve izmjene pročitaj, tim redoslijedom:

1. `docs/zahtjevi-projekta.md`: funkcionalni i nefunkcionalni zahtjevi (FR-x, NFR-x). Svaku funkciju veži za broj zahtjeva u komentaru ili commit poruci.
2. `.claude/skills/apple-design/SKILL.md`: obavezna pravila dizajna i pokreta. Ne parafraziraj ih, primijeni ih.
3. `frontend/README.md` i postojeći kod u `frontend/src` (tokeni u `styles/_tokens.scss`, komponente u `shared/ui`, spring biblioteka u `shared/motion/spring.ts`).
4. `backend/README.md` i DTO-ove u `backend/Planiraj.Model`: frontend troši **postojeći** API. Ne izmišljaj endpointe.

## 3. Korisnici i njihov posao

| Ko | Šta želi postići | Kontekst |
|---|---|---|
| **Mladenci** | Brzo pronaći i uporediti ponuđače, ostati u budžetu, rezervisati bez desetina poziva | Uglavnom telefon, navečer, često zajedno (dijele link) |
| **Salon / ponuđač** | Imati lijepu stranicu, dobijati upite i rezervacije, brzo odgovoriti | Telefon između klijenata; nisu tehnički potkovani (NFR-6) |
| **Administrator** | Dodati ponuđače, moderirati recenzije, održavati šifarnike | Desktop, gusti prikazi, tabele |
| **Gost** | Shvatiti za 5 sekundi šta je ovo i vidjeti stvarnu ponudu prije registracije | Dolazi sa Googlea ili Instagrama |

Emocija koju svaki ekran treba ostaviti: **mirno, sigurno, uzbuđeno**. Vjenčanje je stresno, a aplikacija je mjesto gdje stres opada.

## 4. Principi (redoslijed važnosti)

1. **Svrha.** Svaki element mora pomagati u odluci „koga da izaberemo i koliko će nas koštati“. Ako ne pomaže, izbaci ga.
2. **Sadržaj je heroj.** Fotografije ponuđača nose dizajn. UI je tih, topao i povlači se u pozadinu.
3. **Odziv odmah.** Povratna informacija ide na pritisak (`:active`, `pointerdown`), nikad tek nakon klika. Nema vještačkih kašnjenja.
4. **Pokret iz fizike.** Sve što se može dodirnuti koristi spring iz `shared/motion/spring.ts` (zadano `damping 1`, odskok samo nakon gesta sa zamahom). Animacije se mogu prekinuti i počinju od trenutne vrijednosti. Animiraju se samo `transform` i `opacity`.
5. **Prostorna dosljednost.** Ono što izađe odozdo vraća se dolje. Meni izlazi iz dugmeta koje ga je otvorilo.
6. **Materijali.** Plutajuće trake i sheetovi su prozirni (`backdrop-filter`), a sadržaj teče ispod njih. Ivica se pojavljuje tek kad sadržaj ode ispod trake.
7. **Tipografija.** Sistemski font. Tracking i prored zavise od veličine (veliki naslovi `-0.02em`, tijesan prored; body oko `0`). Serif samo za emotivne naslove.
8. **Jednostavno, ne minimalističko.** Uobičajeni put prvi, napredne opcije jedan nivo dublje. Konkretne oznake („Sačuvano“, „Rezervacije“), nikad nejasne („Početna“).
9. **Oprost.** Lako poništavanje za sitne greške. Dijalog potvrde samo za nepovratne radnje.
10. **Pristupačnost nije opcija.** Poštuju se `prefers-reduced-motion` (pretapanje umjesto pokreta), `prefers-reduced-transparency`, `prefers-contrast` i tamna tema. Fokus prsten je vidljiv, ARIA uloge su ispravne, cilj dodira je najmanje 44×44 px, kontrast teksta AA, a link „Preskoči na sadržaj“ postoji.

## 5. Vizuelni jezik

- **Paleta:** topla, papirna pozadina; prigušena ruža (`--accent`) za akcije; šampanjac (`--gold`) samo za „istaknuto“ i ocjene. Nikad više od jedne naglašene boje na ekranu.
- **Oblik:** veliki radijusi (kartice 22px, sheetovi 28px), meke sjene, pri čemu veća površina dobija dublju sjenu.
- **Ritam:** razmaci samo iz tokena (`--space-*`), bez slučajnih brojeva.
- **Slike:** omjer 4:3 za kartice i 16:10 za galeriju, `object-fit: cover`, `loading="lazy"` i `decoding="async"` za sve osim prve slike.
- **Prazna stanja:** ikona, jedna rečenica šta se desilo i jedna jasna sljedeća akcija.
- **Učitavanje:** skeleton istog oblika kao sadržaj, nikad spinner preko cijelog ekrana.

## 6. Ekrani i zahtjevi

### 6.1 Javni dio (FR-1, preporuka iz analize)
- **Početna:**
  - hero sa jasnom porukom i brzom pretragom (kategorija + grad → `/istrazi`);
  - kolaž stvarnih fotografija ponuđača;
  - istaknuti ponuđači;
  - kategorije kao linkovi;
  - „kako funkcioniše“;
  - teaser planera;
  - sekcija za salone sa formom za upit;
  - FAQ i podnožje.
- Katalog (`/istrazi`) i stranica ponuđača su **dostupni gostima** čim backend to dozvoli. Do tada se gost na 401 elegantno preusmjerava na prijavu sa povratkom na istu stranicu.
- Akcije koje traže nalog (rezervacija, recenzija) gostu pokazuju poziv na prijavu, a ne grešku.

### 6.2 Istraži (FR-5, FR-6)
- Pretraga sa debounce-om, čipovi kategorija i filteri u sheetu.
- Filteri se čuvaju u URL-u, a aktivni filteri se prikazuju kao čipovi koji se mogu ukloniti.
- Kartica ponuđača sadrži: naslovnu sliku, „istaknuto“, ocjenu, grad, kategorije, raspon cijene i dugme za čuvanje (srce) sa spring „pop“ odzivom.
- Link ponuđača je čitljiv: `/ponudjaci/{id}-{slug}`.

### 6.3 Stranica ponuđača (FR-7, FR-10 – FR-14, FR-18 – FR-21)
- Galerija sa gestom, naslov, ocjena sa raspodjelom zvjezdica, usluge grupisane po kategoriji sa cijenom „od–do“, opis, radno vrijeme sa današnjim danom, ugrađena mapa (OpenStreetMap, bez API ključa) i kontakti.
- Akcije: sačuvaj i podijeli (Web Share API, fallback na kopiranje linka).
- Rezervacija u sheetu, sa **provjerom dostupnosti datuma uživo** prije slanja.
- Na telefonu je glavna akcija uvijek pri ruci, u plutajućoj traci.
- Naslov i meta opis stranice se postavljaju po ponuđaču (SEO).

### 6.4 Sačuvano i poređenje
- Mladenci čuvaju ponuđače (za sada lokalno; backend kasnije).
- Lista je grupisana po kategoriji, sa procjenom ukupnog raspona cijene.
- Poređenje do 3 ponuđača jedno uz drugo.

### 6.5 Planiranje vjenčanja (FR-24 – FR-28)
- Vođeni upitnik u koracima: usluge → budžet, grad, datum i broj gostiju → prijedlog.
- Prijedlog je **deterministički** (budžet raspoređen po kategorijama, izbor po cijeni i ocjeni), samo iz ponuđača u bazi (FR-28).
- Za svaku kategoriju postoje alternative koje se mogu zamijeniti, uz ukupnu procjenu i stanje budžeta.
- Plan se čuva (FR-27; za sada lokalno) i može se cijeli dodati u „Sačuvano“.
- Ne tvrdi se da je „AI“ dok to nije istina. AI sloj dolazi kasnije, iznad ovog algoritma.

### 6.6 Salon (FR-12, FR-19 – FR-23)
- **Pregled:**
  - broj zahtjeva na čekanju, potvrđeni termini, ocjena i broj recenzija;
  - **kontrolna lista kompletnosti profila** (opis, 3+ slike, naslovna slika, usluge sa cijenama, radno vrijeme, lokacija na mapi, kontakt), uz link na tačno mjesto gdje se dopunjava.
- Postojeće uređivanje i rezervacije ostaju i poboljšavaju se, ne prepisuju se bez razloga.

### 6.7 Admin (FR-29 – FR-32)
- Gusti, mirni prikazi, tabele sa ljepljivim zaglavljem. Isti vizuelni jezik, manje dekoracije.

### 6.8 Okvir aplikacije
- Prozirna gornja traka (desktop) i donja traka sa karticama (telefon), sa navigacijom po ulozi.
- Gost dobija „Prijava“ i „Napravite profil“.
- Broj sačuvanih stavki je na kartici „Sačuvano“.
- Postoji stranica 404 sa putem nazad, umjesto tihog preusmjeravanja.
- Naziv brenda je na **jednom mjestu** (`core/brand.ts`), jer se ime platforme još bira.

## 7. Tehnička ograničenja

- Angular 22: standalone komponente, signali, `ChangeDetectionStrategy.OnPush`, novi control flow (`@if`, `@for`), `input()` i `output()`, lazy rute.
- **Bez novih UI biblioteka.** Postoje vlastite komponente i spring biblioteka. Nova zavisnost samo uz jasan razlog (npr. test runner).
- Stil koda: isti kao okolni kod (komentari na bosanskom, kratki, objašnjavaju *zašto*). Inline template i stilovi u komponenti, a zajedničko ide u `styles/`.
- Početni bundle ostaje ispod budžeta iz `angular.json`. Svaki novi ekran je lazy.
- Nijedna postojeća funkcija se ne smije pokvariti. Backend API se ne mijenja; ono što fali bilježi se kao zahtjev za backend.
- Lokalno čuvanje (`localStorage`) uvijek ide u `try/catch` i aplikacija radi i bez njega.

## 8. Šta ne raditi

- Generičke „AI“ dizajn klišeje: ljubičasti gradijenti, emoji kao ikone, staklo na staklu, konfete.
- `ease-in` za ulazne animacije, bounce na elementima koji nisu bačeni gestom, animacije duže od ~400 ms za UI.
- Lažne podatke koji izgledaju stvarno (izmišljene recenzije, „500+ salona“ bez osnova).
- Tvrdnje u UI-ju koje backend ne podržava.

## 9. Proces

1. Pročitaj izvore iz sekcije 2 i napiši kratak plan (koji fajlovi, koji FR).
2. Implementiraj u malim, logičnim commitovima, sa porukama na bosanskom.
3. Poslije svake veće cjeline pokreni `npm run build`, popravi greške i upozorenja i provjeri budžet.
4. Pregledaj ekrane na **390×844 (telefon) i 1366×900 (desktop), u svijetloj i tamnoj temi**: Playwright screenshot uz mock API ako backend nije pokrenut. Popravi sve što izgleda slučajno.
5. Sam sebi uradi kritičku reviziju diffa: šta bi vlasnik salona bez tehničkog znanja zapeo? Šta bi pokvarilo reduced-motion? Šta puca na uskom ekranu?

## 10. Kriteriji prihvatanja

- Build prolazi bez grešaka, a bundle je u budžetu.
- Svaki ekran iz sekcije 6 radi na telefonu i desktopu, u obje teme.
- Reduced motion: nema pomjeranja, samo pretapanje.
- Tastatura: sve je dostupno, fokus je vidljiv, `Esc` zatvara sheetove i menije.
- Nema grešaka u konzoli u normalnom toku.
- README frontenda je ažuriran: nove rute, funkcije i šta je lokalno, a šta na serveru.

## 11. Izvještaj na kraju

Na kraju napiši, na bosanskom:
1. **Šta je urađeno**, po ekranima, sa vezom na FR brojeve.
2. **Šta fali na backendu** da sve radi do kraja: endpoint, polje ili pravilo, sa obrazloženjem i prijedlogom oblika (ruta, request, response).
3. **Poznata ograničenja** i šta bi bio sljedeći korak.
