# Login & Session Flow

This document explains the complete authentication and session lifecycle: login, token issuance, refresh, lockout, manual unlock, password change, and logout. It covers every realistic scenario including failure paths and security guarantees.

---

## 1. Architecture Overview

The auth system uses a **two-token model**:

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (JWT) | 15 minutes | `localStorage` (`erp_token`) + `Authorization: Bearer` header | Identifies the user on every API call |
| Refresh token (opaque, 256-bit) | 30 days | HttpOnly cookie (`refresh_token`) | Used silently to mint a new access token when the JWT expires |

The DB stores only **SHA-256 hashes** of refresh tokens (never the raw value). Each token rotation creates a new row and links to its predecessor through `previousHash`, which is what enables replay detection.

### Key files

| Layer | File |
|---|---|
| Token signing / verification | [src/lib/auth.ts](src/lib/auth.ts) |
| Lockout, sessions, rate-limit helpers | [src/lib/auth-security.ts](src/lib/auth-security.ts) |
| Login route | [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts) |
| Refresh route | [src/app/api/auth/refresh/route.ts](src/app/api/auth/refresh/route.ts) |
| Logout (single device) | [src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts) |
| Logout (everywhere) | [src/app/api/auth/logout-all/route.ts](src/app/api/auth/logout-all/route.ts) |
| List / revoke sessions | [src/app/api/auth/sessions/route.ts](src/app/api/auth/sessions/route.ts), [src/app/api/auth/sessions/[id]/route.ts](src/app/api/auth/sessions/[id]/route.ts) |
| Password change | [src/app/api/auth/change-password/route.ts](src/app/api/auth/change-password/route.ts) |
| School-admin unlock | [src/app/api/school/users/[id]/unlock/route.ts](src/app/api/school/users/[id]/unlock/route.ts) |
| Super-admin unlock | [src/app/api/super-admin/users/[id]/unlock/route.ts](src/app/api/super-admin/users/[id]/unlock/route.ts) |
| Frontend API client (refresh interceptor) | [src/lib/api.ts](src/lib/api.ts) |
| Zustand auth store | [src/lib/store.ts](src/lib/store.ts) |
| Sessions UI (dropdown + dialog) | [src/components/app-layout.tsx](src/components/app-layout.tsx) |
| Locked-user UI + Unlock button | [src/features/admin/pages/school-users-page.tsx](src/features/admin/pages/school-users-page.tsx) |

### Database tables

- `User` — credentials + `failedLoginAttempts`, `lastLoginAt`
- `AccountLockout` — one-to-one with User; `lockedUntil`, `unlockedBy`, `unlockedAt`
- `LoginEvent` — append-only audit log (`SUCCESS`, `WRONG_PASSWORD`, `USER_NOT_FOUND`, `LOCKED`, `INACTIVE`, etc.)
- `Session` — refresh-token rows: `tokenHash` (unique), `previousHash`, `userAgent`, `ipAddress`, `expiresAt`, `revokedAt`, `revokeReason`

---

## 2. Login — Happy Path

User opens the login page and submits email + password.

### 2.1 Request

```
POST /api/auth/login
{ "email": "admin@school.com", "password": "..." }
```

### 2.2 Server pipeline (in order)

The login route runs the following checks in strict order — each step can short-circuit with a specific reason logged to `LoginEvent`.

1. **Rate-limit check** — token bucket in [src/lib/auth-security.ts](src/lib/auth-security.ts):
   - Per email: 5 attempts / 15 min
   - Per IP: 15 attempts / 15 min
   - Exceeded → `429 Too Many Requests`, no DB write.
2. **User lookup** by lowercased email. Missing user → log `USER_NOT_FOUND`, return generic `401 Invalid credentials` (does not leak whether email exists).
3. **`isActive` / `deletedAt` check** — disabled or soft-deleted users get `LoginEvent: INACTIVE` and `401`.
4. **Account lockout check** — `isAccountLocked(userId)`:
   - If `AccountLockout.lockedUntil > now()` → log `LOCKED`, return `423` with `lockedUntil` so the UI can show countdown.
5. **Password verify** — `bcrypt.compare()`. The cost factor is embedded in the stored hash, so old hashes still verify.
   - Wrong → `recordLoginFailure()` increments `User.failedLoginAttempts`. On 5th fail, creates/updates `AccountLockout` with `lockedUntil = now() + 15 min`. Log `WRONG_PASSWORD` or `LOCKED` on the trigger attempt.
6. **Success** path (covered in §2.3).

### 2.3 Success path

After password verifies:

- `resetLoginFailures(userId)` — clears `failedLoginAttempts`, deletes `AccountLockout` row.
- Updates `User.lastLoginAt`.
- `logLoginEvent(SUCCESS)` — records IP + UA.
- `generateToken({ userId, email, role, schoolId })` — signs a 15-minute JWT.
- `createSession(userId, userAgent, ipAddress)`:
  - Generates 32 random bytes → base64url string. This is the raw refresh token.
  - Hashes with SHA-256 → `tokenHash`. Stores: `userId`, `tokenHash`, `userAgent`, `ipAddress`, `expiresAt = now() + 30 days`.
  - Returns `{ rawToken, expiresAt }`. The raw token never goes back to the DB.
- Response sets the cookie:
  ```ts
  response.cookies.set('refresh_token', session.rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    expires: session.expiresAt,
  })
  ```
- JSON body returns the access token + minimal user object:
  ```json
  { "token": "<jwt>", "user": { "id": "...", "email": "...", "role": "...", ... } }
  ```

### 2.4 Client side

[src/lib/store.ts](src/lib/store.ts) `login(user, token)`:

- Writes `erp_token` and a slim user object (without avatar) to `localStorage`.
- Sets `isAuthenticated: true`.

From now on every API request includes:

- `Authorization: Bearer <jwt>` header (from store), and
- The browser auto-attaches the `refresh_token` cookie because all calls use `credentials: 'include'`.

---

## 3. Login — Failure Scenarios

### 3.1 Wrong password (under 5 fails)

- `User.failedLoginAttempts += 1`.
- `LoginEvent: WRONG_PASSWORD`.
- Returns generic `401`. UI shows "Wrong credentials".

### 3.2 5th wrong password — auto-lock

- `failedLoginAttempts` hits 5.
- Upserts `AccountLockout { userId, lockedUntil = now()+15min, attempts: 5 }`.
- `LoginEvent: LOCKED`.
- Returns `423` with `lockedUntil` ISO timestamp.

UI flow: the login form switches to a "Account temporarily locked" panel with a live countdown.

### 3.3 6th attempt while locked

- Step 4 (lockout check) returns `423` without touching the password. The clock does **not** extend on additional attempts — locked users can't keep extending their own lock.

### 3.4 Rate limit hit before any DB call

- 6 attempts / 15 min for the same email → `429`. Useful against credential-stuffing where the attacker doesn't even know the password.

### 3.5 Inactive / deleted user

- `LoginEvent: INACTIVE`.
- Returns generic `401` ("Invalid credentials") so we don't leak whether the account exists vs was disabled.

### 3.6 Unknown email

- `LoginEvent: USER_NOT_FOUND` (with the attempted email, for forensic value).
- Returns the same generic `401`.

---

## 4. Manual Unlock

When a school admin is locked at 9 AM and needs to be back in immediately, the 15-min wait isn't acceptable. We provide two endpoints:

### 4.1 SCHOOL_ADMIN unlocking own-school user

`POST /api/school/users/:id/unlock` → [src/app/api/school/users/[id]/unlock/route.ts](src/app/api/school/users/[id]/unlock/route.ts)

Rules:

- Requester must be `SCHOOL_ADMIN`.
- Target must be in the **same school** (`target.schoolId === requester.schoolId`). Cross-school → `403`.
- Target's role must NOT be `SCHOOL_ADMIN` or `SUPER_ADMIN`. Locked admins must escalate to a super-admin to prevent peer-admin collusion → `403`.

On success:

- Calls `manualUnlock(targetId, requesterId)` which:
  - Sets `User.failedLoginAttempts = 0`.
  - Updates `AccountLockout` with `unlockedBy`, `unlockedAt`, `lockedUntil = now()` (so `isAccountLocked` returns false).
- Logs `LoginEvent: MANUAL_UNLOCK` with both user IDs in metadata.

UI: lock icon + red "Locked until 9:15 AM" banner with "Unlock Now" button on the user detail card in [src/features/admin/pages/school-users-page.tsx](src/features/admin/pages/school-users-page.tsx).

### 4.2 SUPER_ADMIN unlocking anyone

`POST /api/super-admin/users/:id/unlock` → [src/app/api/super-admin/users/[id]/unlock/route.ts](src/app/api/super-admin/users/[id]/unlock/route.ts)

Same `manualUnlock` helper, but no school-scope check and no role restriction. This is the escape hatch for locked SCHOOL_ADMINs.

---

## 5. Access Token Expiry & Silent Refresh

Access tokens live 15 minutes. After that, any API call returns `401`. The frontend silently rotates via the refresh cookie — the user never sees a logout.

### 5.1 Interceptor in [src/lib/api.ts](src/lib/api.ts)

```
fetchWithRetry()
  ↓ response.status === 401
  ↓ message is the generic "session expired" message (not server-specific)
  ↓ not an /api/auth/* endpoint
  ↓ alreadyRefreshed flag === false
  ↓
tryRefresh()
  ↓ POST /api/auth/refresh  (browser sends refresh_token cookie automatically)
  ↓ on success: store.setToken(newJwt)
  ↓
retry original request with Authorization: Bearer <newJwt>
```

A **singleton `refreshPromise`** ensures that if 10 API calls 401 in parallel, we only hit `/api/auth/refresh` once. The promise is cleared on the next tick so a later 401 (e.g. 14 min later) still triggers a fresh refresh.

If refresh itself returns 401 (refresh token expired or revoked), `useAppStore.getState().logout()` runs and the UI bounces to the login page.

### 5.2 Server side — refresh route

[src/app/api/auth/refresh/route.ts](src/app/api/auth/refresh/route.ts):

1. Reads `refresh_token` cookie. Missing → `401` + clear cookie.
2. `rotateSession(rawToken, userAgent, ipAddress)`:
   - Hashes the presented token.
   - Looks up the Session row by `tokenHash`.
   - **Three rejection cases** (all return `null` → caller emits `401`):
     - Session not found.
     - Session is revoked or expired.
     - **Replay detection** — see §6.
   - On accept: revoke current session (`revokeReason: ROTATED`), create new session with `previousHash` pointing at the old one's hash, update `User.lastLoginAt`.
3. Re-fetches the user (not just decoded values) so the new JWT reflects current `role`, `isActive`, `schoolId`, `deletedAt` state.
4. Issues new 15-min JWT + sets new refresh cookie with the rotated raw token.
5. If user is now inactive/deleted, route returns `401` and clears cookie even though the refresh chain was technically valid.

---

## 6. Refresh Token Theft & Replay Detection

The chain of `previousHash` links lets us detect a stolen refresh token even though the DB only stores hashes.

### 6.1 Normal rotation

```
T0: cookie holds RT1.  Session row: tokenHash=H(RT1), previousHash=null
    POST /refresh
    → revoke session, create new row: tokenHash=H(RT2), previousHash=H(RT1)
    → cookie now holds RT2

T1: cookie holds RT2.  POST /refresh
    → revoke RT2 row, create row: tokenHash=H(RT3), previousHash=H(RT2)
```

### 6.2 Theft scenario

Attacker grabs RT1 (via XSS, malware, etc.) before the legitimate browser uses it.

```
Legit browser:   T0 → refresh → got RT2.  (RT1 row is revoked)
Attacker:        T1 → presents RT1
```

`rotateSession` sees RT1 in the DB but `revokedAt !== null`. Instead of just rejecting:

- Look up "is there ANY session for this user whose `previousHash === H(RT1)`?" → yes (RT2 row).
- That means RT1 was rotated AND someone is still trying to use it → **theft confirmed**.
- `revokeAllSessionsForUser(userId, 'TOKEN_REPLAY')` — every session for this user is killed.
- Both attacker and legit browser will be forced to re-login next time their access token expires.

This is the canonical OAuth refresh-token rotation defense. The user loses 1–15 min of access (worst case) but the attacker is permanently locked out.

---

## 7. Password Change

`POST /api/auth/change-password` → [src/app/api/auth/change-password/route.ts](src/app/api/auth/change-password/route.ts)

Pipeline:

1. `requireAuth` — must be logged in.
2. Verify `currentPassword` against stored hash.
3. `validatePasswordStrength(newPassword)` — min 8 chars, mixed case, digit, symbol.
4. Reject `newPassword === currentPassword`.
5. Hash new password with bcrypt cost 12, save.
6. **`revokeAllSessionsForUser(userId, 'PASSWORD_CHANGE')`** — kills every refresh session.
7. Immediately `createSession()` for the **current** device and set a new cookie.
8. Response includes a new JWT.

**Effect**: every other device this user was logged in on gets booted on its next refresh (within 15 min). The current device stays logged in seamlessly. This is the right behavior because the most common reason to change a password is "I think someone may have it".

---

## 8. Logout

### 8.1 Single device

`POST /api/auth/logout` → [src/app/api/auth/logout/route.ts](src/app/api/auth/logout/route.ts)

- Reads cookie.
- `revokeSessionByToken(rawToken, 'LOGOUT')` — marks just that one Session row revoked.
- Clears the cookie.

Client: `app-layout.handleLogout` fires this BEFORE clearing the local store, so even if the network call fails the user still ends up logged out locally (the access token expires in ≤15 min anyway).

### 8.2 Everywhere

`POST /api/auth/logout-all` → [src/app/api/auth/logout-all/route.ts](src/app/api/auth/logout-all/route.ts)

- `requireAuth`.
- `revokeAllSessionsForUser(user.userId, 'LOGOUT_ALL')` — revokes every Session row for the user.
- Triggered from the **Active Sessions** dialog → "Sign out everywhere" destructive button in [src/components/app-layout.tsx](src/components/app-layout.tsx).

---

## 9. Active Sessions UI

Visible from the user-avatar dropdown → "Active Sessions" → opens a dialog listing every non-revoked session.

`GET /api/auth/sessions` → [src/app/api/auth/sessions/route.ts](src/app/api/auth/sessions/route.ts)

For each session returns: `id`, `userAgent`, `ipAddress`, `createdAt`, `lastUsedAt`, `expiresAt`, and `isCurrent`.

`isCurrent` detection: the route hashes the incoming `refresh_token` cookie and matches it against each row's `tokenHash`. Exactly one row should match per request; that one gets `isCurrent: true` and is rendered with a "This device" badge.

Per-row delete: `DELETE /api/auth/sessions/:id` → revokes just that session. Ownership check enforced (treats other users' session IDs as 404 to avoid leaking existence).

---

## 10. Token Lifecycles — Side-by-Side

| Event | Access Token | Refresh Cookie | Session DB Row |
|---|---|---|---|
| Login | New 15-min JWT issued | New raw token set | New row, `previousHash=null` |
| Silent refresh | Replaced in store | Replaced (rotated) | Old row → `revokedAt + reason=ROTATED`. New row inserted with `previousHash` pointing back |
| Logout (this device) | Stays in memory until reload, but useless after 15 min | Deleted | Current row `revokedAt + reason=LOGOUT` |
| Logout everywhere | Same | Deleted | All rows for user → `revokedAt + reason=LOGOUT_ALL` |
| Password change | New JWT for current device | New cookie for current device | All other rows → `revokeReason=PASSWORD_CHANGE`. New row for current device |
| Token replay detected | (next 401 logs user out) | (next call clears it) | All rows for user → `revokeReason=TOKEN_REPLAY` |
| Admin unlock | n/a (user not logged in) | n/a | n/a — only `AccountLockout` is cleared and `failedLoginAttempts` reset |

---

## 11. Rate Limit & Lockout Constants

Defined in [src/lib/auth-security.ts](src/lib/auth-security.ts):

| Setting | Value | Why |
|---|---|---|
| Access token TTL | 15 min | Short enough to limit damage from a stolen JWT; long enough that normal browsing doesn't hammer `/refresh` |
| Refresh token TTL | 30 days | Standard "stay logged in" window |
| Max failed logins before lock | 5 | Industry default |
| Lock duration | 15 min | Discourages bots without permanently DOSing real users |
| Rate limit per email | 5 / 15 min | Catches the obvious case |
| Rate limit per IP | 15 / 15 min | Catches multi-account credential stuffing from one origin |
| bcrypt cost | 12 | ~250 ms per hash — slow enough to be costly to brute force |

---

## 12. Cookie Security Posture

```ts
{
  httpOnly: true,                                  // JS can't read it → XSS can't exfiltrate
  secure: process.env.NODE_ENV === 'production',  // HTTPS-only in prod
  sameSite: 'lax',                                 // CSRF protection (top-level GETs allowed, cross-site POSTs blocked)
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
  expires: <30d from now>,
}
```

The HttpOnly attribute is critical — together with the fact that we never write the refresh token to `localStorage`, an XSS-injected script can read the access JWT but not the refresh token. The blast radius of any XSS is therefore capped at 15 minutes.

---

## 13. End-to-End Walkthroughs

### 13.1 First-time login → 12-hour workday

```
09:00  Login → JWT15min + refresh cookie set
09:00–09:15  All API calls use JWT directly
09:15  First 401 → interceptor calls /refresh → new JWT + rotated cookie → original call retried, user notices nothing
09:15–09:30  …
...
21:00  User clicks "Sign out" → POST /logout → cookie deleted, current session row revoked → bounce to login page
```

### 13.2 Forgotten laptop scenario

```
User loses laptop at airport.
From phone:
  Login (new session row created for phone)
  Open Active Sessions dialog → sees "Chrome on Windows · last used 2 hrs ago"
  Clicks revoke → DELETE /api/auth/sessions/<id>
  Laptop's next refresh attempt returns 401 → laptop logs out
Alternative: clicks "Sign out everywhere" → phone also gets booted, has to log in fresh.
```

### 13.3 Compromised credentials suspected

```
User: changes password.
Server:
  revokes ALL sessions for user with reason=PASSWORD_CHANGE
  creates fresh session for current device
  responds with new JWT + cookie
Other devices: within 15 min, their access token expires → /refresh returns 401 (their refresh row is revoked) → forced re-login.
Attacker (if they had a stolen refresh token): also gets booted on next refresh.
```

### 13.4 School admin locked at 9 AM

```
School admin typos password 5 times → locked until 09:15.
Calls colleague (another SCHOOL_ADMIN in same school) — can't help (same role can't unlock peers).
Calls super-admin → super-admin opens user detail, clicks "Unlock Now" → POST /api/super-admin/users/:id/unlock
   → manualUnlock() clears AccountLockout, resets attempts to 0, logs MANUAL_UNLOCK event with super-admin's ID.
Admin retries login at 09:03 → succeeds.
```

### 13.5 Brute force attacker

```
Attacker hits /api/auth/login with target email + 5 wrong passwords in 30 seconds.
  Attempt 1–4: failedLoginAttempts incremented, generic 401.
  Attempt 5: failedLoginAttempts=5 → AccountLockout created → 423 + lockedUntil.
  Attempt 6: lockout check fires first → 423 (does not extend the lock).
After 5 attempts via /api/auth/login on the same email → rate-limit bucket also empty → 429 for next 15 min.
After 15 attempts from same IP regardless of email → 429.
Legit user can either wait 15 min, or ask an admin to unlock immediately.
```

### 13.6 Refresh token replayed (stolen)

```
T0  Legit browser: refresh → got RT2. RT1 row marked revoked, RT2 row created with previousHash=H(RT1).
T1  Attacker (had stolen RT1): /refresh with RT1.
    Server: H(RT1) found but row is revoked. Check: any row with previousHash=H(RT1)? Yes (RT2).
    → revokeAllSessionsForUser(reason=TOKEN_REPLAY)
    → return 401 + clear attacker's cookie.
T1+1min  Legit browser's JWT expires → /refresh with RT2 → row is now revoked → 401 → forced re-login.
Net result: 1 forced re-login for the user, permanent lockout for the attacker.
```

---

## 14. What is NOT Yet Implemented

- IP-based block lists for known bad actors.
- Geo-velocity checks ("you logged in from India 30 sec after logging in from Brazil").
- Optional 2FA / TOTP.
- Email notification on new device login.
- Admin UI for browsing the `LoginEvent` audit log (rows are written but no read-side surface yet).

These are deliberately out of scope for the first hardening pass; the foundations (events, sessions, lockout audit) are in place to add them later without schema changes.
