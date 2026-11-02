# Svadbeno: coming soon stranica

Stranica "Uskoro" sa listom čekanja, dok se aplikacija ne objavi. Odvojena je od Angular frontenda i .NET backenda: jedan Cloudflare Worker služi statičnu stranicu iz `public/` i mali API, a prijave se čuvaju u D1 bazi.

## Šta radi

- Mladenci ili ponuđači ostave email (ponuđači i kategoriju i grad) i dobiju svoje mjesto na listi.
- Svako dobije link za preporuku (`/?ref=KOD`) i dugmad za WhatsApp, Viber i kopiranje linka. Na stranici vidi koliko se ljudi prijavilo preko njegovog linka.
- Ko se prijavi kao par dobije poruku "Pošaljite link nekome za koga mislite da mu je došlo vrijeme za svadbu". Ko otvori taj link (`/?ref=KOD&svadba=1`) iznad forme vidi poruku da mu je neko drag poslao link.
- Slagalica za preporuke: za svaku prijavu preko linka osoba dobije jedan od 9 dijelova loga; sa 9 dijelova se ispiše S. Broj čuva server (prijave sa `ref`), a šifra osobe je sačuvana u pregledniku, pa se slagalica vidi i kad se osoba vrati.
- Uvodna animacija loga (dijelovi se slože, ispiše se S, znak sleti u traku) prikazuje se jednom po posjeti; dodir je preskače. Dok se stranica lista, u pozadini se slaže slagalica. Sa uključenim "smanji pokrete" nema ni jednog ni drugog.
- Brojač "Na listi već čeka..." se prikazuje tek kad lista dostigne `PRIKAZI_OD` prijava (zadano 30).
- Tim dobije email na svadbeno@gmail.com za svaku novu prijavu (preko Cloudflare Email Routing, vidi ispod).
- `/admin` pokazuje spisak, brojke i izvoz u Excel (CSV), uz brisanje adrese kad neko zatraži odjavu.
- Zaštita od spama: skriveno polje za botove, najviše 6 prijava sa iste IP adrese u 10 minuta (čuva se samo hash adrese, briše se nakon 24 sata) i opciono Cloudflare Turnstile.

## Struktura

```
coming-soon/
  public/            stranica: index.html, privatnost.html, 404.html, admin/, css/, js/, fonts/, img/, _headers
  src/worker.js      API (/api/prijava, /api/broj, /api/ja, /api/admin/*)
  src/lib.js         provjera podataka, kodovi, CSV
  src/mail.js        email timu za novu prijavu (MIME, HTML i tekst)
  scripts/           npm run mail:primjer (primjer maila u mail-primjer.html)
  migrations/        šema baze
  tests/             testovi za src/lib.js, src/mail.js i worker (npm test)
```

## Lokalno

```bash
cd coming-soon
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev            # http://localhost:8788, admin ključ: lokalni-kljuc
npm test               # Node 22.15 ili noviji (koristi node:sqlite i module.registerHooks)
npm run mail:primjer   # mail-primjer.html: kako izgleda mail timu (otvoriti u pregledniku)
```

## Objava na Cloudflare

```bash
npx wrangler login
npx wrangler d1 create planiraj-uskoro      # dobijeni database_id upisati u wrangler.toml
npm run db:remote
npx wrangler secret put ADMIN_TOKEN         # dugačak nasumičan ključ za /admin
npx wrangler secret put IP_SOL              # bilo koji nasumičan tekst
npm run deploy
```

Domena se poveže u Cloudflare panelu: Workers & Pages, `planiraj-uskoro`, Settings, Domains & Routes.

### Prije objave obavezno

1. U `public/index.html` u `og:image` upisati punu adresu slike kad domena bude poznata, npr. `https://domena.ba/img/og.jpg` (Facebook i Viber traže punu adresu).

### Email obavijest za svaku prijavu

Za svaku novu prijavu worker pošalje mail na svadbeno@gmail.com sa adrese prijave@svadbeno.com (binding `MAIL` i `MAIL_FROM`/`MAIL_TO` u `wrangler.toml`). Mail ne ide kad se ista adresa prijavi ponovo ni za botove.

Prijave rade i bez ovoga: dok Email Routing nije uključen, mail samo ne stiže (greška je u logu workera, posjetilac je ne vidi).

Ovo radimo mi u Cloudflare panelu, kad domena svadbeno.com bude kupljena:

1. Domena svadbeno.com, Email, Email Routing, Enable. Cloudflare sam doda potrebne DNS zapise.
2. Destination addresses: dodati svadbeno@gmail.com i potvrditi link koji stigne na Gmail.
3. Routing rules: info@svadbeno.com prosljeđivati na svadbeno@gmail.com (da radi adresa sa stranice i iz izjave o privatnosti).
4. `npm run deploy`.
5. Test: prijaviti se na stranici sa nekom adresom i provjeriti Gmail. Prvi put pogledati i Spam; ako je mail tamo, označiti ga sa "Nije spam".

### Turnstile (opciono, ako krene spam)

U Cloudflare panelu napraviti Turnstile widget za domenu, javni ključ upisati u `wrangler.toml` kao `TURNSTILE_SITE_KEY`, a tajni sa `npx wrangler secret put TURNSTILE_SECRET`. Provjera je nevidljiva za većinu ljudi.

## Kad aplikacija bude spremna

Svi sa liste se izvezu iz `/admin` (CSV) i pošalje im se email o otvaranju. Domena se zatim prebaci na pravu aplikaciju.

## Slike u telefonu

Ekrani u telefonu (`public/img/ekran-*.webp`) su snimci prave aplikacije sa testnim podacima iz seeda. Kad aplikacija dobije prave ponuđače i fotografije, vrijedi ih ponovo uslikati (390 x 844, 2x) i smanjiti na 540 x 1169.
