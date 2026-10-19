/** Čitljiv link ponuđača: /ponudjaci/17-foto-trenutak (Id vodi, slug je za ljude i pretraživače). */
export function vendorLink(vendor: { id: number; slug?: string | null }): string[] {
  return ['/ponudjaci', vendor.slug ? `${vendor.id}-${vendor.slug}` : String(vendor.id)];
}

/** "17-foto-trenutak" ili "17" -> 17; sve ostalo -> null. */
export function vendorIdFromParam(param: string | null | undefined): number | null {
  const match = /^(\d+)(?:-|$)/.exec(param ?? '');
  return match ? Number(match[1]) : null;
}
