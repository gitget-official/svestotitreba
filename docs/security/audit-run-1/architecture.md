# Architecture — gitget-official/svestotitreba @ 6c5a1f8 (clean)

## 1. Product, principals, protected resources
Wedding-planning marketplace for Bosnia and Herzegovina ("Svadbeno"/"Planiraj"). Principals:
- **Guest** (anonymous): reads active vendors, offerings, images, working hours, approved reviews, map points, sitemap; can register (Couple) or sign in with Google.
- **Couple**: self-registered (password, no e-mail verification) or Google. Favorites, saved plan, reviews (moderated), bookings, chat with vendors, delete own account.
- **Vendor**: created by admin (password, must change on first login) or self-registered via Google on the salon page. Creates one salon, which is published immediately. Manages own offerings, images, hours, bookings, and replies to chat.
- **Admin**: seeded or created by admin; full CRUD, moderation, vendor ownership/subscriptions; no chat access.
Protected resources: user PII (e-mail, phone, avatar), bookings (with couple contact data), private chat, unmoderated reviews, admin authority, server disk/DB.

## 2. Comparable baseline
No source-grounded comparable; omitted.

## 3. Stack and deployment
Backend: ASP.NET Core (net10.0) Web API, EF Core SQL Server, Mapster, JWT bearer (HS256), Google.Apis.Auth, SignalR, MailKit outbox. Frontend: Angular SPA (standalone components), prerender script for SEO. No Dockerfile, IaC, reverse-proxy, or frontend-hosting config in the repo. CI: GitHub Actions build+test only. Offline tests: xUnit + WebApplicationFactory + SQLite in-memory (87 tests pass); local checks ran in a network-less namespace with loopback only.

## 4. Entry surfaces and key paths
- `/api/auth/*` (login, register, google, google/salon, me, change-password) → AuthService → Users table → TokenService JWT.
- Generic CRUD via BaseCRUDController → BaseCRUDService (`Adapt` request → entity, `AuthorizeWriteAsync`, `BeforeInsert/Update`) for users, cities, categories, plans, vendors, offerings, images, hours, reviews, bookings.
- `/api/uploads/vendors/{id}` → magic-byte sniff → LocalFileStorage (GUID file name) → static files at `/api/uploads`.
- `/api/conversations` + `/api/hubs/chat` (receive-only, token in query string).
- `/api/favorites`, `/api/plans/me` (per-user JSON ≤100 KB).
- Anonymous `/sitemap.xml`, `/api/vendors/map` (response-cached, public data only).
- Startup: `InitializeDatabaseAsync` → migrations → `DbSeeder.SeedAsync` when `Seed:Enabled` (default true in appsettings.json) and DB empty.
- E-mail outbox: HTML-encoded templates and ICS attachments carrying user-supplied names and notes.

## 5. Trust boundaries and strongest controls
- Authentication: JWT validation (issuer, audience, lifetime, key) plus a per-request `IsActiveAsync` DB check (`Program.cs` OnTokenValidated). There is no session or credential version.
- Authorization: service-layer owner/admin checks (`AccessRules.EnsureCanManageVendor`, per-service `AuthorizeRead/Write`); `[Authorize]` by default with `PublicRead` convention for Get/GetById only.
- Identity linking: Google ID token verified (`GoogleTokenValidator`); links to an existing account by e-mail when roles match.
- Abuse: fixed-window rate limits (global 120/min per user/IP, auth 10/min per IP, chat 30/min); client IP from the connection or from X-Forwarded-For when `TrustForwardedHeaders` is set (all proxies trusted).
- Output: Angular escaping; EmailBuilder `HtmlEncoder`; ICS escaping; XElement sitemap.
- Files: GUID names, fixed folder `vendors/{int}`, jpg/png/webp magic bytes, `nosniff`; no quota and no deletion.

## 6. Starting paths
backend/Planiraj.API/{Program.cs, Auth/, Controllers/, Uploads/, Chat/}, backend/Planiraj.Services/{Services/, Base/, Helpers/AccessRules.cs, Seed/DbSeeder.cs, Email/}, backend/Planiraj.Model/Requests/Requests.cs, frontend/src/app/{core/auth.ts, core/api.ts, pages/, shared/}, frontend/scripts/prerender.mjs, .github/workflows/ci.yml.

## 7. Prior coverage
No prior ledger or findings exist for this repository; this is run 1. Coverage is a quick-profile partial pass.

## 8. Companion selection
- WEB-PROTOCOL-AND-AUTH.md: JWT bearer, Google OIDC sign-in, account linking, password change, forwarded headers.
- CLIENT-SIDE.md: Angular SPA DOM rendering, localStorage token, SignalR WebSocket, CORS, framing.
- RESOURCE-EXHAUSTION-AND-AVAILABILITY.md: persistent file uploads by self-registered vendors.
- SUPPLY-CHAIN-AND-RELEASE.md: npm/NuGet lockfiles, GitHub Actions workflow.
- DATA-ISOLATION-AND-LIFECYCLE.md: account deletion and anonymization, e-mail retention.
- Excluded: AI-AND-LLM.md (no model integration in source), MEMORY-SAFETY, DESKTOP-MOBILE, PROTOCOLS-RPC (receive-only hub), CLOUD-AND-DEPLOYMENT (no infrastructure in repo; deployment facts are needs_validation).
