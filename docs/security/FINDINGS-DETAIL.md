# Findings detail

Full source trace and offline reproduction for every confirmed finding. Generated from the independently verified records in `audit-run-1/findings.json`; the prose does not change any verdict or severity.

## F-01 · CRITICAL · Shipped production configuration seeds an Admin account with a publicly documented password

**Fingerprint:** `seed-enabled-default-publishes-admin-credentials`  
**Status:** Fixed on branch

appsettings.json is the base configuration file loaded in every environment, and it sets Seed:Enabled to true. Program.cs:211 also defaults the flag to true and does not check the environment. There is no appsettings.Production.json, and appsettings.Development.json does not change Seed. On the first start against an empty database, DbSeeder creates three accounts: admin/Admin123! (Admin), salon/Salon123! (Vendor) and mladenci/Mladenci123! (Couple). All three have MustChangePassword=false. The passwords are constants in DbSeeder.cs and are published in backend/README.md and frontend/README.md. The seeder is also the only place the code creates an Admin account or the cities, categories and plans the app needs. The README's production note mentions only Jwt:Key and the connection string. A deployment that keeps these defaults therefore has an Admin account that any anonymous user can log in to with the published password.

**Root cause.** Demo seeding is opt-out instead of opt-in. The base configuration used in production enables it, and the code has no environment check. The seeder creates privileged accounts with hard-coded, publicly documented passwords and does not force a password change. It is also the only bootstrap path for an Admin account and for reference data.

**Intended behaviour.** A production database must never contain accounts whose credentials are known outside the operator. Demo users and vendors should be seeded only when explicitly enabled in a Development or test environment. Any production bootstrap admin must use operator-supplied secret credentials and be forced to change them at first login.

### Source trace

| # | Kind | Location | Scope | What happens |
|---|---|---|---|---|
| 1 | entrypoint | `backend/Planiraj.API/Controllers/AuthController.cs:71` | AuthController.Login | [AllowAnonymous] POST /api/auth/login accepts {login, password} from any unauthenticated client. The only throttle is the auth rate limit of 10 requests per minute per IP. |
| 2 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:36` | AuthService.ValidateCredentialsAsync | Looks up the user by username or e-mail. The login 'admin' matches the seeded Admin row. |
| 3 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:38` | AuthService.ValidateCredentialsAsync | Checks the supplied password against the stored PBKDF2 hash. The check succeeds because the hash was derived from the public constant 'Admin123!'. |
| 4 | propagation | `backend/Planiraj.Services/Seed/DbSeeder.cs:265` | DbSeeder.SeedAsync | At startup the seeder created username 'admin' with UserRole.Admin and the AdminPassword constant. CreateUser hashes it at line 443. |
| 5 | propagation | `backend/Planiraj.API/Controllers/AuthController.cs:117` | AuthController.CreateAuthResponse | Issues a JWT for the matched user and returns it to the anonymous caller. |
| 6 | sink | `backend/Planiraj.API/Auth/AuthInfrastructure.cs:66` | TokenService.CreateToken | Signs the role claim 'Admin'. The API accepts it on every admin-only operation, for example GET /api/users (UserService.cs:28). |

### Evidence

- `backend/Planiraj.API/appsettings.json:48`: "Enabled": true under "Seed" in the base configuration. No appsettings.Production.json exists, and appsettings.Development.json does not override Seed.
- `backend/Planiraj.API/Program.cs:156`: InitializeDatabaseAsync runs on every start, before any request is served.
- `backend/Planiraj.API/Program.cs:211`: The seeding gate is GetValue("Seed:Enabled", true) with no IsDevelopment check. A missing key also seeds.
- `backend/Planiraj.Services/Seed/DbSeeder.cs:225`: The only skip condition is that a user row already exists, so any new database is seeded.
- `backend/Planiraj.Services/Seed/DbSeeder.cs:17`: public const string AdminPassword = "Admin123!". VendorPassword "Salon123!" and CouplePassword "Mladenci123!" are on lines 18-19.
- `backend/Planiraj.Services/Seed/DbSeeder.cs:440`: Seeded users get MustChangePassword = false, so neither the API nor the SPA guard (frontend/src/app/core/auth.ts:213) forces a password change.
- `backend/Planiraj.Services/Seed/DbSeeder.cs:231`: Cities, categories and subscription plans are created only here. The migrations contain no InsertData and the model has no HasData, so the seeder is the only bootstrap for reference data and for any Admin account.
- `backend/README.md:95`: Publishes Administrator admin / admin@planiraj.ba / Admin123!. Line 99 gives the exact login request.
- `backend/README.md:289`: The production note covers only Jwt:Key and the connection string, not seeding. Line 33 describes seeding an empty database as normal start behavior.
- `frontend/README.md:47`: Also publishes admin / Admin123!, salon / Salon123! and mladenci / Mladenci123!.
- `backend/Planiraj.Services/Services/UserService.cs:107`: An Admin can set a new password on any user with PUT /api/users/{id} (newPassword). Admin access therefore becomes takeover of any account.

### Conditions

- *authentication level*: None. The attacker is an anonymous network client of the API.
- *system configuration*: The API runs with the shipped appsettings.json and Seed__Enabled=false is not set. This is the default: no production-specific configuration file exists, and the README's production notes do not mention seeding.
- *data state*: The database had no users at the first start while seeding was enabled, which is normal for a new deployment. The seeded accounts remain even if seeding is disabled later.
- *data state*: The operator has not changed or removed the seeded admin password. Nothing in the code or docs requires them to.

### Bounded local reproduction

**Attacker:** Anonymous internet user with no account who has read the public README.

**Inputs:**

- `POST /api/auth/login {"login":"admin","password":"Admin123!"}`
- `GET /api/users?pageSize=100 with header Authorization: Bearer <token from the login response>`

**Steps:**

1. Start the API in the Production environment with the shipped appsettings.json, an operator-supplied Jwt:Key, and an empty database with migrations applied. Do not set Seed:Enabled anywhere.
2. Send the login payload without credentials.
3. Call GET /api/users with the returned token, then call it again without a token as a control.

**Observed result:** Verifier test VerifySeed_ShippedProductionConfig ran on a scratch copy in a network-less namespace with an empty in-memory SQLite database. The environment was Production, and the test did not set Seed:Enabled; its effective value True came from "JsonConfigurationProvider for 'appsettings.json'", and no Development file was loaded. Anonymous POST /api/auth/login with admin/Admin123! returned 200 with user.role=Admin and mustChangePassword=false. GET /api/users with that token returned 200 with totalCount=3. The same request without a token returned 401. Controls: with Seed:Enabled=false the same login returned 401; with appsettings.json removed (key absent) it returned 200. All 3 tests passed.

### Severity

- Likelihood **high**: The only requirements are that a deployment kept the shipped defaults on its first start and that nobody changed the admin password afterwards. That is the default path: the base file enables seeding, the seeder is the only bootstrap for an Admin account and for reference data, the production notes never mention seeding, and nothing forces a password change. The credentials appear in both READMEs. Whether any specific live deployment overrode these defaults was not checked.
- Impact **critical**: An unauthenticated actor gets full Admin authority. They can read every user's e-mail and phone number and all bookings, and set a new password on any account (UserService.cs:107) and then log in as that user. They can also create more Admin users, change vendor ownership and moderate reviews.
- Confidence **high**: The full source path was traced, and the result was reproduced independently offline in the Production environment, with the seed flag taken from the shipped appsettings.json. Negative (Seed:Enabled=false) and key-absent controls behave as the source predicts. The only unverified fact is the state of any real deployment, and it is stated as a condition.

### Remediation

Make seeding opt-in and limited to Development, and give production a separate, safe bootstrap. (1) Set Seed:Enabled to false in appsettings.json, change Program.cs:211 to GetValue("Seed:Enabled", false), and set it to true in appsettings.Development.json (the test ApiFactory already sets it). (2) In InitializeDatabaseAsync, do not create demo users or vendors unless app.Environment.IsDevelopment(); if seeding is requested elsewhere, log an error and skip or fail the start. (3) Split reference data (cities, categories, subscription plans) from demo users and vendors, so production can seed only reference data. (4) For the first production admin, read the username, e-mail and password from operator-supplied secrets (environment variables), refuse to start if they are missing or weak, and set MustChangePassword = true. (5) Mark the README credentials as local-development only and add Seed__Enabled=false to the production notes. (6) Any deployment that has already run the seeder must delete or reset the admin, salon and mladenci accounts, because changing the flag does not remove them. Add a regression test that a Production start with the shipped configuration creates no users.

**Applied on this branch:** Seed:Enabled defaults to false and is ignored outside Development (only appsettings.Development.json enables demo data). Production seeds only cities, categories and plans (DbSeeder.SeedReferenceDataAsync). The first admin comes from Bootstrap__AdminUsername/Email/Password secrets (at least 12 characters, not a demo password, MustChangePassword=true) and only while no admin exists. At startup outside Development, the API logs a critical warning for any active demo account that still has its public password.

**Regression tests:** ProductionSeedTests, ProductionBootstrapTests, StartupGuardTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

---

## F-02 · MEDIUM · Account pre-hijacking: Google sign-in links into a password account created by someone who never proved the e-mail

**Fingerprint:** `google-login-links-unverified-self-registered-account`  
**Status:** Fixed on branch

POST /api/auth/register is anonymous and accepts any e-mail address without proof of ownership, storing a caller-chosen password on a Couple row. When the real owner of that address later signs in with Google (the only sign-up path the Angular frontend offers), GoogleLoginAsync finds the existing Couple row by the identically normalized e-mail, attaches the Google subject and logs the victim into it with isNew=false. The pre-registered password (usable with the attacker's username or the victim's e-mail) and the attacker's register-time JWT stay valid, so the attacker authenticates as the same user id and can read and change whatever the victim later stores in that account (profile/phone, saved plan, favorites, bookings, vendor chats, reviews) or delete it. The victim cannot evict the attacker: change-password requires the current password and no reset flow exists. Nothing is sent to the victim's address; the only hints are an 'already have a profile' toast on the register page, attacker-chosen profile fields, and a password-change form shown because hasPassword is true.

**Root cause.** GoogleLoginAsync step 2 treats the e-mail column of a self-registered Couple account as proven ownership and links the verified Google identity to it, while leaving the unproven password credential and any JWTs issued from it in place (there is no credential/session version to rotate).

**Intended behaviour.** A verified Google identity may be linked only to an account whose existing credentials were set by the proven owner of that e-mail or by an administrator; when linking to a self-registered account whose e-mail was never verified, pre-existing credentials and sessions must be revoked at link time (or the link refused).

### Source trace

| # | Kind | Location | Scope | What happens |
|---|---|---|---|---|
| 1 | entrypoint | `backend/Planiraj.API/Controllers/AuthController.cs:84` | AuthController.Register | [AllowAnonymous] POST /api/auth/register; still mapped although the frontend register page now offers only Google sign-up. |
| 2 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:68` | AuthService.RegisterCoupleAsync | Stores the caller-chosen password on a Couple row for a Trim+ToLowerInvariant e-mail the caller never proved; no verification step or flag exists. |
| 3 | propagation | `backend/Planiraj.API/Controllers/AuthController.cs:39` | AuthController.Google | Victim later signs in with a valid, verified Google ID token on the anonymous Google endpoint. |
| 4 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:103` | AuthService.GoogleLoginAsync | No row carries the victim's GoogleId, so it falls back to lookup by the identically normalized e-mail and finds the attacker-created Couple row. |
| 5 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:112` | AuthService.GoogleLoginAsync | Roles match (Couple/Couple), so GoogleId is attached; PasswordHash/PasswordSalt are left untouched and no token or credential version is rotated. |
| 6 | sink | `backend/Planiraj.Services/Services/AuthService.cs:122` | AuthService.GoogleLoginAsync | Returns the attacker-created account to the victim with IsNew=false; the victim now works inside an account the attacker can still enter with the pre-registered password. |

### Evidence

- `backend/Planiraj.Services/Services/AuthService.cs:89`: Only the Google path requires a verified e-mail; RegisterCoupleAsync has no equivalent check.
- `backend/Planiraj.Services/Services/AuthService.cs:38`: Password login (by username or e-mail) still accepts the pre-registered password after the Google link.
- `backend/Planiraj.Services/Services/AuthService.cs:209`: ChangePasswordAsync requires the current password, so the linked victim cannot replace the attacker's password.
- `backend/README.md:52`: Password reset and e-mail verification are documented as not yet implemented, so the victim has no recovery path that evicts the attacker.
- `backend/Planiraj.API/Program.cs:108`: OnTokenValidated only checks IsActive; with no credential version, the attacker's register-time JWT (480-minute lifetime) remains valid after the link.
- `backend/README.md:65`: Same-role same-e-mail linking is intentional; the documented rationale (line 66) is admin-created salon accounts, not self-registered couples.
- `frontend/src/app/pages/auth/auth-pages.ts:353`: Only visible signal: on the register page a non-new Google login shows 'Već imate profil, prijavljeni ste.'; the login page (line 23) navigates on without any notice.

### Conditions

- *data state*: Attacker registers the victim's e-mail address via /api/auth/register before the victim has any account on the platform.
- *user interaction*: Victim later signs in or signs up with Google using that address (the only sign-up path the frontend offers).
- *system configuration*: Google sign-in is configured (Google:ClientId set); otherwise /api/auth/google returns 503.

### Bounded local reproduction

**Attacker:** Anonymous attacker who knows or guesses the victim's e-mail address before the victim joins.

**Inputs:**

- `POST /api/auth/register {"firstName":"Napadac","lastName":"X","email":"Vprh-Zrtva@Gmail.com","username":"vprh-napadac","password":"NapadacLozinka1"}`
- `Victim: POST /api/auth/google {"credential":"vprh-zrtva"} (FakeGoogle: verified vprh-zrtva@gmail.com)`
- `Victim: PUT /api/auth/me {"firstName":"Prava","lastName":"Vlasnica","phoneNumber":"+387 61 000 111"}`
- `Attacker: POST /api/auth/login {"login":"vprh-napadac","password":"NapadacLozinka1"}; GET /api/auth/me`

**Steps:**

1. In the offline ApiFactory (in-memory SQLite, FakeGoogle), register a Couple account with e-mail Vprh-Zrtva@Gmail.com and a known password.
2. Sign in with Google as vprh-zrtva@gmail.com and note isNew and the returned user id.
3. As the victim, PUT /api/auth/me with a phone number; try change-password without knowing the attacker's password.
4. Log in with the attacker's username and password (and with the victim's e-mail) and GET /api/auth/me; also replay the register-time JWT.
5. Control: a Google login with no pre-registered row returns isNew=true and hasPassword=false.

**Observed result:** Register returned 200 with user id 5 and e-mail normalized to vprh-zrtva@gmail.com. The victim's Google login returned isNew=false, id 5, hasPassword=true, username vprh-napadac. The victim's change-password attempt returned 400. The attacker's password login (username and e-mail) returned id 5 and GET /api/auth/me returned phoneNumber +387 61 000 111; the register-time JWT still returned 200 after the link. Control login returned isNew=true, hasPassword=false. 2/2 tests passed in a network-less namespace (unshare -n, loopback only).

### Severity

- Likelihood **low**: The attacker must know the victim's address and register it before the victim joins (auth endpoints are limited to 10 requests/min per IP); once that happens, the victim's Google sign-in is the expected path.
- Impact **high**: Persistent read/write access as the victim's user id to their PII, bookings, chats, plan and reviews, including account deletion, which the victim cannot revoke.
- Confidence **high**: Complete source trace confirmed line by line and independently reproduced offline with an own test, including the control case.

### Remediation

In AuthService.GoogleLoginAsync step 2, when linking a Google identity to an existing Couple row, set PasswordHash and PasswordSalt to string.Empty (PasswordHasher.Verify already rejects empty values and HasPassword then maps to false, matching the README's passwordless couple model) and invalidate previously issued tokens. Token invalidation needs a new mechanism: add a per-user security stamp/token version column, emit it as a claim in TokenService.CreateToken, compare it in Program.cs OnTokenValidated, and rotate it at link time (this also fixes token survival after password change). Keep same-role linking for admin-created Vendor accounts, whose e-mail and temporary password were set by an administrator, as documented in backend/README.md. Alternatively refuse to link self-registered Couple rows and require a password sign-in first. Longer term, add e-mail verification to /api/auth/register (or remove the endpoint, which the frontend no longer uses) and link only verified accounts. Add a regression test that the pre-registered password and register-time JWT fail after the Google link.

**Applied on this branch:** When a Google identity is linked to an existing Couple account (self-registration never verified the e-mail), the unproven password is cleared and the security stamp rotated, so the attacker's password and earlier tokens stop working. Admin-created vendor accounts keep their documented linking behaviour. Still open: e-mail verification for /api/auth/register.

**Regression tests:** GooglePreHijackTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

---

## F-03 · LOW · Password change and admin password reset do not revoke previously issued JWTs (valid up to 8 hours)

**Fingerprint:** `jwt-not-revoked-on-password-change`  
**Status:** Fixed on branch

Bearer JWTs live 480 minutes and carry only sub, name, email and role. The per-request hook in Program.cs (OnTokenValidated) calls IsActiveAsync, which only checks that the account exists, is active and is not deleted. AuthService.ChangePasswordAsync and the admin reset in UserService.BeforeUpdateAsync only replace the password hash, so a token issued before the change keeps full read and write access to the account until its original expiry. The owner has no other way to end a stolen session: logout only clears localStorage and there is no server-side logout. Vendors cannot delete their own account. The admin reset, the support recovery path, has the same gap. The app does revoke tokens at once on admin deactivation and self-deletion, but credential change is not covered. OWASP ASVS 4.0.3 V3.3.3 requires that other sessions can be terminated after a password change. This is a real boundary failure with an affected principal and resource, not just hardening.

**Root cause.** Issued JWTs carry no credential or security version, and the only per-request revocation hook (OnTokenValidated -> IsActiveAsync) checks only that the account exists, is active and has no DeletedAt. Password change and admin reset change only PasswordHash/PasswordSalt (and MustChangePassword), so the server cannot tell tokens issued before the change from current ones until their 480-minute exp.

**Intended behaviour.** After a user changes their password or an admin resets it, every token issued before the change must be rejected (the session that made the change may get a fresh token). Then the owner or an admin can evict whoever holds a stolen token.

### Source trace

| # | Kind | Location | Scope | What happens |
|---|---|---|---|---|
| 1 | entrypoint | `backend/Planiraj.API/Controllers/AuthController.cs:92` | AuthController.Me (GET /api/auth/me, [Authorize]) | Someone holding a token issued before the password change calls a bearer-protected endpoint with it. PUT /api/auth/me (line 96), /api/bookings and every other [Authorize] route behave the same. |
| 2 | propagation | `backend/Planiraj.API/Program.cs:88` | AddJwtBearer TokenValidationParameters | The framework checks only signature, issuer, audience and lifetime. A 480-minute token issued before the change is still within its lifetime. |
| 3 | propagation | `backend/Planiraj.API/Program.cs:108` | JwtBearerEvents.OnTokenValidated | The only per-request account check calls IsActiveAsync(sub). No claim is compared with the account's current credential state. |
| 4 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:270` | AuthService.IsActiveAsync | Returns true when the user exists, IsActive is true and DeletedAt is null. Neither password change nor admin reset touches these fields. |
| 5 | sink | `backend/Planiraj.Services/Services/AuthService.cs:188` | AuthService.GetCurrentAsync | Loads and returns the victim's profile (e-mail, phone, city) for the old token's sub after the password has already been changed. |

### Evidence

- `backend/Planiraj.Services/Services/AuthService.cs:215`: ChangePasswordAsync only calls PasswordHasher.SetPassword and clears MustChangePassword. It does not invalidate any outstanding token.
- `backend/Planiraj.Services/Services/UserService.cs:107`: The admin reset in BeforeUpdateAsync only sets a new hash and MustChangePassword = true. The user's outstanding tokens stay valid.
- `backend/Planiraj.Services/Security/PasswordHasher.cs:30`: SetPassword replaces only hash and salt. The User entity has no security stamp or credential version to rotate.
- `backend/Planiraj.API/Auth/AuthInfrastructure.cs:61`: Token claims are only sub, name, email and role. There is no security stamp, credential version or jti to tell tokens issued before the change apart.
- `backend/Planiraj.API/Auth/AuthInfrastructure.cs:25`: JwtSettings.ExpiresMinutes defaults to 480.
- `backend/Planiraj.API/appsettings.json:9`: The shipped configuration sets Jwt:ExpiresMinutes to 480 (8 hours).
- `backend/Planiraj.API/Program.cs:93`: This comment states the intended revocation: a token is valid only while the account exists and is active, and deleted or disabled accounts lose access at once. Credential change is not covered.
- `frontend/src/app/core/auth.ts:107`: Logout only clears the client session and localStorage. There is no server-side logout or revocation endpoint, so the owner cannot end a stolen session themselves.
- `frontend/src/app/core/auth.ts:79`: After change-password the client keeps using the same token and only patches mustChangePassword. A fix that revokes old tokens must also issue a new token or force a new sign-in.
- `backend/Planiraj.API/Program.cs:100`: The SignalR hub accepts the same JWT from the access_token query string and authenticates it only when the connection opens. No source closes existing hub connections when credentials change (not separately tested).

### Conditions

- *data state*: The attacker already holds a bearer token issued to the victim before the change, for example from a shared or stolen device's localStorage, from XSS, or from a log that captured the SignalR access_token query parameter.
- *data state*: The victim account stays active and not deleted. Admin deactivation and couple self-deletion do revoke the token immediately.
- *timing dependency*: Access lasts only until that token's original exp: 480 minutes after it was issued plus 1 minute of clock skew. There is no refresh endpoint, so the attacker cannot extend it.
- *system configuration*: Jwt:ExpiresMinutes is left at the shipped 480. A deployment that overrides it changes the length of the window but not the defect.

### Bounded local reproduction

**Attacker:** Someone holding a bearer JWT issued to the victim account before the victim (or an admin) changed its password, without knowing the new password.

**Inputs:**

- `POST /api/auth/login {"login":"mladenci","password":"Mladenci123!"} sent twice: token A (earlier/stolen) and token B (owner)`
- `POST /api/auth/change-password with Authorization: Bearer B {"currentPassword":"Mladenci123!","newPassword":"Verifier-Nova-2026"}`
- `GET /api/auth/me with Authorization: Bearer A`
- `PUT /api/auth/me with Authorization: Bearer A {"firstName":"Promijenjeno","lastName":"Starim","phoneNumber":"+387 61 000 111"}`
- `PUT /api/users/2 with an admin token {"firstName":...,"lastName":...,"email":...,"role":"Vendor","isActive":true,"newPassword":"Verifier-Reset-2026"} after an earlier salon token was obtained`
- `GET /api/auth/me and GET /api/bookings with the earlier salon token`

**Steps:**

1. Start the API in memory with seed dummy users (ApiFactory: SQLite, no network).
2. Sign in as mladenci twice to get token A and token B.
3. Change the password with token B, then check that the old password now fails and the new one works.
4. Call GET and PUT /api/auth/me with token A.
5. Sign in as salon, then as admin reset salon's password through PUT /api/users/{id} with newPassword.
6. Call GET /api/auth/me and GET /api/bookings with the salon token issued before the reset.
7. Control: as admin, set isActive=false for a user that has an outstanding token, then call GET /api/auth/me with that token.

**Observed result:** In a network-less sandbox with the in-memory SQLite API, all 3 verifier tests passed. change-password returned 204. Login with the old password returned 401 and with the new password 200. Token A then got 200 on GET /api/auth/me (username mladenci) and 200 on PUT /api/auth/me. Token A's own change-password attempt with the old password got 400. The admin reset PUT /api/users/2 returned 200, and login with salon's old password returned 401. The salon token issued before the reset then got 200 on GET /api/auth/me (mustChangePassword=true) and 200 on GET /api/bookings. Control: after admin deactivation of user 3, that user's earlier token got 401 on GET /api/auth/me.

### Severity

- Likelihood **low**: The attacker must already have stolen a valid bearer token for the victim, and the account must be one whose owner or admin reacts by changing the password.
- Impact **medium**: This defeats the main recovery action for one account. The attacker keeps full read and write access (PII, profile, bookings, chat, and salon management for vendors) after the owner's change or the admin's reset, for the rest of the token's 8-hour life. The blast radius is one account for a bounded time, and admin deactivation still works as a revocation path.
- Confidence **high**: Every trace and evidence line was re-read at commit 6c5a1f8, and the result was reproduced independently in a network-less sandbox for both the self-service change and the admin reset, with a passing deactivation control.

### Remediation

Bind each JWT to a per-user credential version and check it on every request. (1) Add a random SecurityStamp column to User (backend/Planiraj.Services/Database/Entities.cs) with an EF migration and set it on create. (2) Rotate it inside PasswordHasher.SetPassword, which covers ChangePasswordAsync, the admin reset and insert. Also rotate it in UserService.BeforeUpdateAsync when Role or IsActive changes, and in AuthService.GoogleLoginAsync when a GoogleId is first linked to an existing account. (3) Add the stamp as a claim in TokenService.CreateToken; pass it separately instead of adding it to the public UserDto. (4) In Program.cs OnTokenValidated, replace IsActiveAsync with a check of u.Id == userId && u.IsActive && u.DeletedAt == null && u.SecurityStamp == stampClaim, and fail tokens that lack the claim. (5) Have POST /api/auth/change-password return a fresh AuthResponse and have frontend AuthService.changePassword store it, so the owner's current tab stays signed in while every other token is rejected. Optionally add an authenticated sign-out-everywhere endpoint that only rotates the stamp. (6) For /api/hubs/chat, enable CloseOnAuthenticationExpiration in the MapHub options and abort the user's open hub connections when the stamp rotates. Add regression tests in backend/Planiraj.Tests: after a self change or an admin reset, a token issued earlier gets 401 on GET /api/auth/me, and the token returned by change-password gets 200.

**Applied on this branch:** New User.SecurityStamp column (migration AddUserSecurityStamp), emitted as the 'sst' JWT claim and compared on every request in OnTokenValidated. It rotates on any password set (change, admin reset, registration), on admin role or active-flag changes, and on Google linking. POST /api/auth/change-password returns a fresh session that the frontend stores, so only other sessions are logged out. The SignalR hub closes sockets when the token expires.

**Regression tests:** TokenRevocationTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

---

## F-04 · LOW · Salon accounts can store unlimited, never-reclaimed upload files on the API host disk

**Fingerprint:** `vendor-upload-storage-unbounded`  
**Status:** Fixed on branch

Any verified Google account can become a Vendor through the anonymous POST /api/auth/google/salon, create one salon (published immediately) and then call POST /api/uploads/vendors/{id} repeatedly. Each request writes a new GUID-named file (up to Uploads:MaxSizeMb = 5 MB) under ContentRootPath/uploads/vendors/{id} on the API host. Nothing limits the number of files or bytes per salon, there is no upload-specific rate policy, and nothing ever deletes a file: unreferenced uploads, images removed from the gallery and replaced logos all stay on disk and stay publicly served. The only throughput bound is the global fixed-window limiter of 120 requests per minute per user, so one account can add at most about 600 MB per minute if its bandwidth allows, and each extra Google account adds its own budget. Admin unpublishing the salon (Vendor.IsActive = false) does not stop uploads; only deactivating the user does. Verdict reasoning: the missing aggregate bound and the retention are source-visible and were reproduced offline under the shipped rate-limit defaults. None of the unknown deployment controls removes the bound failure. LocalFileStorage is the only IFileStorage registered, so object storage needs a code change. A reverse-proxy body limit caps only the size of each request, not the total kept. Disk size only changes how long exhaustion takes. Severity is low because the attacker must upload every byte that is stored (no amplification) over a sustained period, needs a Vendor account, and is easy to attribute and clean up (one folder per salon, immediate token rejection on user deactivation). Disk exhaustion itself was not exercised.

**Root cause.** UploadsController.UploadVendorImage writes a new persistent file on every authorized request with only a per-file size cap: there is no per-vendor count or byte quota, no upload-specific rate limit, no tracking of whether a file is referenced, and no deletion or cleanup path anywhere in the backend.

**Intended behaviour.** Storage per salon is bounded by file count and total bytes, uploads have their own rate limit, and files no longer referenced by a VendorImage.Url or Vendor.LogoUrl are deleted (immediately on unreference or by a cleanup job after a grace period).

### Source trace

| # | Kind | Location | Scope | What happens |
|---|---|---|---|---|
| 1 | entrypoint | `backend/Planiraj.API/Controllers/AuthController.cs:49` | AuthController.GoogleSalon | Anonymous POST /api/auth/google/salon accepts any valid Google ID token (only the auth limiter of 10/min per IP applies). |
| 2 | propagation | `backend/Planiraj.Services/Services/AuthService.cs:134` | AuthService.GoogleLoginAsync | A new Google identity is created as an active account with Role = Vendor; no approval step. |
| 3 | propagation | `backend/Planiraj.Services/Services/VendorService.cs:151` | VendorService.BeforeInsertAsync | The Vendor creates its own salon (one per account, lines 149-150), owned by itself and active immediately. |
| 4 | propagation | `backend/Planiraj.API/Controllers/UploadsController.cs:26` | UploadsController.UploadVendorImage | Only an owner-or-admin check (no Vendor.IsActive check), a 5 MB per-file cap (line 30) and a magic-byte sniff; no count or byte quota before saving (line 41). |
| 5 | sink | `backend/Planiraj.API/Uploads/FileStorage.cs:31` | LocalFileStorage.SaveAsync | File.Create writes a new GUID-named file under ContentRootPath/uploads/vendors/{id} on the API host for every request; no code path ever deletes it. |

### Evidence

- `backend/Planiraj.API/Auth/RateLimits.cs:13`: PermitPerMinute defaults to 120; the global limiter partitioned per user (lines 54-58) is the only throughput bound on uploads; no upload-specific policy exists.
- `backend/Planiraj.API/appsettings.json:17`: Uploads:MaxSizeMb is 5, a per-file cap only.
- `backend/Planiraj.API/Controllers/UploadsController.cs:23`: RequestSizeLimit of 20 MB per request; one file is saved per request; no aggregate limit.
- `backend/Planiraj.Services/Helpers/AccessRules.cs:16`: EnsureCanManageVendorAsync reads only OwnerUserId, so a salon unpublished by an admin can still upload.
- `backend/Planiraj.API/Program.cs:42`: LocalFileStorage is the only IFileStorage registration; uploads always go to local disk.
- `backend/Planiraj.API/Uploads/FileStorage.cs:24`: RootPath is under the API ContentRootPath (default Planiraj.API/uploads), on the API host filesystem.
- `backend/Planiraj.Services/Base/BaseCRUDService.cs:55`: Deleting a VendorImage (or a Vendor) removes only the database row; no File.Delete or cleanup job exists in backend source.
- `backend/README.md:284`: Open item acknowledges that an uploaded file stays on disk when the image is removed from the gallery.
- `backend/Planiraj.API/Program.cs:108`: Recovery control: a deactivated user's token is rejected on every request (observed 401), but stored files remain.
- `backend/Planiraj.API/appsettings.json:12`: Google:ClientId ships empty; AuthController lines 55-56 return 503 until it is configured, so self-registration depends on deployment configuration.

### Conditions

- *authentication level*: Attacker needs a Vendor account that owns a salon: any verified Google account via the salon sign-in page, or any admin-provisioned vendor account.
- *system configuration*: Google:ClientId must be configured for self-registration (shipped empty, endpoint returns 503 until set); the README documents Google as the salon sign-up path.
- *environmental dependency*: Uploads:Root is on finite local disk of the API host; disk size sets time to exhaustion, and whether logs, temp files or a database share that filesystem sets collateral impact.

### Bounded local reproduction

**Attacker:** Internet user with a free Google account (verified e-mail), acting as a newly self-registered salon.

**Inputs:**

- `POST /api/auth/google/salon {"credential":"<Google ID token>"}`
- `POST /api/vendors {"name":"X","cityId":1}`
- `POST /api/uploads/vendors/{id} multipart file=<70-byte 1x1 PNG>, repeated`
- `POST /api/vendorimages {"vendorId":{id},"url":"<returned url>"} then DELETE /api/vendorimages/{imageId}`
- `Admin: PUT /api/vendors/{id}/admin {"ownerUserId":{userId},"isActive":false}; PUT /api/users/{userId} {...,"isActive":false}`

**Steps:**

1. Sign in on the salon page with a Google account and create the salon.
2. Upload a few tiny PNGs without attaching them to the gallery; list uploads/vendors/{id} and GET /api/vendorimages?vendorId={id}.
3. Attach one upload to the gallery, delete that gallery image, and list the folder again.
4. As admin, unpublish the salon and upload once more; then deactivate the user and upload once more.
5. Repeat sign-up with a second Google account and upload to its own salon.

**Observed result:** Offline xUnit run (network namespace with loopback only, SQLite, temp UploadRoot) with the shipped rate-limit defaults enabled (120/min per user, 10/min auth): a second salon for the same account returned 400; 6 uploads all returned 200, leaving 6 files on disk (70 bytes each) while the gallery totalCount was 0; an unreferenced file was served to an anonymous GET with 200; attaching one upload and deleting the gallery row returned 204 but the folder still held 6 files and the URL still served 200; after the admin unpublished the salon an upload still returned 200 (7 files); after the admin deactivated the user the upload returned 401 and the 7 files remained; a second Google account created its own salon and stored 2 more (9 total); a Couple account got 403. Disk exhaustion was not exercised.

### Severity

- Likelihood **low**: Free Google accounts and a simple script suffice once Google sign-in is enabled, but every stored byte must be uploaded (at most 5 MB per request, 120 requests per minute per account) over a sustained period, and the abuse is tied to a visible salon and its own folder.
- Impact **medium**: Persistent shared-disk consumption with no automatic reclamation: once the uploads filesystem is full, every salon's uploads fail, and anything else on that filesystem can fail too. There is no confidentiality or integrity effect, and recovery is straightforward (deactivate the user, delete vendors/{id}).
- Confidence **medium**: The missing aggregate bound, the lack of any deletion path and the retention were confirmed in source and reproduced offline under shipped rate limits. Whether Google sign-in is enabled, the disk size and what shares the filesystem are deployment facts that affect likelihood and collateral but not the bound failure.

### Remediation

In UploadsController, enforce a per-vendor quota (maximum file count and total bytes under vendors/{id}) before saving, and reject uploads for inactive salons. Add a dedicated, tighter rate-limit policy for /api/uploads. Track references: delete the file when a VendorImage is deleted or its Url or Vendor.LogoUrl changes, and add a periodic job that removes files under vendors/{id} not referenced by VendorImages.Url or Vendor.LogoUrl after a grace period (and the whole folder when a vendor is deleted). Put Uploads:Root on a dedicated, quota-limited volume or object storage and monitor free space.

**Applied on this branch:** Per-salon quota Uploads:MaxFilesPerVendor (default 100). When it is reached, files older than Uploads:OrphanGraceMinutes (default 60) that no gallery image or logo references are deleted first, and the upload is refused if the salon is still full. A dedicated upload rate limit applies (RateLimit:UploadPermitPerMinute, default 20/min). Still open: delete a file immediately when its gallery image is removed, and put uploads on a dedicated volume or object storage with disk monitoring.

**Regression tests:** UploadQuotaTests (backend/Planiraj.Tests/SecurityAuditTests.cs)

---
