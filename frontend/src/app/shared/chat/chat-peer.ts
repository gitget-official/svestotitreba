import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatVendorRef } from '../../core/chat-store';
import { vendorLink } from '../../core/links';
import { Conversation } from '../../core/models';
import { Avatar } from '../ui/avatar';

/** Druga strana u razgovoru: salon (za mladence) ili mladenci (za salon). */
export interface ChatPeer {
  name: string;
  /** Logo salona; mladenci imaju avatar. */
  logoUrl: string | null;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  /** Stranica salona (samo kad mladenci gledaju razgovor). */
  link: string[] | null;
}

export function peerOf(c: Conversation, viewerIsVendor: boolean): ChatPeer {
  if (viewerIsVendor) {
    return {
      name: `${c.coupleFirstName} ${c.coupleLastName}`.trim(),
      logoUrl: null,
      avatarUrl: c.coupleAvatarUrl,
      firstName: c.coupleFirstName,
      lastName: c.coupleLastName,
      link: null,
    };
  }
  return vendorPeer({ id: c.vendorId, name: c.vendorName, slug: c.vendorSlug, logoUrl: c.vendorLogoUrl });
}

export function vendorPeer(v: ChatVendorRef): ChatPeer {
  const [first = '', second = ''] = v.name.split(/\s+/);
  return { name: v.name, logoUrl: v.logoUrl, avatarUrl: null, firstName: first, lastName: second, link: vendorLink(v) };
}

/** Logo salona ili avatar mladenaca (inicijali kad nema slike). */
@Component({
  selector: 'app-chat-peer-avatar',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (peer().logoUrl; as logo) {
      <img [src]="logo" alt="" loading="lazy" decoding="async" />
    } @else {
      <app-avatar [src]="peer().avatarUrl" [firstName]="peer().firstName" [lastName]="peer().lastName" />
    }
    @if (dot()) { <span class="dot" aria-hidden="true"></span> }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
    }

    img,
    app-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    img {
      object-fit: cover;
      background: var(--bg-elevated);
      box-shadow: inset 0 0 0 1px var(--separator);
    }

    .dot {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 2px var(--bg-elevated);
    }
  `,
})
export class ChatPeerAvatar {
  readonly peer = input.required<ChatPeer>();
  /** Tačka za nepročitano. */
  readonly dot = input(false);
}
