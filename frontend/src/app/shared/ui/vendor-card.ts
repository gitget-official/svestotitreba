import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatPriceRange } from '../../core/format';
import { vendorLink } from '../../core/links';
import { Vendor } from '../../core/models';
import { Icon } from './icon';
import { SaveButton } from './save-button';

@Component({
  selector: 'app-vendor-card',
  imports: [RouterLink, Icon, SaveButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card-link" [routerLink]="link()">
      <div class="media">
        @if (cover(); as url) {
          <img [src]="url" [alt]="vendor().name" loading="lazy" decoding="async" />
        } @else {
          <div class="placeholder"><app-icon name="image" /></div>
        }
        @if (vendor().isFeatured) {
          <span class="badge badge-gold featured"><app-icon name="crown" /> Istaknuto</span>
        }
      </div>
      <div class="body">
        <div class="title-row">
          <h3 class="t-title-3">{{ vendor().name }}</h3>
          @if (vendor().averageRating; as rating) {
            <span class="rating"><app-icon name="star" [filled]="true" /> {{ rating.toFixed(1) }}</span>
          }
        </div>
        <p class="t-footnote muted meta">
          <app-icon name="map-pin" /> {{ vendor().cityName }}
          @if (vendor().categories.length) { · {{ vendor().categories.join(', ') }} }
        </p>
        <p class="price">{{ price() }}</p>
      </div>
    </a>
    @if (saveable()) {
      <!-- Izvan linka: dugme unutar linka nije ispravan HTML i zbunjuje čitače ekrana. -->
      <app-save-button class="save" [vendor]="vendor()" [floating]="true" />
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      container-type: inline-size;
    }

    .save {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
    }

    .card-link {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--bg-elevated);
      border: 1px solid var(--separator);
      box-shadow: var(--shadow-sm);
      color: inherit;
      transition:
        transform var(--dur-press) ease-out,
        box-shadow var(--dur-base) var(--ease-out);
    }

    .card-link:hover {
      box-shadow: var(--shadow-md);
    }

    // Miš: kartica se blago podigne; dodir: samo odziv na pritisak.
    @media (hover: hover) and (pointer: fine) {
      .card-link {
        transition:
          transform var(--dur-base) var(--ease-out),
          box-shadow var(--dur-base) var(--ease-out);
      }

      .card-link:hover {
        transform: translateY(-3px);
        box-shadow: var(--shadow-lg);
      }
    }

    // Odziv na pritisak, odmah.
    .card-link:active {
      transform: scale(0.98);
    }

    .media {
      position: relative;
      aspect-ratio: 4 / 3;
      background: var(--bg-sunken);
      overflow: hidden;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 600ms var(--ease-out);
    }

    .card-link:hover img {
      transform: scale(1.03);
    }

    .placeholder {
      display: grid;
      place-items: center;
      height: 100%;
      color: var(--text-tertiary);
    }

    .featured {
      position: absolute;
      top: var(--space-3);
      left: var(--space-3);
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-thin);
      backdrop-filter: var(--blur-thin);
    }

    .featured app-icon {
      width: 0.875rem;
      height: 0.875rem;
    }

    .body {
      display: grid;
      gap: 0.375rem;
      padding: var(--space-4);
    }

    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .rating {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      flex: none;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .rating app-icon {
      width: 0.875rem;
      height: 0.875rem;
      color: var(--gold);
    }

    .meta {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta app-icon {
      width: 0.875rem;
      height: 0.875rem;
      vertical-align: -2px;
    }

    .price {
      font-weight: 600;
      font-size: 0.9375rem;
    }

    // Uska kartica (dvije u redu na telefonu): manji tekst i razmaci, bez gubitka informacija.
    @container (max-width: 15rem) {
      .card-link {
        border-radius: var(--radius-md);
      }

      .body {
        gap: 0.25rem;
        padding: 0.625rem 0.75rem 0.75rem;
      }

      .title-row {
        flex-direction: column;
        gap: 0.125rem;
      }

      h3 {
        font-size: 0.9375rem;
        line-height: 1.25;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .rating {
        font-size: 0.75rem;
      }

      .meta {
        font-size: 0.75rem;
      }

      .price {
        font-size: 0.8125rem;
      }

      .featured {
        top: var(--space-2);
        left: var(--space-2);
        font-size: 0.6875rem;
        padding: 0.125rem 0.375rem;
      }

      .save {
        top: var(--space-2);
        right: var(--space-2);
        transform: scale(0.85);
        transform-origin: top right;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      img,
      .card-link:hover img {
        transition: none;
        transform: none;
      }
    }
  `,
})
export class VendorCard {
  readonly vendor = input.required<Vendor>();
  /** Srce za "Sačuvano" (isključeno npr. u pregledu salona). */
  readonly saveable = input(true);

  protected readonly link = computed(() => vendorLink(this.vendor()));

  protected readonly cover = computed(() => {
    const images = this.vendor().images;
    return (images.find((i) => i.isCover) ?? images[0])?.url ?? null;
  });

  protected readonly price = computed(() => formatPriceRange(this.vendor().priceFrom, this.vendor().priceTo));
}
