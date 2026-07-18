# Custom Login (Own Identity Provider)

`identity/` is a self-hosted OIDC identity provider. Once connected, Shopify's
"Sign in" sends buyers to **our** login page (Digital World Shop design,
email + password) instead of Shopify's hosted code-entry screen. Shopify links
the session to the Shopify customer by verified email, so order history,
checkout, tags and price gating all keep working natively.

## How it meets Shopify's requirements

| Shopify requirement | How |
|---|---|
| OIDC-compliant, discovery document | `oidc-provider` library, `/.well-known/openid-configuration` |
| Email as unique identifier, verified | `sub` = email; `email_verified: true` (accounts only exist via the approval flow) |
| Required ID-token claims (sub, nonce, email, email_verified, iss, aud) | verified end-to-end in the smoke test |
| Refresh tokens for long sessions | `offline_access` scope, rotation enabled, 30-day TTL |
| RP-Initiated Logout 1.0 | enabled, auto-submitting confirmation |
| Endpoints respond within 1 second | in-process stores, userinfo measured at ~3 ms |

## Local development

```bash
cd identity
npm install
npm run create-user -- buyer@company.com "password" "Buyer Name"
npm start
# discovery: http://localhost:3000/.well-known/openid-configuration
```

## Going live (in order)

1. **Deploy** `identity/` to Railway/Fly/Render behind HTTPS on a subdomain,
   for example `id.digitalworldshopus.com`. Set `ISSUER` to that URL.
2. In Shopify admin: **Settings → Customer accounts → Sign-in options →
   Connect identity provider**. Shopify shows the redirect URI and asks for the
   discovery URL, client id and client secret.
3. Fill `.env` from `.env.example`: paste Shopify's redirect URI into
   `SHOPIFY_REDIRECT_URIS`, choose a client id, generate long random values for
   `SHOPIFY_CLIENT_SECRET` and `COOKIE_KEY`, and match `CLIENT_AUTH_METHOD` to
   what the Shopify connect screen specifies.
4. Test with a staff account before enforcing for all customers.

## Hardening in place

- Per-IP rate limits (20 credential attempts per 5 minutes) and per-account
  lockout (5 failed passwords locks the account for 15 minutes).
- Identical error for wrong password and unknown email: no account enumeration.
- Security headers (frame denial, nosniff, no-referrer, HSTS in production).
- Production boot guards: refuses to start without strong COOKIE_KEY and
  SHOPIFY_CLIENT_SECRET values and an https ISSUER.
- bcrypt cost 12 password hashes; accounts exist only via the approval flow
  (no open registration surface).

## Before real traffic (remaining gaps)

- **Persistence**: users live in a JSON file and sessions/tokens in memory, so
  every redeploy logs buyers out. Swap in the Postgres (or Redis) adapter for
  `oidc-provider` and move users to the same database the offers app will use.
- **Password reset**: not built yet. Needs a "forgot password" email flow.
- **Provisioning**: users are created by CLI today. The account-application
  approval flow in the custom app should create the identity user AND the
  Shopify customer (with the `approved` tag) in one step, so the same approval
  unlocks login and pricing.
- **Monitoring**: point an uptime check at /healthz; login being down means
  buyers cannot see prices.
