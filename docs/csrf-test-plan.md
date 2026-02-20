# CSRF Test Plan

**Test file:** `tests/csrf.test.ts`
**Method:** Direct unit tests — import from `lib/csrf.ts` and `next/headers` mock.
No server or DB required.

---

## Implementation map

```
generateCsrfToken()          — pure, no external deps
verifyCsrfToken(token)       — pure, no external deps
requireCsrf(request)         — calls validateCsrfRequest() only for non-exempt paths
validateCsrfRequest(request) — calls getCsrfTokenFromCookie() → cookies() ← needs mock
getCsrfTokenFromCookie()     — calls next/headers cookies() ← needs mock
setCsrfCookie()              — calls next/headers cookies() ← needs mock (not tested here)
```

---

## Setup constraints

### Constraint 1 — Module-scoped `CSRF_SECRET`

```ts
const CSRF_SECRET = getCsrfSecret(); // line 18 — runs at import time
```

The secret is captured once when the module is first imported. `vi.stubEnv("CSRF_SECRET", "...")` in `beforeEach` or `beforeAll` is **too late** — the value is already frozen.

**Fix**: set `CSRF_SECRET` in `vitest.config.ts` under `env` so it is present before any
module is imported. All tests in the session share the same secret — this is fine as long
as you use `generateCsrfToken()` to create valid tokens rather than hardcoding HMAC values.

To test behaviour with a **wrong secret** (token signed by a different secret), craft the
HMAC manually in the test using a different key and pass the result as the
`providedSignature` part of the token string — no module re-import needed.

### Constraint 2 — `cookies()` from `next/headers`

`getCsrfTokenFromCookie()` calls `cookies()` which only works inside a real Next.js
request context. Mock the module once at file scope:

```ts
import { cookies } from "next/headers";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

// per test that needs a cookie value:
(cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
  get: vi.fn().mockReturnValue({ value: someToken }),
});
```

Tests for `requireCsrf` on exempt paths (webhook, GET) never reach `validateCsrfRequest`
so they do **not** need the `cookies()` mock.

### Constraint 3 — constructing valid tokens in tests

Call `generateCsrfToken()` directly — it is a pure function with no external deps and uses
the same `CSRF_SECRET` as `verifyCsrfToken`. This gives a real signed token without
reimplementing the HMAC.

```ts
const validToken = generateCsrfToken(); // use for positive-path tests
```

---

## Section A — `generateCsrfToken()`

| # | Assertion |
|---|---|
| A1 | Output has exactly 3 colon-separated parts |
| A2 | Part 0 (timestamp) is a numeric string within ±5 seconds of `Date.now()` |
| A3 | Part 1 (randomPart) matches `/^[a-f0-9]{32}$/` (16 random bytes → 32 hex chars) |
| A4 | Part 2 (signature) matches `/^[a-f0-9]{64}$/` (SHA-256 HMAC → 64 hex chars) |
| A5 | Two consecutive calls produce different tokens (randomness) |
| A6 | `verifyCsrfToken(generateCsrfToken())` returns `true` (round-trip) |

---

## Section B — `verifyCsrfToken(token)` — all pure, no mocks needed

### B1. Valid token
```ts
verifyCsrfToken(generateCsrfToken()) === true
```

### B2. Empty / falsy inputs
| Input | Expected |
|---|---|
| `""` | `false` |
| `null as any` | `false` |
| `undefined as any` | `false` |

### B3. Wrong number of parts
| Input | Expected | Reason |
|---|---|---|
| `"ts:random"` (2 parts) | `false` | `parts.length !== 3` |
| `"ts:random:sig:extra"` (4 parts) | `false` | same check |
| `"noseparators"` (1 part) | `false` | same check |

### B4. Expired token (timestamp > 24h ago)
Craft a token with an old timestamp but a valid signature:
```ts
const oldTs = (Date.now() - 25 * 60 * 60 * 1000).toString();
const random = crypto.randomBytes(16).toString("hex");
const data = `${oldTs}:${random}`;
const sig = crypto.createHmac("sha256", CSRF_SECRET).update(data).digest("hex");
const expiredToken = `${data}:${sig}`;

verifyCsrfToken(expiredToken) === false
```

### B5. Future timestamp (`tokenAge < 0`)
Same as B4 but `timestamp = Date.now() + 60_000` (1 minute in the future).
`verifyCsrfToken(futureToken) === false`

### B6. Tampered timestamp
Take a valid token, flip one digit in the timestamp part.
`verifyCsrfToken(tamperedToken) === false` — signature mismatch.

### B7. Tampered randomPart
Take a valid token, flip one char in the random part.
`verifyCsrfToken(tamperedToken) === false` — signature mismatch.

### B8. Tampered signature
Take a valid token, flip one hex char in the signature part.
`verifyCsrfToken(tamperedToken) === false` — `timingSafeEqual` returns false.

### B9. Odd-length hex signature → `Buffer.from` throws → caught → `false`
```ts
const [ts, rand] = generateCsrfToken().split(":");
const oddSigToken = `${ts}:${rand}:abc`; // "abc" is 3 chars — odd length
verifyCsrfToken(oddSigToken) === false
```
This exercises the `catch` block in `verifyCsrfToken` (line 67).

### B10. Wrong secret
Compute a token signed with a **different** HMAC key:
```ts
const ts = Date.now().toString();
const rand = crypto.randomBytes(16).toString("hex");
const data = `${ts}:${rand}`;
const wrongSig = crypto.createHmac("sha256", "wrong-secret").update(data).digest("hex");
const wrongSecretToken = `${data}:${wrongSig}`;

verifyCsrfToken(wrongSecretToken) === false
```

---

## Section C — `requireCsrf(request)` — exempt paths

These paths exit before calling `validateCsrfRequest`, so no `cookies()` mock is needed.
Construct a minimal `Request` object for each case.

| # | Method | Path | Expected |
|---|---|---|---|
| C1 | `POST` | `/api/webhooks/razorpay/verify` | `{ valid: true }` |
| C2 | `POST` | `/api/webhooks/shiprocket` | `{ valid: true }` |
| C3 | `GET` | `/api/seller/products` | `{ valid: true }` |
| C4 | `HEAD` | `/api/checkout` | `{ valid: true }` |
| C5 | `OPTIONS` | `/api/checkout` | `{ valid: true }` |
| C6 | `POST` | `/api/seller/products` (no header) | `{ valid: false, error: "..." }` — non-exempt, falls through to `validateCsrfRequest` |

C6 confirms the non-exempt path does reach `validateCsrfRequest`. It will need the
`cookies()` mock returning `undefined` to simulate a missing cookie.

---

## Section D — `validateCsrfRequest(request)` — needs `cookies()` mock

All cases use a synthetic `POST` `Request` to `/api/seller/products`.
`cookies()` mock is set per-test in `beforeEach` reset pattern.

| # | `x-csrf-token` header | `csrf_token` cookie | Expected |
|---|---|---|---|
| D1 | valid token A | same token A (matching) | `true` |
| D2 | absent | valid token | `false` — header missing |
| D3 | valid token | absent (`cookies.get` returns `undefined`) | `false` — cookie missing |
| D4 | token A | token B (different valid token) | `false` — tokens don't match (line 116: `headerToken === cookieToken`) |
| D5 | valid token | tampered token (wrong sig) | `false` — cookie fails `verifyCsrfToken` |
| D6 | tampered token (wrong sig) | valid token | `false` — header fails `verifyCsrfToken` |
| D7 | expired token | same expired token | `false` — both fail `verifyCsrfToken` |

**D4 is the most important case** — it tests the double-submit binding. An attacker can
craft a valid token and put it in the header, but cannot set the `SameSite=Strict` cookie
from a cross-origin context. Without a matching cookie, the check fails even with a
cryptographically valid header token.

---

## Mock setup (once per file)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import crypto from "crypto";
import {
  generateCsrfToken,
  verifyCsrfToken,
  requireCsrf,
  validateCsrfRequest,
} from "@/lib/csrf";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const mockCookies = cookies as ReturnType<typeof vi.fn>;

function makeCookieStore(tokenValue: string | undefined) {
  return {
    get: vi.fn().mockReturnValue(tokenValue ? { value: tokenValue } : undefined),
  };
}

function makeRequest(path: string, method: string, headerToken?: string): Request {
  const headers: Record<string, string> = {};
  if (headerToken !== undefined) headers["x-csrf-token"] = headerToken;
  return new Request(`http://localhost${path}`, { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Relation to section E (HTTP wiring tests in `api-security.test.ts`)

Section E tests that `/api/seller/products` and other routes correctly call `requireCsrf`
and return 403 when it fails. Those tests do **not** duplicate the logic tested here.
The split is:

| What | Where |
|---|---|
| CSRF logic correctness | `tests/csrf.test.ts` (this file) |
| Routes are wired to call `requireCsrf` | `tests/api-security.test.ts` section E |
