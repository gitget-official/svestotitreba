# Needs validation

Source-grounded leads whose outcome depends on a deployment fact that is not in the repository. They have no severity. The owner resolves each one with the checks below; no audit traffic was or should be sent to a live system.

## NV-01 · Login brute-force limit can be bypassed or turned into a global lockout depending on proxy configuration

**Fingerprint:** `rate-limit-client-ip-depends-on-proxy-topology`

The auth rate-limit policy (10 per minute) on login, register, google and google/salon is keyed on HttpContext.Connection.RemoteIpAddress. Nothing else limits password guessing: there is no per-account lockout or failed-attempt counter (AuthService.ValidateCredentialsAsync), and LoginRequest has no other throttling. Mode true (RateLimit:TrustForwardedHeaders=true): UseForwardedHeaders runs before the limiter, and KnownIPNetworks and KnownProxies are cleared, so X-Forwarded-For is accepted from any peer. With the default ForwardLimit of 1, the rightmost entry becomes RemoteIpAddress. If Kestrel can be reached without going through the proxy, or a proxy passes the client's X-Forwarded-For through without appending to it, an attacker sends a new value with each request and gets a fresh 10-per-minute budget each time, so online password guessing is effectively unlimited. Behind a single proxy that appends, the rightmost entry is set by the proxy and spoofing fails. Mode false (the default, appsettings.json) behind a reverse proxy, or mode true behind more than one appending hop: every client lands in the partition of the proxy's IP. Ten requests a minute from any anonymous client then return 429 to every user's login, registration and Google sign-in, and the global 120/min guest limit is shared too. Both modes, and the conditions for using them, are documented in RateLimits.cs:18-21 and backend/README.md:276-279. Whether production follows that guidance cannot be seen from the repository.

**Claimed root cause.** The auth limiter partitions on a client IP whose trustworthiness depends entirely on the deployment topology. The only trusted-proxy option empties KnownProxies and KnownIPNetworks instead of pinning them to the real proxy, so the safe use of true depends on the origin being unreachable except through one appending proxy, which the network must enforce.

### Source trace

| # | Kind | Location | Scope | What happens |
|---|---|---|---|---|
| 1 | entrypoint | `backend/Planiraj.API/Controllers/AuthController.cs:70` | AuthController.Login | Anonymous POST /api/auth/login has [EnableRateLimiting(RateLimits.Auth)]; register (83), google (38) and google/salon (48) use the same policy. |
| 2 | propagation | `backend/Planiraj.API/Program.cs:158` | pipeline | UseForwardedHeaders runs only when TrustForwardedHeaders is true, before UseRateLimiter (line 187), so a rewritten RemoteIpAddress reaches the limiter. |
| 3 | propagation | `backend/Planiraj.API/Auth/RateLimits.cs:71` | AddPlanirajRateLimits | KnownIPNetworks (71) and KnownProxies (72) are cleared, so X-Forwarded-For is honored from any peer. ForwardLimit stays at its default of 1, so the rightmost entry wins. |
| 4 | sink | `backend/Planiraj.API/Auth/RateLimits.cs:87` | RateLimits.ClientIp | The partition key is Connection.RemoteIpAddress after forwarded-header processing: the attacker-chosen value in mode true with direct reachability, or the proxy's address in mode false behind a proxy. |

### Evidence

- `backend/Planiraj.API/Auth/RateLimits.cs:61`: Auth policy: a fixed window of AuthPermitPerMinute (10) for each auth:ClientIp partition.
- `backend/Planiraj.API/Auth/RateLimits.cs:19`: Code comment: true only behind a proxy that sets X-Forwarded-For and when the API is not directly reachable from the internet, otherwise anyone can fake their IP. The control depends on the operator following this.
- `backend/README.md:279`: The README admits that behind a proxy without TrustForwardedHeaders all users share the proxy's IP and would quickly get 429.
- `backend/Planiraj.API/appsettings.json:30`: Committed default: TrustForwardedHeaders false. The production value and topology are not in the repository.
- `backend/Planiraj.Services/Services/AuthService.cs:38`: A failed password check just returns null. There is no failed-attempt counter or account lockout, so the per-IP limiter is the only protection against password guessing.

### Blockers (facts the repository cannot show)

- The production RateLimit:TrustForwardedHeaders value is not in the repository.
- The hosting topology is not in the repository: whether a reverse proxy, CDN or PaaS front end sits in front of Kestrel, how many proxy hops append to X-Forwarded-For, and whether the Kestrel port or origin hostname can be reached from the internet without passing through the proxy.

### Local check

In a disposable copy of the repo (not the working tree), add an xUnit class modeled on backend/Planiraj.Tests/RateLimitTests.cs. Use a LimitedApiFactory variant with RateLimit:AuthPermitPerMinute=3 and SQLite in-memory, and send POST /api/auth/login with dummy credentials {login:'x', password:'wrong'}. (A) Set RateLimit:TrustForwardedHeaders=true and send 6 logins, each with a distinct X-Forwarded-For (198.51.100.1 to .6). Expect all 401 and no 429 (spoofing works when the peer is untrusted and reaches the app directly). (B) Same setting, 4 logins with 'X-Forwarded-For: 198.51.100.N, 203.0.113.9', varying only the leftmost entry. Expect 429 on the 4th, which shows that with ForwardLimit=1 a single appending proxy defeats spoofing. (C) Set TrustForwardedHeaders=false and use two HttpClients from the same TestServer, which share one peer address like users behind a proxy. Client A makes 3 failed logins; expect client B's first login to return 429. Make no network calls outside the in-process TestServer.

### Owner check on the deployment

The owner checks their own configuration; no audit traffic is sent to the deployment. (1) Read the production value of RateLimit:TrustForwardedHeaders (appsettings override or the RateLimit__TrustForwardedHeaders environment variable). (2) In the hosting, firewall or security-group settings, check whether the Kestrel port, VM IP or default PaaS hostname accepts internet traffic that bypasses the reverse proxy or CDN. (3) Confirm how many proxies are in front of the app and that each one appends to X-Forwarded-For rather than passing a client-supplied header through (for example nginx $proxy_add_x_forwarded_for, or Cloudflare). (4) In the API's own logs, check whether 429s on /api/auth/* share one RemoteIpAddress across many users. Outcome: the bypass is confirmed if the value is true and the origin is directly reachable, or the proxy passes the header through. The lockout is confirmed if the value is false behind a proxy, or true behind more than one appending hop. The lead is rejected if the value is true, the origin accepts only the proxy, and there is exactly one appending hop. Fix: set KnownProxies/KnownIPNetworks (and ForwardLimit) to the real proxy addresses instead of clearing them, and consider a per-account failed-login limit.

---
