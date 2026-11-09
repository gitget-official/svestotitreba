import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';

export interface SeoData {
  description: string;
  /** Putanja stranice (npr. /ponudjaci/6-sala-panorama), za kanonski link i og:url. */
  path: string;
  image?: string | null;
  /** Strukturirani podaci (schema.org) za pretraživače. */
  jsonLd?: object | null;
}

/**
 * Meta podaci stranice za pretraživače i dijeljenje (opis, Open Graph, kanonski link, JSON-LD).
 * Naslov postavlja BrandTitleStrategy ili sama stranica. Isti podaci se pri buildu upisuju i u statične
 * stranice (scripts/prerender.mjs), da ih pretraživač vidi i prije nego što se aplikacija pokrene.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly defaults = {
    description: this.meta.getTag('name="description"')?.content ?? '',
    ogDescription: this.meta.getTag('property="og:description"')?.content ?? '',
  };

  set(data: SeoData): void {
    const url = this.doc.location.origin + data.path;
    this.meta.updateTag({ name: 'description', content: data.description });
    this.meta.updateTag({ property: 'og:description', content: data.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    if (data.image) this.meta.updateTag({ property: 'og:image', content: data.image });
    else this.meta.removeTag('property="og:image"');
    this.link().href = url;
    const script = this.jsonLd();
    if (data.jsonLd) script.textContent = JSON.stringify(data.jsonLd);
    else script.remove();
  }

  /** Vraća opće podatke sa index.html (kad korisnik napusti stranicu ponuđača). */
  reset(): void {
    this.meta.updateTag({ name: 'description', content: this.defaults.description });
    this.meta.updateTag({ property: 'og:description', content: this.defaults.ogDescription });
    this.meta.removeTag('property="og:url"');
    this.meta.removeTag('property="og:image"');
    this.doc.head.querySelector('link[rel="canonical"]')?.remove();
    this.doc.head.querySelector('script[type="application/ld+json"]')?.remove();
  }

  private link(): HTMLLinkElement {
    let el = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) {
      el = this.doc.createElement('link');
      el.rel = 'canonical';
      this.doc.head.appendChild(el);
    }
    return el;
  }

  private jsonLd(): HTMLScriptElement {
    let el = this.doc.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (!el) {
      el = this.doc.createElement('script');
      el.type = 'application/ld+json';
      this.doc.head.appendChild(el);
    }
    return el;
  }
}

/** schema.org LocalBusiness za stranicu ponuđača; ista pravila kao u scripts/prerender.mjs. */
export function vendorJsonLd(
  v: {
    name: string;
    description: string | null;
    phoneNumber: string | null;
    email: string | null;
    address: string | null;
    cityName: string | null;
    latitude: number | null;
    longitude: number | null;
    priceFrom: number | null;
    priceTo: number | null;
    averageRating: number | null;
    reviewCount: number;
    website: string | null;
    instagramUrl: string | null;
    facebookUrl: string | null;
    tikTokUrl: string | null;
  },
  url: string,
  image: string | null,
): object {
  const km = (n: number) => `${Math.round(n).toLocaleString('bs-BA')} KM`;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: v.name,
    description: v.description || undefined,
    url,
    image: image || undefined,
    telephone: v.phoneNumber || undefined,
    email: v.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: v.address || undefined,
      addressLocality: v.cityName || undefined,
      addressCountry: 'BA',
    },
    geo:
      v.latitude != null && v.longitude != null
        ? { '@type': 'GeoCoordinates', latitude: v.latitude, longitude: v.longitude }
        : undefined,
    priceRange:
      v.priceFrom != null ? `${km(v.priceFrom)} - ${km(v.priceTo ?? v.priceFrom)}` : undefined,
    aggregateRating:
      v.reviewCount > 0 && v.averageRating != null
        ? { '@type': 'AggregateRating', ratingValue: v.averageRating, reviewCount: v.reviewCount }
        : undefined,
    sameAs: [v.website, v.instagramUrl, v.facebookUrl, v.tikTokUrl].filter(Boolean),
  };
}
