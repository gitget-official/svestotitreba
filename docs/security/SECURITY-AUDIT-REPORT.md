# Security audit report: Svadbeno / Planiraj

| | |
|---|---|
| Repository | gitget-official/svestotitreba |
| Audited source | `main` @ `6c5a1f8` (clean tree) |
| Fixes | branch `claude/brave-johnson-giewsk` |
| Date | 2026-11-21 |
| Method | Cloudflare [security-audit skill](https://github.com/cloudflare/security-audit-skill), **quick profile** |
| Standards checklist | [`security-compliance-checklist.xlsx`](security-compliance-checklist.xlsx): OWASP Top 10:2025, OWASP API Top 10:2023, OWASP ASVS 5.0, ISO/IEC 27001:2022 Annex A (all 93 controls), AI security |

## 1. Scope, method and limits

- **Scope:** `backend/` (ASP.NET Core API, services, EF Core model, e-mail, SignalR), `frontend/` (Angular SPA, prerender script), `.github/workflows/`, configuration files. Hosting, DNS, database server and the frontend host are not in the repository and were not tested.
- **Process:** reconnaissance and coverage-led hunting produced 18 coverage units (12 covered with no finding, 6 with candidates). Every candidate went to a **fresh, independent verifier agent** instructed to disprove it. The verifiers re-read each cited line and re-ran their own offline tests. Both skill validators pass (`validate-findings.cjs`, `validate-coverage-ledger.cjs`).
- **Execution boundary:** source review plus local tests only. Proof-of-concept tests ran against disposable copies in a network namespace with external network removed (loopback only), on SQLite in-memory with dummy accounts. **No live or deployed system was contacted.**
- **Partial pass:** the quick profile runs one hunting wave. Per the skill's own guidance, a single run finds roughly half of what repeated runs find. Re-run before major releases (see section 7).
- **Baseline before fixes:** backend 87/87 tests pass, `dotnet list package --vulnerable`: none; frontend `npm audit`: 0 production, 3 dev-only (Vite dev server, fast-uri, @angular/build).

## 2. Security posture

The code base is in good shape for its stage. Authorization is enforced in the service layer on the stored object (no IDOR found across 10 resource types), update DTOs block mass assignment, all SQL goes through EF Core, all user text in HTML e-mails and calendar files is encoded, uploads are content-sniffed and GUID-named, and Angular escaping is never bypassed with user data. The confirmed problems are almost all in **authentication lifecycle and deployment defaults**, not in request handling. The critical one would have handed admin access to anyone on the very first production start.

## 3. Confirmed findings

| ID | Severity | Title | Boundary | Observed result | Status |
|---|---|---|---|---|---|
| F-01 | **critical** | Shipped production configuration seeds an Admin account with a publicly documented password | Anonymous internet user to Admin | admin / Admin123! logged in as Admin on a fresh Production start; GET /api/users returned every user | Fixed on branch |
| F-02 | **medium** | Account pre-hijacking: Google sign-in links into a password account created by someone who never proved the e-mail | Anonymous attacker to another user's account | Attacker pre-registered the victim's e-mail; after the victim's Google sign-in the attacker's password returned the victim's phone number | Fixed on branch |
| F-03 | **low** | Password change and admin password reset do not revoke previously issued JWTs (valid up to 8 hours) | Holder of a stolen token keeps access after owner/admin recovery | Token issued before change-password and before an admin reset still returned 200 on /api/auth/me | Fixed on branch |
| F-04 | **low** | Salon accounts can store unlimited, never-reclaimed upload files on the API host disk | Self-registered vendor to shared server disk | Uploads were all kept and served although never referenced; no code deleted files | Fixed on branch |

Full trace, reproduction and severity reasoning: [FINDINGS-DETAIL.md](FINDINGS-DETAIL.md).

### F-01 · Shipped production configuration seeds an Admin account with a publicly documented password

- **Where:** `backend/Planiraj.API/Controllers/AuthController.cs:71`, `backend/Planiraj.Services/Services/AuthService.cs:36`, `backend/Planiraj.Services/Services/AuthService.cs:38`, `backend/Planiraj.Services/Seed/DbSeeder.cs:265`, `backend/Planiraj.API/Controllers/AuthController.cs:117`, `backend/Planiraj.API/Auth/AuthInfrastructure.cs:66`
- **Who can exploit it:** Anonymous internet user with no account who has read the public README.
- **Conditions:** None. The attacker is an anonymous network client of the API.; The API runs with the shipped appsettings.json and Seed__Enabled=false is not set. This is the default: no production-specific configuration file exists, and the README's production notes do not mention seeding.; The database had no users at the first start while seeding was enabled, which is normal for a new deployment. The seeded accounts remain even if seeding is disabled later.; The operator has not changed or removed the seeded admin password. Nothing in the code or docs requires them to.
- **Result (reproduced offline):** Verifier test VerifySeed_ShippedProductionConfig ran on a scratch copy in a network-less namespace with an empty in-memory SQLite database. The environment was Production, and the test did not set Seed:Enabled; its effective value True came from "JsonConfigurationProvider for 'appsettings.json'", and no Development file was loaded. Anonymous POST /api/auth/login with admin/Admin123! returned 200 with user.role=Admin and mustChangePassword=false. GET /api/users with that token returned 200 with totalCount=3. The same request without a token returned 401. Controls: with Seed:Enabled=false the same login returned 401; with appsettings.json removed (key absent) it returned 200. All 3 tests passed.
- **Why critical:** likelihood high (The only requirements are that a deployment kept the shipped defaults on its first start and that nobody changed the admin password afterwards. That is the default path: the base file enables seeding, the seeder is the only bootstrap for an Admin account and for reference data, the production notes never mention seeding, and nothing forces a password change. The credentials appear in both READMEs. Whether any specific live deployment overrode these defaults was not checked.); impact critical (An unauthenticated actor gets full Admin authority. They can read every user's e-mail and phone number and all bookings, and set a new password on any account (UserService.cs:107) and then log in as that user. They can also create more Admin users, change vendor ownership and moderate reviews.)
- **Fix on branch:** Seed:Enabled defaults to false and is ignored outside Development (only appsettings.Development.json enables demo data). Production seeds only cities, categories and plans (DbSeeder.SeedReferenceDataAsync). The first admin comes from Bootstrap__AdminUsername/Email/Password secrets (at least 12 characters, not a demo password, MustChangePassword=true) and only while no admin exists. At startup outside Development, the API logs a critical warning for any active demo account that still has its public password.
- **Regression tests:** ProductionSeedTests, ProductionBootstrapTests, StartupGuardTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

### F-02 · Account pre-hijacking: Google sign-in links into a password account created by someone who never proved the e-mail

- **Where:** `backend/Planiraj.API/Controllers/AuthController.cs:84`, `backend/Planiraj.Services/Services/AuthService.cs:68`, `backend/Planiraj.API/Controllers/AuthController.cs:39`, `backend/Planiraj.Services/Services/AuthService.cs:103`, `backend/Planiraj.Services/Services/AuthService.cs:112`, `backend/Planiraj.Services/Services/AuthService.cs:122`
- **Who can exploit it:** Anonymous attacker who knows or guesses the victim's e-mail address before the victim joins.
- **Conditions:** Attacker registers the victim's e-mail address via /api/auth/register before the victim has any account on the platform.; Victim later signs in or signs up with Google using that address (the only sign-up path the frontend offers).; Google sign-in is configured (Google:ClientId set); otherwise /api/auth/google returns 503.
- **Result (reproduced offline):** Register returned 200 with user id 5 and e-mail normalized to vprh-zrtva@gmail.com. The victim's Google login returned isNew=false, id 5, hasPassword=true, username vprh-napadac. The victim's change-password attempt returned 400. The attacker's password login (username and e-mail) returned id 5 and GET /api/auth/me returned phoneNumber +387 61 000 111; the register-time JWT still returned 200 after the link. Control login returned isNew=true, hasPassword=false. 2/2 tests passed in a network-less namespace (unshare -n, loopback only).
- **Why medium:** likelihood low (The attacker must know the victim's address and register it before the victim joins (auth endpoints are limited to 10 requests/min per IP); once that happens, the victim's Google sign-in is the expected path.); impact high (Persistent read/write access as the victim's user id to their PII, bookings, chats, plan and reviews, including account deletion, which the victim cannot revoke.)
- **Fix on branch:** When a Google identity is linked to an existing Couple account (self-registration never verified the e-mail), the unproven password is cleared and the security stamp rotated, so the attacker's password and earlier tokens stop working. Admin-created vendor accounts keep their documented linking behaviour. Still open: e-mail verification for /api/auth/register.
- **Regression tests:** GooglePreHijackTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

### F-03 · Password change and admin password reset do not revoke previously issued JWTs (valid up to 8 hours)

- **Where:** `backend/Planiraj.API/Controllers/AuthController.cs:92`, `backend/Planiraj.API/Program.cs:88`, `backend/Planiraj.API/Program.cs:108`, `backend/Planiraj.Services/Services/AuthService.cs:270`, `backend/Planiraj.Services/Services/AuthService.cs:188`
- **Who can exploit it:** Someone holding a bearer JWT issued to the victim account before the victim (or an admin) changed its password, without knowing the new password.
- **Conditions:** The attacker already holds a bearer token issued to the victim before the change, for example from a shared or stolen device's localStorage, from XSS, or from a log that captured the SignalR access_token query parameter.; The victim account stays active and not deleted. Admin deactivation and couple self-deletion do revoke the token immediately.; Access lasts only until that token's original exp: 480 minutes after it was issued plus 1 minute of clock skew. There is no refresh endpoint, so the attacker cannot extend it.; Jwt:ExpiresMinutes is left at the shipped 480. A deployment that overrides it changes the length of the window but not the defect.
- **Result (reproduced offline):** In a network-less sandbox with the in-memory SQLite API, all 3 verifier tests passed. change-password returned 204. Login with the old password returned 401 and with the new password 200. Token A then got 200 on GET /api/auth/me (username mladenci) and 200 on PUT /api/auth/me. Token A's own change-password attempt with the old password got 400. The admin reset PUT /api/users/2 returned 200, and login with salon's old password returned 401. The salon token issued before the reset then got 200 on GET /api/auth/me (mustChangePassword=true) and 200 on GET /api/bookings. Control: after admin deactivation of user 3, that user's earlier token got 401 on GET /api/auth/me.
- **Why low:** likelihood low (The attacker must already have stolen a valid bearer token for the victim, and the account must be one whose owner or admin reacts by changing the password.); impact medium (This defeats the main recovery action for one account. The attacker keeps full read and write access (PII, profile, bookings, chat, and salon management for vendors) after the owner's change or the admin's reset, for the rest of the token's 8-hour life. The blast radius is one account for a bounded time, and admin deactivation still works as a revocation path.)
- **Fix on branch:** New User.SecurityStamp column (migration AddUserSecurityStamp), emitted as the 'sst' JWT claim and compared on every request in OnTokenValidated. It rotates on any password set (change, admin reset, registration), on admin role or active-flag changes, and on Google linking. POST /api/auth/change-password returns a fresh session that the frontend stores, so only other sessions are logged out. The SignalR hub closes sockets when the token expires.
- **Regression tests:** TokenRevocationTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

### F-04 · Salon accounts can store unlimited, never-reclaimed upload files on the API host disk

- **Where:** `backend/Planiraj.API/Controllers/AuthController.cs:49`, `backend/Planiraj.Services/Services/AuthService.cs:134`, `backend/Planiraj.Services/Services/VendorService.cs:151`, `backend/Planiraj.API/Controllers/UploadsController.cs:26`, `backend/Planiraj.API/Uploads/FileStorage.cs:31`
- **Who can exploit it:** Internet user with a free Google account (verified e-mail), acting as a newly self-registered salon.
- **Conditions:** Attacker needs a Vendor account that owns a salon: any verified Google account via the salon sign-in page, or any admin-provisioned vendor account.; Google:ClientId must be configured for self-registration (shipped empty, endpoint returns 503 until set); the README documents Google as the salon sign-up path.; Uploads:Root is on finite local disk of the API host; disk size sets time to exhaustion, and whether logs, temp files or a database share that filesystem sets collateral impact.
- **Result (reproduced offline):** Offline xUnit run (network namespace with loopback only, SQLite, temp UploadRoot) with the shipped rate-limit defaults enabled (120/min per user, 10/min auth): a second salon for the same account returned 400; 6 uploads all returned 200, leaving 6 files on disk (70 bytes each) while the gallery totalCount was 0; an unreferenced file was served to an anonymous GET with 200; attaching one upload and deleting the gallery row returned 204 but the folder still held 6 files and the URL still served 200; after the admin unpublished the salon an upload still returned 200 (7 files); after the admin deactivated the user the upload returned 401 and the 7 files remained; a second Google account created its own salon and stored 2 more (9 total); a Couple account got 403. Disk exhaustion was not exercised.
- **Why low:** likelihood low (Free Google accounts and a simple script suffice once Google sign-in is enabled, but every stored byte must be uploaded (at most 5 MB per request, 120 requests per minute per account) over a sustained period, and the abuse is tied to a visible salon and its own folder.); impact medium (Persistent shared-disk consumption with no automatic reclamation: once the uploads filesystem is full, every salon's uploads fail, and anything else on that filesystem can fail too. There is no confidentiality or integrity effect, and recovery is straightforward (deactivate the user, delete vendors/{id}).)
- **Fix on branch:** Per-salon quota Uploads:MaxFilesPerVendor (default 100). When it is reached, files older than Uploads:OrphanGraceMinutes (default 60) that no gallery image or logo references are deleted first, and the upload is refused if the salon is still full. A dedicated upload rate limit applies (RateLimit:UploadPermitPerMinute, default 20/min). Still open: delete a file immediately when its gallery image is removed, and put uploads on a dedicated volume or object storage with disk monitoring.
- **Regression tests:** UploadQuotaTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

## 4. Needs validation (owner check, no severity)

| ID | Lead | Exact blocker | What to check |
|---|---|---|---|
| NV-01 | Login brute-force limit can be bypassed or turned into a global lockout depending on proxy configuration | The production RateLimit:TrustForwardedHeaders value is not in the repository. The hosting topology is not in the repository: whether a reverse proxy, CDN or PaaS front end sits in front of Kestrel, how many proxy hops append to X-Forwarded-For, and whether the Kestrel port or origin hostname can be reached from the internet without passing through the proxy. | Decide hosting topology. Behind one appending reverse proxy with the API not directly reachable, set RateLimit__TrustForwardedHeaders=true; ideally pin KnownProxies/KnownIPNetworks to the proxy instead of trusting any peer. Add a per-account failed-login limit. |

Details and step-by-step checks: [NEEDS-VALIDATION.md](NEEDS-VALIDATION.md).

## 5. Rejected by verification

- `frontend-missing-frame-ancestors-and-csp`: No Content-Security-Policy, frame-ancestors or HSTS is defined for the SPA; clickjacking of account actions depends on hosting headers. **Rejected:** Source plus a bounded local browser check refute the claimed consequence, so this is a hardening note. The only credential is a bearer JWT in localStorage (auth.ts:148/157, attached by the interceptor at 179); there are no auth cookies. Current browsers partition third-party storage by top-level site (Chrome/Edge 115+, Firefox Total Cookie Protection, Safari), so a cross-site frame of the SPA starts with empty storage, is logged out, and authGuard sends /profil to /prijava. Delete account and booking cancel use an in-page sheet, not native confirm(), so they would be click-completable in a frame, but not with the victim's session. Local observation: in headless Chrome for Testing 153 on loopback only (external DNS blocked), a localStorage value set first-party on http://localhost was visible to a same-origin frame but read as null in the same page framed by cross-site http://127.0.0.1. The remaining routes need the victim to sign in inside the attacker's frame (typing a password, or a Google sign-in with Google's own visible account chooser) and only lead to them deleting their own data, which is not framing of an existing session. No same-site attacker page exists: uploads are magic-byte-checked jpg/png/webp with nosniff. The XSS/CSP part depends on an XSS that has not been found. HSTS, Referrer-Policy and Permissions-Policy have no named consequence. Hardening note: send Content-Security-Policy frame-ancestors 'none' (or X-Frame-Options DENY), HSTS, nosniff and Referrer-Policy from the frontend host, and a CSP with a hash for the index.html:19 inline script.

## 6. Hardening notes (not vulnerabilities today)

- Pin actions to commit SHAs and add 'permissions: contents: read'.
- Run npm audit fix: vite 8.3.0-8.3.2 (dev server) and fast-uri advisories.
- Double-booking race: EnsureSlotAvailableAsync then SaveChanges is non-atomic; add a filtered unique index on (VendorId, EventDate, StartTime) WHERE Status=Confirmed.
- Set HubOptions/endpoint CloseOnAuthenticationExpiration so long-lived sockets end when the token expires or account is disabled.
- access_token travels in the hub URL; make sure the reverse proxy does not log query strings.
- appsettings.Development.json commits a JWT key; refuse to start outside Development if Jwt:Key equals that value.
- VendorImage.Url and Vendor.LogoUrl accept any string; restrict to the uploads base URL to stop third-party tracking images.
- Re-encode or strip EXIF metadata from uploaded photos.
- Connection string uses TrustServerCertificate=True; production should use Encrypt=True with a validated certificate.
- Raise PBKDF2 iterations toward OWASP 2023 guidance (600k for SHA-256) with rehash-on-login.
- Password policy is length>=8 only; add a breached-password check and per-account throttling.
- frontend/scripts/prerender.mjs uses String.replace with a string replacement containing vendor data; '$`'/"$'" sequences are interpreted. Use a function replacer.
- Deleting a vendor does not delete its uploaded files from disk.
- Any future XSS would read the 8-hour JWT; add a strict CSP and consider shorter tokens + refresh, or HttpOnly cookie sessions.
- Restrict authInterceptor to requests whose URL starts with environment.apiUrl.
- Frontend host should send CSP (frame-ancestors 'none'), HSTS, nosniff, Referrer-Policy; verifier rejected the clickjacking impact because the session is a partitioned localStorage bearer token.

**Applied on this branch as hardening:** HSTS and security headers on every API response (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and in production `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`); the API refuses to start outside Development with the committed development JWT key; SignalR closes sockets when the token expires; the frontend sends the bearer token only to `/api/...`; CI token limited to `contents: read`; Dependabot for npm, NuGet and GitHub Actions; `npm audit` now reports 0 vulnerabilities (Vite 8.3.8, fast-uri 3.1.9, @angular/build 22.3.0).

**Positive patterns worth keeping:** service-layer ownership checks on the tracked entity; DTO allow-lists; `PublicRead` convention that only opens `Get`/`GetById`; per-request account check in `OnTokenValidated`; e-mail outbox with recipient policy and 30-day PII retention; account deletion that anonymizes instead of orphaning; uploads named by GUID with magic-byte sniffing and `nosniff`.

## 7. Coverage

- Ledger: **18 units**: 12 covered with no finding, 6 with candidates, 0 blocked, 0 deferred.
- Covered attack classes: access control (IDOR, function-level, mass assignment), injection (SQL, DOM/XSS, e-mail/ICS, XML, prerender), JWT verification, Google OIDC token validation and account linking, session invalidation, CORS, cross-site WebSocket, browser storage, file handling (path traversal, SSRF, deserialization), secrets and cryptography, CI/supply chain, data deletion and retention, resource quotas, forwarded-header trust, clickjacking.
- **Excluded:** AI/LLM classes (no model integration in source; AI planning is a Phase 4 TODO, so the blog's AI items are recorded as Phase 4 requirements in the checklist's *AI Security* sheet), native/memory safety, desktop/mobile/IPC, brokers/RPC, infrastructure-as-code (none in repo).
- **Not covered by this run:** live deployment configuration, the database server, the frontend host's headers, and a second hunting wave. Re-run this audit after deploying and before adding AI planning.

## 8. Before going live: checklist

1. Deploy with `ASPNETCORE_ENVIRONMENT=Production` and set `Jwt__Key`, `ConnectionStrings__PlanirajDb` (`Encrypt=True;TrustServerCertificate=False`), `Email__Smtp__Password` and the three `Bootstrap__Admin*` values as secrets (see backend README, *Produkcija*).
2. Resolve **NV-01**: decide the proxy topology, then set `RateLimit__TrustForwardedHeaders` accordingly and make sure the API port is not reachable except through the proxy.
3. Configure the frontend host to send CSP (with a hash for the inline script in `index.html`), `frame-ancestors 'none'`, HSTS, `nosniff` and `Referrer-Policy`.
4. Back up the database **and** `Uploads:Root`; monitor disk space, 5xx and 429 rates.
5. Next code items: e-mail verification for self-registration, MFA for admins, security-event logging (failed logins, admin changes), a cleanup job that deletes unreferenced upload files immediately, and a filtered unique index for confirmed booking slots.

## Audit artifacts

- `audit-run-1/findings.json`: verified records (schema of the security-audit skill)
- `audit-run-1/coverage-ledger.json`: coverage claim per surface, boundary and attack class. Its `agents/...` artifact paths refer to the auditor's run directory and are not stored in the repository.
- `audit-run-1/architecture.md`: architecture and trust-boundary summary used for hunting
