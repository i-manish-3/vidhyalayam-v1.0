# Login & Session Flow

End-to-end documentation of authentication in Vidhyalayam: how a user logs in, how their session stays alive while they work, how lockouts and refreshes work, and what the production-readiness posture is today.

This document reflects the **current implementation** (post HttpOnly cookie migration). Anything that is described in the design but not yet implemented is called out explicitly in [§14](#14-production-readiness-assessment).

---

## 1. Architecture at a Glance

Auth is JWT-based, **stateless** on the server, and uses two HttpOnly cookies. The browser carries the cookies; the server only validates the signature.

| Cookie | Contents | TTL | Set by | Used by |
|---|---|---|---|---|
| `erp_access` | Signed JWT — `{ userId, email, role, schoolId }` | **15 minutes** | `/api/auth/login`, `/api/auth/refresh` | Every authenticated API call |
| `erp_refresh` | Signed JWT — `{ userId, type: 'refresh' }` | **30 days (sliding)** | `/api/auth/login`, `/api/auth/refresh` | Only `/api/auth/refresh` |

Both cookies are:

```
HttpOnly        → JavaScript can't read them; XSS can't exfiltrate
SameSite=Lax    → sent on top-level navigation, blocked on cross-site POST (CSRF mitigation)
Secure          → HTTPS-only in production (off on localhost so dev works)
path=/          → sent on every request to the same origin
```

The DB stores **no session rows**. JWT signature verification alone proves the user is authenticated. The refresh endpoint re-fetches the user from the DB on every refresh to pick up role/active changes.

### Key files

| Layer | File |
|---|---|
| Cookie helpers (single source of truth for flags) | [src/lib/cookies.ts](src/lib/cookies.ts) |
| JWT signing / verification | [src/lib/auth.ts](src/lib/auth.ts) |
| Lockout + audit log helpers | [src/lib/auth-security.ts](src/lib/auth-security.ts) |
| Server-side cookie read (used by every protected route) | [src/lib/api-auth.ts](src/lib/api-auth.ts) |
| Login route | [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts) |
| Refresh route (sliding session) | [src/app/api/auth/refresh/route.ts](src/app/api/auth/refresh/route.ts) |
| Logout route | [src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts) |
| Current user / profile | [src/app/api/auth/me/route.ts](src/app/api/auth/me/route.ts) |
| Current user permissions | [src/app/api/auth/permissions/route.ts](src/app/api/auth/permissions/route.ts) |
| Password change | [src/app/api/auth/change-password/route.ts](src/app/api/auth/change-password/route.ts) |
| School-admin unlock peer | [src/app/api/school/users/[id]/unlock/route.ts](src/app/api/school/users/[id]/unlock/route.ts) |
| Super-admin unlock anyone | [src/app/api/super-admin/users/[id]/unlock/route.ts](src/app/api/super-admin/users/[id]/unlock/route.ts) |
| Frontend API client (refresh-on-401 interceptor) | [src/lib/api.ts](src/lib/api.ts) |
| Zustand auth store | [src/lib/store.ts](src/lib/store.ts) |
| Login screen | [src/components/login-screen.tsx](src/components/login-screen.tsx) |
| Boot-time auth bootstrap & profile refresh | [src/app/page.tsx](src/app/page.tsx), [src/components/brand-head-manager.tsx](src/components/brand-head-manager.tsx) |

### Database tables involved

- `User` — credentials and `lastLoginAt`. Failed-attempt counts live in `AccountLockout`, not on the user.
- `AccountLockout` — one-to-one with `User`: `failedAttempts`, `lastFailedAt`, `lockedUntil`, `unlockedBy`, `unlockedAt`.
- `LoginEvent` — append-only audit log of every login attempt (success or specific failure reason).

There is **no** `Session` table; refresh tokens are stateless JWTs, not opaque DB-backed sessions.

---

## 2. Login — Happy Path

User enters credentials on [src/components/login-screen.tsx](src/components/login-screen.tsx) and submits.

### 2.1 Request

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@dpsdelhi.in", "password": "..." }
```

`email` accepts either an email address **or** a 10+ digit phone number (parent accounts often log in by phone).

### 2.2 Server pipeline (strict order)

Each step can short-circuit with a specific reason logged to `LoginEvent`. See [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts).

1. **Identifier resolution** — phone-shaped input (`/^\d{10,}$/`) → `findFirst` by phone; otherwise → `findUnique` by email.
2. **User exists?** → No → log `USER_NOT_FOUND`, return `401` with a generic "no account found" message.
3. **`isActive` check** → false → log `INACTIVE`, return `403`.
4. **`deletedAt` check** → not null → log `DELETED`, return `403`.
5. **Lockout check** (skipped for `SUPER_ADMIN` — they cannot be locked out of their own system):
   - `isAccountLocked(userId)` reads `AccountLockout.lockedUntil > now()`.
   - If locked → log `LOCKED`, return `423` with a `Retry-After` header (seconds until unlock).
6. **Password verify** — `bcrypt.compareSync(plain, hashed)`. Cost factor is baked into the hash, so old hashes still verify.
   - Wrong password (non-SUPER_ADMIN):
     - `recordLoginFailure(userId)` increments `failedAttempts`. At 5 → sets `lockedUntil = now() + 10 min`.
     - If this attempt triggered the lock → return `423` with `Retry-After`.
     - Otherwise return `401`.
   - Wrong password (SUPER_ADMIN): same `401`, but no DB row update — SUPER_ADMIN is exempt from lockout.
7. **Success path** (see §2.3).

### 2.3 Success path

After password verifies:

- `resetLoginFailures(userId)` — sets `failedAttempts = 0`, clears `lockedUntil`.
- `db.user.update({ lastLoginAt: new Date() })`.
- `logLoginEvent({ success: true, userId, email, schoolId, ip, ua })`.
- Issue tokens:
  ```ts
  const accessToken  = generateAccessToken({ userId, email, role, schoolId })  // 15m JWT
  const refreshToken = generateRefreshToken(user.id)                            // 30d JWT, type:'refresh'
  ```
- Set both cookies via `setAuthCookies(res, accessToken, refreshToken)`. See [src/lib/cookies.ts](src/lib/cookies.ts) — single source of truth for `httpOnly`, `secure`, `sameSite`, `path`, `maxAge`.
- Respond with the user shape (no token in the body — the cookies do that work):
  ```json
  {
    "user": {
      "id": "...", "email": "...", "name": "...", "role": "...",
      "phone": "...", "avatar": "...", "mustChangePassword": false,
      "schoolId": "...",
      "school": { "id": "...", "name": "...", "logo": "...", "status": "...", "subdomain": "...", "primaryColor": "...", "academicYear": "...", "favicon": "..." }
    }
  }
  ```

### 2.4 Client side

[src/lib/store.ts](src/lib/store.ts) `login(user)`:

- Persists a **slim** user object (avatar stripped — it can be megabytes of base64 and blow past localStorage quota) to `localStorage.erp_user`.
- Sets `isAuthenticated: true` in Zustand.

[src/components/login-screen.tsx](src/components/login-screen.tsx) then makes two follow-up calls inside the same handler:

- `GET /api/auth/me` → fills `currentSchool` in the store.
- `GET /api/auth/permissions` → fills the permissions list (drives sidebar visibility).

Both are best-effort: a failure here does not abort the login. The user is already authenticated by virtue of the cookies being set.

From now on every API request automatically attaches both cookies because the fetch wrapper uses `credentials: 'include'`. There is **no `Authorization` header** — JavaScript cannot read the JWT.

---

## 3. Login — Failure Scenarios

### 3.1 Wrong password, attempts 1–4

- `AccountLockout.failedAttempts += 1`.
- `LoginEvent: BAD_PASSWORD`.
- Returns `401` ("The password you entered is incorrect").

### 3.2 5th wrong password — auto-lock

- `failedAttempts` becomes 5 → `lockedUntil = now() + 10 min`.
- `LoginEvent: BAD_PASSWORD`.
- Returns `423 Locked` with `Retry-After: <seconds-until-unlock>` header.
- UI can show a countdown.

### 3.3 Attempts while locked

- Step 5 (lockout check) short-circuits → `LoginEvent: LOCKED`.
- Returns `423` with `Retry-After`.
- The lock window does **not** extend — keep retrying does not punish the user further.

### 3.4 Unknown email / phone

- `LoginEvent: USER_NOT_FOUND` (email captured for forensic value).
- Returns `401` with a slightly different message ("No account found with this email or phone number"). Note: this technically leaks user existence vs §3.1. See production-readiness note in §14.

### 3.5 Inactive or soft-deleted user

- `LoginEvent: INACTIVE` or `DELETED`.
- Returns `403`.

### 3.6 SUPER_ADMIN exemption

- SUPER_ADMIN is checked **before** the lockout step and skipped. Rationale: the platform owner cannot lose access to their own platform via brute-force.
- They are still rate-limited at the network layer (whatever the host provides) but not by application logic.

---

## 4. Access Token Expiry & Silent Refresh (Sliding Session)

Access tokens live 15 minutes. After that, any API call returns `401`. The client silently refreshes; the user never sees a logout unless their 30-day refresh window has elapsed without activity.

### 4.1 Client interceptor

[src/lib/api.ts](src/lib/api.ts) `fetchWithRetry`:

```
fetch(url)
  → response.status === 401
  → and: not /api/auth/login or /api/auth/refresh
  → and: didRefresh === false (not already a retried request)
  →
  refreshOnce()  // single-flight; see §4.2
  → if success: retry original request once with didRefresh=true
  → if failure: useAppStore.getState().logout() and throw "session expired"
```

### 4.2 Single-flight refresh

```ts
private refreshing: Promise<boolean> | null = null

private async refreshOnce(): Promise<boolean> {
  if (!this.refreshing) {
    this.refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { this.refreshing = null })
  }
  return this.refreshing
}
```

If 8 parallel API calls all 401 simultaneously (typical after a 15-min idle period when the user comes back and triggers a dashboard re-load), they share **one** `/api/auth/refresh` call, not 8. This is critical because each refresh rotates the refresh token — without single-flight, parallel refreshes would race and only one would succeed, breaking the rest.

`didRefresh: true` on the retry prevents an infinite loop if the retried request also 401s — we fall straight through to logout instead of re-refreshing forever.

### 4.3 Server refresh endpoint

[src/app/api/auth/refresh/route.ts](src/app/api/auth/refresh/route.ts):

1. Read `erp_refresh` cookie. Missing → `401 "No refresh token. Please log in again."`
2. `verifyRefreshToken(token)`:
   - Validates signature.
   - Requires `type === 'refresh'` claim — this is what makes a refresh token unusable as an access token and vice-versa (the `type` discriminator).
   - Expired/tampered/wrong-type → return `null`.
3. Token invalid → clear both cookies, return `401`.
4. Re-fetch user from DB. If `!isActive` or `deletedAt` → clear cookies, return `401`. This is what makes "deactivate this user" take effect within 15 min on every device — once the access token expires, refresh refuses and they're logged out.
5. Issue **brand new** `accessToken` and `refreshToken`.
6. `setAuthCookies(res, ...)` rotates both cookies — the new refresh cookie's 30-day expiry slides forward. Active users effectively never log out; inactive users for 30 days will fail to refresh.
7. Body is just `{ ok: true }` — no sensitive data leaves the server.

---

## 5. Logout

`POST /api/auth/logout` → [src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts).

Stateless — JWTs aren't tracked server-side, so "logout" just means **clear the cookies on this device**.

```ts
export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearAuthCookies(response)
  return response
}
```

Client side ([src/lib/store.ts](src/lib/store.ts) `logout()`):

1. Best-effort `fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })`.
2. Clear localStorage keys: `erp_user`, `erp_permissions`, `erp_currentPage`, `erp_currentSchool`, `erp_viewingAcademicYear`.
3. Reset Zustand store: `user: null`, `isAuthenticated: false`, plus navigation reset.

Even if the network call fails, the client still ends up logged out locally and the access cookie expires in ≤15 min. The user lands on the login screen via [src/app/page.tsx](src/app/page.tsx)'s `showLogin` state.

**Limitation**: this only logs out the current device. There is no "log out everywhere" today (see §14).

---

## 6. Manual Unlock

When a school admin is locked out at 9 AM and can't wait 10 minutes, admins can unlock manually.

### 6.1 School admin unlocking a peer

`POST /api/school/users/:id/unlock` → [src/app/api/school/users/[id]/unlock/route.ts](src/app/api/school/users/[id]/unlock/route.ts)

Rules:

- Requester role: `SCHOOL_ADMIN`.
- Target must belong to the same school (`target.schoolId === requester.schoolId`).
- Target role must NOT be `SCHOOL_ADMIN` or `SUPER_ADMIN` — otherwise an admin could unlock a peer-admin (collusion vector) or the platform owner (privilege escalation).

On success:

- `manualUnlock(targetId, requesterId)` — sets `failedAttempts: 0`, `lockedUntil: null`, records `unlockedBy` + `unlockedAt`.
- `LoginEvent: MANUAL_UNLOCK` could be added here (currently the audit lives only in `AccountLockout.unlockedBy/unlockedAt`).

### 6.2 Super admin unlocking anyone

`POST /api/super-admin/users/:id/unlock` → [src/app/api/super-admin/users/[id]/unlock/route.ts](src/app/api/super-admin/users/[id]/unlock/route.ts)

Same helper, no school-scope check, no role restriction. This is the escape hatch for locked `SCHOOL_ADMIN`s.

---

## 7. Password Change

`POST /api/auth/change-password` → [src/app/api/auth/change-password/route.ts](src/app/api/auth/change-password/route.ts)

Steps:

1. `requireAuth` — user must have a valid `erp_access` cookie.
2. Verify `currentPassword` via bcrypt.
3. `validatePasswordStrength(newPassword)` — minimum 8 chars (see [src/lib/auth-security.ts](src/lib/auth-security.ts)).
4. Reject `newPassword === currentPassword`.
5. `bcrypt.hash(newPassword, 12)` → store on `User.password`.
6. Optionally re-issue cookies so the current device stays logged in seamlessly.

**Limitation**: today, other devices the user is logged in on continue to work until their refresh expires (worst case: 30 days if they keep refreshing within a 15-min window). There is no "kill all sessions on password change" because we have no Session table to revoke. See §14.

---

## 8. Page Boot / Hydration

When the SPA loads on a returning user:

1. `app/layout.tsx` runs an inline `<script>` that reads `erp_user` from localStorage. If found, it provisionally applies the cached school branding (favicon, page title) immediately — before React even hydrates. This is what makes a returning user's logo "just appear" without flashing the default. See [src/app/layout.tsx](src/app/layout.tsx).
2. `src/app/page.tsx` Zustand hydration:
   - Reads `erp_user`, `erp_permissions`, `erp_currentSchool` from localStorage.
   - Sets `isAuthenticated: true` provisionally — this assumes the access cookie is still valid (we can't read it from JS).
   - Renders the dashboard immediately for snappy UX.
3. `BrandHeadManager` fires `GET /api/auth/me` in the background. If it returns:
   - **200**: the cookies were valid; updates `currentSchool`/`user.avatar` from authoritative DB data.
   - **401**: the cookies were missing or expired and the client-side refresh chain failed too → falls into the standard 401 flow which triggers `logout()` → bounces to login screen.

**Critical property**: localStorage caches the user's *identity* for fast render, but **the cookie is the source of authentication truth**. Tampering with localStorage cannot grant access — every API call validates the JWT cookie.

---

## 9. Token Lifecycle — Side-by-Side

| Event | `erp_access` cookie | `erp_refresh` cookie | localStorage | DB |
|---|---|---|---|---|
| Login | Set, TTL 15 min | Set, TTL 30 days | `erp_user`, `erp_permissions`, `erp_currentSchool` written | `User.lastLoginAt` updated, `LoginEvent: SUCCESS`, `AccountLockout` reset |
| API call (within 15 min) | Sent automatically | Sent automatically | Unchanged | None |
| API call (after 15 min) | Expired → server returns 401 | Sent automatically | Unchanged | None |
| Silent refresh (within 30 days) | Replaced (new 15-min token) | Replaced (new 30-day token — **sliding**) | Unchanged | None |
| Refresh fails (30+ days idle) | Cleared | Cleared | All `erp_*` keys removed | None |
| Logout | Cleared | Cleared | All `erp_*` keys removed | None |
| Password change | Stays valid until expiry on current device | Stays valid until expiry on current device | Unchanged | `User.password` updated |
| User deactivated | Stays valid up to 15 min, then refresh refuses → forced logout | Refresh refuses on next attempt | Cleared on the 401 → logout flow | `User.isActive=false` |
| Manual unlock | n/a (user wasn't logged in) | n/a | n/a | `AccountLockout` cleared, `unlockedBy`/`unlockedAt` recorded |

---

## 10. Security Constants

Defined in code:

| Setting | Value | Location | Why |
|---|---|---|---|
| Access token TTL | 15 min | `auth.ts:generateAccessToken` | Limit blast radius if a token leaks (e.g., misconfigured CDN log). |
| Refresh token TTL | 30 days (sliding) | `auth.ts:generateRefreshToken` | Active users never log out, inactive users fall off cleanly. |
| Max failed logins before lock | 5 | `auth-security.ts:LOCKOUT_THRESHOLD` | Industry default. |
| Lock duration | 10 min | `auth-security.ts:LOCKOUT_DURATION_MS` | Discourages bots without permanently DOSing a real user who fat-fingered their password. |
| bcrypt cost | 12 | `auth.ts:BCRYPT_COST` | ~250 ms per hash on modern hardware — slow enough to make GPU brute force expensive. |
| Password min length | 8 | `auth-security.ts:PASSWORD_MIN_LENGTH` | Below typical OWASP recommendation (12) — see §14. |

---

## 11. Cookie Security Posture

```ts
// src/lib/cookies.ts
function flags() {
  return {
    httpOnly: true,                                  // JS cannot read → XSS cannot exfiltrate
    secure: process.env.NODE_ENV === 'production',   // HTTPS-only in prod (localhost stays HTTP in dev)
    sameSite: 'lax' as const,                        // CSRF mitigation — see below
    path: '/',
  }
}
```

**Why `HttpOnly`** — even if an attacker injects a malicious script into the page (XSS), that script cannot read the JWT. Before the cookie migration the JWT lived in `localStorage`, which any JS could read; the blast radius of an XSS was a full account takeover. Now it is capped at "do whatever the page can do while the script runs" — no token exfiltration.

**Why `SameSite=Lax`** — blocks the classic CSRF pattern: an attacker site posts a form to `our-app.com/api/anything` and the browser would otherwise attach the cookie. With `Lax`, the cookie is sent on top-level navigation (so email-link → dashboard still works after login) but **not** on cross-site form POSTs or `fetch`es. Combined with the fact that all mutations use `POST`/`PUT`/`DELETE` and require JSON content type, classic CSRF is largely defused. Strict would be slightly safer but breaks the email-link login UX.

**Why `Secure` in prod only** — localhost is HTTP. If `Secure` were always on, dev would silently not get the cookie and login would appear to "succeed" then immediately re-401. Conditional `Secure` is correct for any project that uses HTTP locally.

**Token type discriminator** — refresh tokens carry `type: 'refresh'`; access tokens don't. `verifyAccessToken` rejects anything with `type: 'refresh'`; `verifyRefreshToken` requires it. This means an attacker who somehow obtained the refresh token cannot use it as an access token to call protected APIs directly — they'd have to call `/api/auth/refresh` first, which is by design the only consumer of the refresh token.

---

## 12. JWT Secret Handling

[src/lib/auth.ts](src/lib/auth.ts):

```ts
function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET environment variable is required and must be at least 32 characters.')
  }
  return secret
}
const JWT_SECRET = loadJwtSecret()
```

The app **refuses to start** without a strong `JWT_SECRET`. This prevents a class of bugs where a default/empty secret is silently used in production, allowing attackers to forge tokens.

Generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Rotating the secret invalidates every issued token — acceptable for incident response (e.g., suspected key compromise).

---

## 13. End-to-End Walkthroughs

### 13.1 Standard 12-hour workday

```
09:00  Login → erp_access (15m) + erp_refresh (30d) cookies set, dashboard loads.
09:00–09:15  All API calls go through with the access cookie. No /refresh hits.
09:15  Next API call returns 401. Client interceptor calls /refresh → server validates the refresh
       cookie, re-fetches user, mints new pair of cookies. Original request is retried with the
       fresh cookie. User sees nothing.
09:15–09:30  …
…
21:00  User clicks Sign Out → POST /api/auth/logout → both cookies cleared → localStorage flushed
       → login screen.
```

### 13.2 Returning user after weekend

```
Monday 10:00  User opens the app. Browser still has erp_refresh (set Friday at 18:00, valid 30 days).
              erp_access expired Friday at 18:15.
  - layout.tsx inline script reads erp_user from localStorage → applies cached school logo/title
    (favicon shows up before React mounts — no flash).
  - page.tsx hydrates from localStorage → isAuthenticated: true → AppLayout renders.
  - First API call (e.g., dashboard data fetch) returns 401.
  - Interceptor calls /refresh → cookie is valid → both cookies rotated → request retried → 200.
  - User sees their dashboard with no login prompt.
```

### 13.3 30+ days of inactivity

```
Day 31  User opens the app. Both cookies are gone (browser deleted expired cookies).
  - localStorage still has erp_user → page.tsx provisionally renders as if logged in.
  - First API call returns 401 (no cookies sent at all).
  - Interceptor calls /refresh → no refresh cookie → 401.
  - logout() runs → localStorage flushed → bounce to login screen.
  - User logs in fresh.
```

### 13.4 Brute force attacker

```
Attacker hits /api/auth/login with target email + many wrong passwords.
  Attempt 1: AccountLockout.failedAttempts = 1.
  Attempt 2–4: failedAttempts increments.
  Attempt 5: failedAttempts = 5 → lockedUntil = now() + 10 min. Returns 423 with Retry-After.
  Attempt 6+: lockout check fires first → returns 423 without verifying password. Lock window does
    not extend.
After 10 minutes the lock auto-expires (or a school/super admin clicks Unlock to clear it).
LoginEvent rows capture every attempt for audit/forensic review.
```

### 13.5 School admin gets locked at 9 AM

```
School admin types password wrong 5 times → 423 Locked until 09:10.
Asks colleague (also SCHOOL_ADMIN, same school) — colleague visits the user detail page in
  school-users-page.tsx, sees the lock banner, clicks "Unlock Now":
  → POST /api/school/users/<id>/unlock
  → server enforces: requester is SCHOOL_ADMIN, target is in same school, target is NOT a
    SCHOOL_ADMIN/SUPER_ADMIN. All three pass.
  → manualUnlock(targetId, requesterId)
  → AccountLockout: failedAttempts=0, lockedUntil=null, unlockedBy=<colleague>, unlockedAt=now()
Admin retries → succeeds at 09:03.
```

If the locked user *is* a SCHOOL_ADMIN, only a SUPER_ADMIN can unlock them (the colleague would get
403). The SUPER_ADMIN endpoint has no school-scope or role restriction.

### 13.6 User deactivated mid-session

```
Day N 14:00  Locked-out user gets deactivated by an admin (User.isActive = false).
14:00–14:15  Their current access cookie is still valid → they keep working (worst case 15 min).
14:15  Access cookie expires. First API call returns 401. /refresh fires.
       Refresh route fetches user → !isActive → clears cookies → returns 401.
       Client logout() → bounce to login screen.
```

Net: within 15 minutes of any user being deactivated, every one of their devices is forced out.

### 13.7 Cross-tab login

```
Tab A: User logs in at 10:00. Cookies set on the eTLD+1.
Tab B (same browser, opened later at 10:05, already on app.example.com but never logged in):
  - Browser sends both cookies automatically (same origin).
  - First API call succeeds → user metadata loaded → dashboard renders.
  - The user appears logged in here too without ever entering credentials in this tab.
```

This works "for free" because cookies are scoped per origin, not per tab.

---

## 14. Production Readiness Assessment

Honest assessment of where the current implementation lands on a production-ready scale, and what's missing if the goal is "enterprise SaaS-grade".

### ✅ Production-ready

| Concern | Status | Notes |
|---|---|---|
| XSS-resistant credential storage | ✅ | HttpOnly cookies. JS cannot read tokens. Better than the previous localStorage approach. |
| CSRF mitigation | ✅ | `SameSite=Lax` + mutations always use POST/PUT/DELETE with JSON body. |
| HTTPS-only in prod | ✅ | `Secure` flag conditional on `NODE_ENV === 'production'`. |
| Password storage | ✅ | bcrypt cost 12. Industry-standard. |
| JWT secret enforcement | ✅ | App refuses to start without a 32+ char `JWT_SECRET`. |
| Token type discrimination | ✅ | Refresh tokens cannot be replayed as access tokens (the `type: 'refresh'` claim check). |
| Brute-force protection | ✅ | 5 fails → 10-min lock per account. Persisted in DB so it survives restarts. |
| Audit log | ✅ | Every login attempt (success or failure) is recorded in `LoginEvent` with IP + UA. |
| Sliding session | ✅ | Active users stay logged in indefinitely; inactive users fall off after 30 days. |
| Concurrent refresh handling | ✅ | Client-side single-flight prevents stampede on the refresh endpoint. |
| Privilege-aware unlock | ✅ | School admins cannot unlock peer admins (no collusion vector); only super admins can. |
| Inactive-user revocation propagation | ✅ | A deactivated user is forced out within ≤15 min on every device via refresh failure. |

### ⚠️ Gaps worth knowing about

These are not blockers for an MVP / early-stage SaaS, but they should be addressed before serving a large customer base or handling sensitive data (financial, PII).

| Concern | Severity | What's missing | Recommendation |
|---|---|---|---|
| **No "log out everywhere"** | Medium | JWT is stateless, so there is no way to invalidate an existing session before its 15-min expiry. If a user thinks their account is compromised, the best we can do is change the password — but the attacker's existing access token still works for up to 15 min. | Add a `Session` table tracking refresh tokens. Refresh route looks the row up; logout marks it revoked. This is the only path to true session control. (Roughly 1–2 days of work.) |
| **No refresh-token replay detection** | Medium | If an attacker steals a refresh cookie (e.g., through a network compromise, not XSS — XSS is already blocked), they have 30-day access. We have no way to tell legitimate vs replayed use of the same token. | Same `Session` table — store `previousHash` chain so we can detect "this refresh token was already rotated by someone else, but here it is again" and revoke the whole tree. |
| **No rate limiting at the network/endpoint level** | Medium | Lockout protects per-account, but a credential-stuffing attacker hitting 1000 different emails from one IP will not trip any limit (each email's `failedAttempts` only reaches 1). | Add an IP-based rate limit on `/api/auth/login` (e.g., 30 attempts / 15 min per IP). Easy to add with an in-memory or Redis token bucket. |
| **Username enumeration** | Low–Medium | The error messages for "user not found" vs "wrong password" differ slightly, letting an attacker confirm which emails are registered. | Return the same generic 401 with the same message for both cases. (5-minute fix.) |
| **Password policy is weak** | Low | Minimum 8 characters; no requirement for mixed case, digits, or symbols. | Either raise the minimum to 12 (NIST guidance) or add a complexity check. Or — better — integrate `haveibeenpwned`'s password-check API. |
| **No 2FA** | Low (depends on customer) | No TOTP, no email-OTP, no WebAuthn. | Out of scope for MVP. Add when a customer requires it (typically B2B contract gate). |
| **No anomaly detection** | Low | No "new device login" email, no impossible-travel detection, no failed-login spike alerts. | Build on top of the `LoginEvent` table once read-side surfaces (admin dashboards) exist. |
| **JWT secret rotation is a hard-reset** | Low | Rotating `JWT_SECRET` invalidates every session — acceptable for incident response, but no graceful key-rolling support. | Add multi-key support if SLA requires zero-downtime rotation. |
| **Refresh cookie not domain-scoped** | Low (until multi-subdomain) | Cookie has `path=/` and no `domain` attribute, so it's locked to the exact origin. Fine for single-domain deploys. | When deploying `app.example.com` + `api.example.com` separately, set `domain: '.example.com'` on the cookie. |
| **No audit UI** | Low | `LoginEvent` rows are written but never read by any admin surface. | Add a `/super-admin/audit-log` page showing recent failed-login spikes per school. |
| **No structured app telemetry** | Low | `console.error('Login error:', err)` works but isn't picked up by any aggregator. | Wire up a Sentry/Datadog/Posthog SDK in the catch blocks. |

### Bottom line

For a school-management SaaS in early stages: **yes, this is production-ready enough to launch**. The basics are solid (HttpOnly cookies, bcrypt, lockout, audit log, JWT secret enforcement), and the architecture leaves clean room to add the missing pieces incrementally without schema rewrites.

The order I'd address the gaps if growing past ~50 schools or onboarding a security-sensitive customer:

1. **DB-backed sessions + replay detection** (closes the refresh-token theft window).
2. **IP rate limit on /api/auth/login** (closes credential stuffing).
3. **Unified error messages** (closes username enumeration).
4. **Password policy + breach check**.
5. **2FA**, **anomaly detection**, **audit UI** — only when a customer asks or a real incident demands it.

Everything in (1)–(4) is implementable inside a week of focused work. None require breaking changes to the cookie/JWT structure documented in §1.

---

## 15. Change Log

| Date | Change |
|---|---|
| 2026-05-25 | **Major rewrite.** Auth migrated from localStorage JWT + `Authorization: Bearer` header to HttpOnly cookies (`erp_access` + `erp_refresh`). Removed Session-table / replay-detection sections that described an aspirational system never built. Added Production Readiness Assessment. |
| (earlier) | Original document described a session-table-backed model that was never implemented in code. |
