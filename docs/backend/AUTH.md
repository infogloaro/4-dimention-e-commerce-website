# Authentication

## Model
Opaque, server-side sessions — not JWTs — so they can be revoked instantly (logout, password change, suspension, role change).

* On login/register the server creates a random 256-bit token. Only `HMAC-SHA256(AUTH_SECRET, token)` is stored (`Session.tokenHash`); a database leak yields nothing replayable. Same for email-verification, password-reset, phone-OTP tokens and guest-cart tokens.
* Browsers receive it as an **`HttpOnly; Secure; SameSite=Lax`** cookie (`fourd_session`, 30-day sliding expiry). Non-browser clients send `X-Auth-Mode: token` on login/register/refresh to also get the token in the JSON body and use `Authorization: Bearer <token>`.
* `POST /auth/refresh` rotates the token (old one dies). `GET /auth/sessions` / `DELETE /auth/sessions/:id` let users review and revoke devices.

## Passwords
`scrypt` (N=2¹⁵, r=8, p=1, 16-byte salt) with parameters embedded in the hash for future upgrades; constant-time comparison; a dummy hash is verified for unknown emails so timing doesn't reveal which accounts exist. Policy: 8–128 chars with a letter and a number. Plaintext is never stored or logged.

## Flows
| Flow | Behaviour |
|---|---|
| Register | creates `customer`, sends verification email, logs in, **merges the guest cart** |
| Login | generic `INVALID_CREDENTIALS` for any failure; 5 bad passwords → 15-min lock (`ACCOUNT_LOCKED`, 423) + audit; suspended/banned → `ACCOUNT_DISABLED`; merges guest cart |
| Logout | revokes the session server-side, clears cookie, audited |
| Forgot password | always `202` with the same body; token valid 1 h, single use; reset revokes **all** sessions |
| Change password | requires current password; revokes other sessions |
| Email verify | 24 h single-use token (atomic claim — concurrent use can't double-spend) |
| Phone OTP | 6-digit code bound to the user id, 10 min, via the SMS abstraction |

Rate limits (per IP/user): login 10/15 min, register/refresh/verify 10/15 min, forgot/reset/OTP/change-password 5/15 min.

## CSRF
Cookie auth + `SameSite=Lax` **plus** an Origin/Referer allow-list check on every unsafe method (`CSRF_REJECTED`); requests with no Origin but `Sec-Fetch-Site: cross-site` are rejected. Bearer-token clients are not CSRF-able and skip the cookie rule. Webhooks opt out (they use signatures).

## Notification privacy
Reset/verification tokens and OTP codes are **redacted from the persisted outbox payload**; only the one in-flight message carries them. In dev the console provider keeps messages in an in-memory `devOutbox` (never in production).
