// Zamjena za EmailMessage iz "cloudflare:email" u testovima (vidi tests/setup.mjs).
export class EmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
