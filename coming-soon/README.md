# Svadbeno: coming soon stranica

Stranica "Uskoro" sa listom čekanja, dok se aplikacija ne objavi. Odvojena je od Angular frontenda i .NET backenda: jedan Cloudflare Worker služi statičnu stranicu iz `public/` i mali API, a prijave se čuvaju u D1 bazi.

## Šta radi

- Mladenci ili ponuđači ostave email (ponuđači i kategoriju i grad) i dobiju svoje mjesto na listi.
- Svako dobije link za preporuku (`/?ref=KOD`) i dugmad za WhatsApp, Viber i kopiranje linka. Na stranici vidi koliko se ljudi prijavilo preko njegovog linka.
- Brojač "Na listi već čeka..." se prikazuje tek kad lista dostigne `PRIKAZI_OD` prijava (zadano 30).
- Tim dobije obavijest u Telegram grupu za svaku novu prijavu (opciono).
- `/admin` pokazuje spisak, brojke i izvoz u Excel (CSV), uz brisanje adrese kad neko zatraži odjavu.
- Zaštita od spama: skriveno polje za botove, najviše 6 prijava sa iste IP adrese u 10 minuta (čuva se samo hash adrese, briše se nakon 24 sata) i opciono Cloudflare Turnstile.

## Struktura

```
coming-soon/
  public/            stranica: index.html, privatnost.html, 404.html, admin/, css/, js/, fonts/, img/, _headers
  src/worker.js      API (/api/prijava, /api/broj, /api/ja, /api/admin/*)
  src/lib.js         provjera podataka, kodovi, CSV
  migrations/        šema baze
  tests/             testovi za src/lib.js (npm test)
```

## Lokalno

```bash
cd coming-soon
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev            # http://localhost:8788, admin ključ: lokalni-kljuc
npm test
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

1. U `public/privatnost.html` zamijeniti `EMAIL_TIMA` stvarnom email adresom tima (dva mjesta).
2. U `public/index.html` u `og:image` upisati punu adresu slike kad domena bude poznata, npr. `https://domena.ba/img/og.jpg` (Facebook i Viber traže punu adresu).

### Telegram obavijesti (opciono)

1. U Telegramu otvoriti @BotFather, napraviti bota i kopirati token.
2. Dodati bota u grupu tima i poslati jednu poruku u grupu.
3. Otvoriti `https://api.telegram.org/bot<TOKEN>/getUpdates` i prepisati `chat.id` grupe.
4. `npx wrangler secret put TELEGRAM_BOT_TOKEN` i `npx wrangler secret put TELEGRAM_CHAT_ID`.

### Turnstile (opciono, ako krene spam)

U Cloudflare panelu napraviti Turnstile widget za domenu, javni ključ upisati u `wrangler.toml` kao `TURNSTILE_SITE_KEY`, a tajni sa `npx wrangler secret put TURNSTILE_SECRET`. Provjera je nevidljiva za većinu ljudi.

## Kad aplikacija bude spremna

Svi sa liste se izvezu iz `/admin` (CSV) i pošalje im se email o otvaranju. Domena se zatim prebaci na pravu aplikaciju.

## Slike u telefonu

Ekrani u telefonu (`public/img/ekran-*.webp`) su snimci prave aplikacije sa testnim podacima iz seeda. Kad aplikacija dobije prave ponuđače i fotografije, vrijedi ih ponovo uslikati (390 x 844, 2x) i smanjiti na 540 x 1169.
