import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BRAND } from '../../core/brand';

/** Datum zadnje izmjene oba dokumenta. Promijeniti pri svakoj izmjeni teksta. */
const UPDATED = '9. novembar 2026.';

const STYLES = `
  .legal {
    max-width: 44rem;
  }
  .legal h1 {
    margin-bottom: var(--space-1);
  }
  .legal h2 {
    margin-top: var(--space-5);
    margin-bottom: var(--space-2);
  }
  .legal p,
  .legal li {
    line-height: 1.6;
  }
  .legal ul {
    padding-left: 1.2rem;
    display: grid;
    gap: var(--space-1);
  }
  .legal .updated {
    margin-bottom: var(--space-4);
  }
  .legal .other {
    margin-top: var(--space-6);
  }
`;

/** Uslovi korištenja glavne aplikacije (FR: pravni tekstovi). */
@Component({
  selector: 'app-terms',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="container page legal">
      <h1 class="t-title-1">Uslovi korištenja</h1>
      <p class="t-footnote muted updated">Zadnja izmjena: {{ updated }}</p>

      <p>
        Ovi uslovi važe za korištenje platforme {{ brand.name }}. Korištenjem stranice, a posebno
        pravljenjem profila, prihvatate ove uslove.
      </p>

      <h2 class="t-title-3">Šta je {{ brand.name }}</h2>
      <p>
        {{ brand.name }} je katalog usluga za vjenčanja (saloni, muzika, fotografi, torte i drugo)
        sa planerom budžeta. Ponudu možete pregledati bez prijave. Za čuvanje plana i liste
        "Sačuvano" na profilu, rezervacije i recenzije potreban je profil.
      </p>

      <h2 class="t-title-3">Profil</h2>
      <ul>
        <li>
          Profil za mladence pravi se prijavom preko Google naloga. Lozinku za {{ brand.name }} ne
          pravite.
        </li>
        <li>
          Saloni i drugi ponuđači se registruju sami, Google nalogom na stranici "Za salone", i sami
          postavljaju svoju stranicu. Na zahtjev salona stranicu možemo postaviti i mi.
        </li>
        <li>
          Odgovorni ste za tačnost podataka koje unesete (ime, telefon, grad) i za sve što se radi
          sa vašeg profila.
        </li>
        <li>
          Profil možemo privremeno ili trajno isključiti ako se koristi suprotno ovim uslovima.
        </li>
      </ul>

      <h2 class="t-title-3">Ponuda, cijene i rezervacije</h2>
      <ul>
        <li>
          Salon je odgovoran za tačnost opisa, cijena i kontakt podataka na svojoj stranici.
          Fotografije koje salon doda moraju biti njegove ili mora imati pravo da ih objavi.
        </li>
        <li>
          Stranicu salona koja je lažna, obmanjujuća ili krši tuđa prava možemo izmijeniti ili
          isključiti.
        </li>
        <li>
          Opise, slike i cijene unose ponuđači ili ih unosimo u dogovoru sa njima. Cijene su okvirne
          ("od do") i nisu ponuda.
        </li>
        <li>
          Zahtjev za termin šaljete direktno ponuđaču. Ugovor o usluzi sklapate sa ponuđačem, ne sa
          {{ brand.name }}. Mi nismo strana u tom dogovoru i ne naplaćujemo usluge ponuđača.
        </li>
        <li>Ponuđač termin potvrđuje ili odbija. Dok ga ne potvrdi, termin nije rezervisan.</li>
      </ul>

      <h2 class="t-title-3">Recenzije</h2>
      <ul>
        <li>Recenzija treba opisivati vaše stvarno iskustvo sa ponuđačem.</li>
        <li>Nisu dozvoljeni uvrede, govor mržnje, tuđi lični podaci, reklame i lažne recenzije.</li>
        <li>
          Recenzije pregledamo prije objave i možemo odbiti ili ukloniti one koje krše ova pravila.
        </li>
      </ul>

      <h2 class="t-title-3">Šta nije dozvoljeno</h2>
      <ul>
        <li>Lažno predstavljanje i pravljenje profila u tuđe ime.</li>
        <li>Automatsko prikupljanje sadržaja (scraping) i opterećivanje sistema.</li>
        <li>Pokušaji pristupa tuđim profilima ili dijelovima sistema za koje nemate pravo.</li>
      </ul>

      <h2 class="t-title-3">Odgovornost</h2>
      <p>
        Trudimo se da podaci budu tačni i da stranica radi bez prekida, ali to ne možemo
        garantovati. Ne odgovaramo za kvalitet usluge ponuđača ni za dogovore između vas i ponuđača.
      </p>

      <h2 class="t-title-3">Izmjene uslova</h2>
      <p>
        Uslove možemo mijenjati. Datum zadnje izmjene je na vrhu stranice. Za veće izmjene
        obavijestićemo vas na stranici.
      </p>

      <h2 class="t-title-3">Kontakt</h2>
      <p>
        Pitanja o ovim uslovima pošaljite na
        <a [href]="'mailto:' + brand.email">{{ brand.email }}</a
        >.
      </p>

      <p class="other t-callout">
        Kako postupamo sa vašim podacima piše u
        <a routerLink="/privatnost">politici privatnosti</a>.
      </p>
    </article>
  `,
  styles: STYLES,
})
export class Terms {
  protected readonly brand = BRAND;
  protected readonly updated = UPDATED;
}

/** Politika privatnosti: navodi samo podatke koje aplikacija stvarno čuva. */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="container page legal">
      <h1 class="t-title-1">Privatnost</h1>
      <p class="t-footnote muted updated">Zadnja izmjena: {{ updated }}</p>

      <p>
        Ovdje piše koje podatke {{ brand.name }} čuva, zašto i šta možete tražiti. Prikupljamo samo
        ono što treba da bi profil, plan i rezervacije radili.
      </p>

      <h2 class="t-title-3">Bez prijave</h2>
      <p>
        Ponudu možete pregledati bez profila. Tada ne čuvamo ništa o vama na serveru. Lista
        "Sačuvano" i plan čuvaju se samo u vašem pregledniku (local storage) i ostaju na tom
        uređaju. Ne koristimo reklamne kolačiće ni alate za praćenje.
      </p>

      <h2 class="t-title-3">Prijava preko Googlea</h2>
      <p>Kad se prijavite preko Googlea, od Googlea dobijamo i čuvamo:</p>
      <ul>
        <li>ime i prezime,</li>
        <li>e-mail adresu,</li>
        <li>Google identifikator naloga (broj po kojem vas prepoznajemo pri sljedećoj prijavi).</li>
      </ul>
      <p>
        Vašu Google lozinku nikad ne vidimo i ne dobijamo pristup drugim podacima sa vašeg Google
        naloga.
      </p>

      <h2 class="t-title-3">Podaci koje sami unesete</h2>
      <ul>
        <li>slika profila (jedna od ponuđenih ili vaša), grad i broj telefona, ako ih unesete,</li>
        <li>lista "Sačuvano" (ponuđači koje razmatrate),</li>
        <li>
          vaš plan: odgovori iz planera (budžet, grad, datum, broj gostiju) i izabrani ponuđači,
        </li>
        <li>zahtjevi za termin i njihova napomena,</li>
        <li>recenzije koje napišete (objavljuju se sa vašim imenom),</li>
        <li>datum pravljenja profila i zadnje prijave.</li>
      </ul>

      <h2 class="t-title-3">Zašto ih koristimo</h2>
      <ul>
        <li>da vas prepoznamo pri prijavi i prikažemo vaš profil,</li>
        <li>da vaš plan i "Sačuvano" budu isti na svakom uređaju,</li>
        <li>da ponuđač dobije vaš zahtjev za termin i može vas kontaktirati,</li>
        <li>da recenzije budu povezane sa stvarnim korisnikom.</li>
      </ul>
      <p>Vaše podatke ne prodajemo i ne dijelimo za reklame.</p>

      <h2 class="t-title-3">Saloni</h2>
      <p>
        Za nalog salona čuvamo iste podatke sa Google naloga (ime, e-mail, Google identifikator).
        Podaci koje salon unese na svoju stranicu (naziv, opis, adresa, telefon, e-mail, linkovi,
        usluge, cijene, radno vrijeme i fotografije) su javni, jer im je svrha da ih mladenci vide.
        Uploadovane fotografije čuvamo na našem serveru.
      </p>

      <h2 class="t-title-3">Ko vidi vaše podatke</h2>
      <ul>
        <li>
          Ponuđač kojem pošaljete zahtjev za termin vidi vaše ime, e-mail, telefon (ako ste ga
          unijeli) i napomenu uz taj zahtjev.
        </li>
        <li>Svi posjetioci vide objavljene recenzije sa vašim imenom.</li>
        <li>Administratori {{ brand.name }} vide podatke koji su potrebni za rad i podršku.</li>
      </ul>

      <h2 class="t-title-3">Vaša prava</h2>
      <ul>
        <li>
          Ime, sliku, grad i telefon možete promijeniti na stranici
          <a routerLink="/profil">Profil</a>.
        </li>
        <li>Plan i "Sačuvano" možete obrisati sami, u aplikaciji.</li>
        <li>
          Profil možete obrisati sami, na stranici <a routerLink="/profil">Profil</a> (dio "Brisanje
          profila"). Kopiju svojih podataka možete tražiti na
          <a [href]="'mailto:' + brand.email">{{ brand.email }}</a
          >, sa e-mail adrese profila.
        </li>
      </ul>

      <h2 class="t-title-3">Koliko dugo čuvamo podatke</h2>
      <p>
        Dok imate profil. Kad ga obrišete, odmah brišemo ime, e-mail, telefon, sliku, grad, vezu sa
        Google nalogom, plan i "Sačuvano". Budući zahtjevi za termin se otkazuju i ostaju kod
        ponuđača bez napomene i bez vaših podataka. Recenzije ostaju, potpisane kao "Obrisan
        korisnik".
      </p>

      <h2 class="t-title-3">Kontakt</h2>
      <p>
        Za sva pitanja o privatnosti: <a [href]="'mailto:' + brand.email">{{ brand.email }}</a
        >.
      </p>

      <p class="other t-callout">
        Pravila korištenja platforme su u <a routerLink="/uslovi">uslovima korištenja</a>.
      </p>
    </article>
  `,
  styles: STYLES,
})
export class Privacy {
  protected readonly brand = BRAND;
  protected readonly updated = UPDATED;
}
