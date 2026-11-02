// Email timu za svaku novu prijavu: gotov MIME (text/plain + text/html) za Cloudflare send_email.
// Bez paketa: zaglavlja, base64 i HTML se slažu ručno. HTML je samo tabele i inline stilovi (Gmail, Outlook).

const BOJE = {
  pozadina: '#faf7f2', kartica: '#ffffff', tekst: '#1f1a17', siva: '#6e655c',
  akcent: '#8c2f39', blush: '#ebbcbf', sampanj: '#e6d4b5', linija: 'rgba(70,50,30,.12)'
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const ADMIN = 'https://svadbeno.com/admin';
const LOGO = 'https://svadbeno.com/img/logo.png';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// UTF-8 u base64 (radi i u Workeru i u Node-u, bez Buffer-a)
export function base64(tekst) {
  const bajti = new TextEncoder().encode(tekst);
  let bin = '';
  for (let i = 0; i < bajti.length; i += 0x8000) bin += String.fromCharCode(...bajti.subarray(i, i + 0x8000));
  return btoa(bin);
}

const lomi = (s, n = 76) => s.match(new RegExp('.{1,' + n + '}', 'g'))?.join('\r\n') ?? '';

// RFC 2047: =?UTF-8?B?...?=, više riječi ako je naslov dug (najviše 45 bajta po riječi, bez cijepanja slova)
export function kodirajNaslov(naslov) {
  const rijeci = [];
  let dio = '';
  for (const znak of naslov) {
    if (new TextEncoder().encode(dio + znak).length > 45) { rijeci.push(dio); dio = ''; }
    dio += znak;
  }
  if (dio) rijeci.push(dio);
  return rijeci.map((r) => '=?UTF-8?B?' + base64(r) + '?=').join('\r\n ');
}

// zaglavlje ne smije imati novi red (zaštita od ubacivanja zaglavlja)
const cisto = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

const broj = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// 2. 11. 2026. u 19:45, po sarajevskom vremenu
export function vrijemeBs(datum) {
  const d = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(datum).map((p) => [p.type, p.value]));
  return `${Number(d.day)}. ${Number(d.month)}. ${d.year}. u ${d.hour}:${d.minute}`;
}

export function naslovMaila(p, pozicija) {
  return 'Nova prijava #' + pozicija + ' · ' + (p.uloga === 'ponudjac' ? 'Ponuđač: ' + (p.kategorija || 'usluga') : 'Mladenci');
}

// Podaci za tabelu u mailu, isti redoslijed u HTML i tekst verziji.
function redovi({ prijava: p, pozicija, preporucio, vrijeme }) {
  const r = [['Uloga', p.uloga === 'ponudjac' ? 'Ponuđač' : 'Mladenci'], ['Email', p.email]];
  if (p.uloga === 'ponudjac') {
    r.push(['Usluge', p.kategorija || '–']);
    r.push(['Grad', p.grad || 'nije upisan']);
  }
  r.push(['Preporuka', p.ref ? 'Da, kod ' + p.ref + (preporucio ? ' (' + preporucio + ')' : '') : 'Ne']);
  r.push(['Mjesto na listi', '#' + pozicija]);
  r.push(['Vrijeme prijave', vrijemeBs(vrijeme)]);
  return r;
}

export function tekstMaila(podaci) {
  const { ukupno } = podaci;
  const sve = (ukupno.parovi || 0) + (ukupno.ponudjaci || 0);
  return [
    naslovMaila(podaci.prijava, podaci.pozicija),
    '',
    ...redovi(podaci).map(([k, v]) => k + ': ' + v),
    '',
    'Ukupno na listi: ' + broj(sve) + ' (mladenci ' + broj(ukupno.parovi) + ', ponuđači ' + broj(ukupno.ponudjaci) + ')',
    '',
    'Otvori spisak: ' + ADMIN,
    '',
    '--',
    'Ovaj mail je automatski poslan sa svadbeno.com kad se neko prijavi na listu čekanja.'
  ].join('\r\n');
}

export function htmlMaila(podaci) {
  const { prijava: p, pozicija, ukupno } = podaci;
  const ponudjac = p.uloga === 'ponudjac';
  const sve = (ukupno.parovi || 0) + (ukupno.ponudjaci || 0);
  const preheader = (ponudjac ? 'Ponuđač' : 'Mladenci') + ' · ' + p.email + ' · #' + pozicija + ' na listi';
  const pilula = `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${ponudjac ? BOJE.sampanj : BOJE.blush};color:${BOJE.tekst};font:600 13px/18px ${SANS};">${ponudjac ? 'Ponuđač' : 'Mladenci'}</span>`;

  const vrijednost = (k, v) => {
    if (k === 'Uloga') return pilula;
    if (k === 'Email') return `<a href="mailto:${esc(p.email)}" style="color:${BOJE.akcent};text-decoration:underline;word-break:break-all;">${esc(p.email)}</a>`;
    if (k === 'Mjesto na listi') return `<span style="font:600 17px/22px ${SERIF};color:${BOJE.akcent};">${esc(v)}</span>`;
    return esc(v);
  };
  const tabela = redovi(podaci).map(([k, v], i) => `
              <tr>
                <td valign="top" style="width:38%;padding:12px 12px 12px 0;${i ? `border-top:1px solid ${BOJE.linija};` : ''}font:14px/20px ${SANS};color:${BOJE.siva};">${esc(k)}</td>
                <td valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${BOJE.linija};` : ''}font:500 15px/21px ${SANS};color:${BOJE.tekst};">${vrijednost(k, v)}</td>
              </tr>`).join('');

  const stat = (naziv, n, sredina) => `
                <td align="center" valign="top" width="33%" style="padding:14px 6px;${sredina ? `border-left:1px solid ${BOJE.linija};border-right:1px solid ${BOJE.linija};` : ''}">
                  <div style="font:600 26px/30px ${SERIF};color:${BOJE.tekst};">${broj(n)}</div>
                  <div style="padding-top:4px;font:12px/16px ${SANS};color:${BOJE.siva};">${naziv}</div>
                </td>`;

  return `<!doctype html>
<html lang="bs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(naslovMaila(p, pozicija))}</title>
</head>
<body style="margin:0;padding:0;background:${BOJE.pozadina};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BOJE.pozadina};">${esc(preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BOJE.pozadina};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        <tr>
          <td align="center" style="padding:0 0 18px;">
            <a href="https://svadbeno.com" style="text-decoration:none;"><img src="${LOGO}" width="140" alt="Svadbeno" style="display:block;width:140px;max-width:140px;height:auto;border:0;font:600 24px ${SERIF};color:${BOJE.akcent};"></a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 0 26px;">
            <table role="presentation" width="120" cellpadding="0" cellspacing="0" border="0"><tr><td height="2" style="height:2px;line-height:2px;font-size:0;background:${BOJE.sampanj};">&nbsp;</td></tr></table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 8px 22px;">
            <div style="font:700 12px/16px ${SANS};letter-spacing:2px;text-transform:uppercase;color:${BOJE.siva};">Lista čekanja</div>
            <h1 style="margin:8px 0 0;font:400 30px/36px ${SERIF};color:${BOJE.tekst};">Nova prijava <span style="color:${BOJE.akcent};font-style:italic;">#${esc(pozicija)}</span></h1>
          </td>
        </tr>
        <tr>
          <td style="background:${BOJE.kartica};border:1px solid ${BOJE.linija};border-radius:18px;padding:22px 24px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tabela}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BOJE.kartica};border:1px solid ${BOJE.linija};border-radius:18px;">
              <tr>${stat('ukupno na listi', sve, false)}${stat('mladenci', ukupno.parovi, true)}${stat('ponuđači', ukupno.ponudjaci, false)}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${BOJE.akcent}" style="border-radius:14px;background:${BOJE.akcent};">
                  <a href="${ADMIN}" style="display:inline-block;padding:14px 30px;border-radius:14px;font:700 15px/20px ${SANS};color:#ffffff;text-decoration:none;">Otvori spisak</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:30px 16px 0;font:12px/18px ${SANS};color:${BOJE.siva};">
            Ovaj mail je automatski poslan sa svadbeno.com kad se neko prijavi na listu čekanja.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Gotov mail za EmailMessage.
 * podaci: { od, za, prijava: { email, uloga, kategorija, grad, ref }, pozicija, ukupno: { parovi, ponudjaci }, preporucio, vrijeme }
 */
export function napraviMail(podaci) {
  const naslov = naslovMaila(podaci.prijava, podaci.pozicija);
  const granica = 'svadbeno-' + crypto.randomUUID();
  const dio = (tip, sadrzaj) => [
    '--' + granica,
    'Content-Type: ' + tip + '; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lomi(base64(sadrzaj))
  ].join('\r\n');
  const raw = [
    'From: Svadbeno <' + cisto(podaci.od) + '>',
    'To: ' + cisto(podaci.za),
    'Reply-To: ' + cisto(podaci.prijava.email),
    'Subject: ' + kodirajNaslov(naslov),
    'Date: ' + podaci.vrijeme.toUTCString().replace(/GMT$/, '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@svadbeno.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + granica + '"',
    '',
    dio('text/plain', tekstMaila(podaci)),
    dio('text/html', htmlMaila(podaci)),
    '--' + granica + '--',
    ''
  ].join('\r\n');
  return { raw, naslov };
}
