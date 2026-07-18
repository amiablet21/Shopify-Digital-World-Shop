// Digital World Shop identity provider.
// A minimal OIDC provider that Shopify customer accounts can use as an
// external identity provider, giving the store a fully custom login page.
//
// Shopify's requirements this service meets (see docs/CUSTOM-LOGIN.md):
//   - OIDC authorization code flow with discovery
//   - email as the unique identifier, email_verified: true in the ID token
//   - refresh tokens for long-lived sessions
//   - RP-Initiated Logout 1.0
//   - fast token/userinfo endpoints (in-memory adapter, no network hops)
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Provider from 'oidc-provider';
import {
  clearFailures,
  findAccount,
  findUser,
  isLocked,
  recordFailure,
  verifyPassword,
} from './accounts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ISSUER = process.env.ISSUER || `http://localhost:${PORT}`;
const PRODUCTION = process.env.NODE_ENV === 'production';

// Refuse to boot in production with development fallbacks.
if (PRODUCTION) {
  const problems = [];
  if (!process.env.COOKIE_KEY || process.env.COOKIE_KEY.includes('change-me') || process.env.COOKIE_KEY.length < 32) {
    problems.push('COOKIE_KEY must be a random string of at least 32 characters');
  }
  if (!process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_CLIENT_SECRET.includes('change-me') || process.env.SHOPIFY_CLIENT_SECRET.length < 32) {
    problems.push('SHOPIFY_CLIENT_SECRET must be a random string of at least 32 characters');
  }
  if (!ISSUER.startsWith('https://')) {
    problems.push('ISSUER must be an https URL');
  }
  if (problems.length) {
    console.error('Refusing to start in production:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

const configuration = {
  clients: [
    {
      client_id: process.env.SHOPIFY_CLIENT_ID || 'shopify-dev',
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || 'dev-secret-change-me',
      redirect_uris: (process.env.SHOPIFY_REDIRECT_URIS || `http://localhost:${PORT}/dev/callback`).split(','),
      post_logout_redirect_uris: (process.env.SHOPIFY_POST_LOGOUT_URIS || '').split(',').filter(Boolean),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: process.env.CLIENT_AUTH_METHOD || 'client_secret_basic',
    },
  ],
  findAccount,
  scopes: ['openid', 'email', 'profile', 'offline_access'],
  claims: {
    openid: ['sub'],
    email: ['email', 'email_verified'],
    profile: ['name'],
  },
  pkce: { required: () => false },
  // Shopify requires email and email_verified inside the ID token itself,
  // not only at the userinfo endpoint.
  conformIdTokenClaims: false,
  interactions: {
    url: (ctx, interaction) => `/interaction/${interaction.uid}`,
  },
  features: {
    devInteractions: { enabled: false },
    rpInitiatedLogout: {
      enabled: true,
      // Auto-submit the logout confirmation so sign-out is seamless for the buyer.
      logoutSource: async (ctx, form) => {
        ctx.body = `<!DOCTYPE html><html><head><title>Signing out</title></head><body>
          ${form}
          <script>
            var f = document.forms[0];
            var i = document.createElement('input');
            i.type = 'hidden'; i.name = 'logout'; i.value = 'yes';
            f.appendChild(i); f.submit();
          </script>
        </body></html>`;
      },
      postLogoutSuccessSource: async (ctx) => {
        ctx.body = `<!DOCTYPE html><html><head><title>Signed out</title></head>
          <body style="font-family:system-ui;padding:4rem;text-align:center">Signed out.</body></html>`;
      },
    },
  },
  issueRefreshToken: async (ctx, client) => client.grantTypeAllowed('refresh_token'),
  rotateRefreshToken: true,
  // First-party auto-consent: Shopify is our own storefront, so no consent screen.
  async loadExistingGrant(ctx) {
    const grantId = ctx.oidc.result?.consent?.grantId || ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId);
    if (grantId) {
      const grant = await ctx.oidc.provider.Grant.find(grantId);
      if (grant) return grant;
    }
    const grant = new ctx.oidc.provider.Grant({
      clientId: ctx.oidc.client.clientId,
      accountId: ctx.oidc.session.accountId,
    });
    grant.addOIDCScope('openid email profile offline_access');
    grant.addOIDCClaims(['email', 'email_verified', 'name']);
    await grant.save();
    return grant;
  },
  cookies: {
    keys: [process.env.COOKIE_KEY || 'dev-cookie-key-change-me'],
  },
  ttl: {
    Session: 14 * 24 * 60 * 60,
    Grant: 14 * 24 * 60 * 60,
    Interaction: 60 * 60,
    AccessToken: 60 * 60,
    IdToken: 60 * 60,
    RefreshToken: 30 * 24 * 60 * 60,
  },
};

const provider = new Provider(ISSUER, configuration);
provider.proxy = true;

const app = express();
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.set('trust proxy', true);
app.disable('x-powered-by');

// Security headers on every response.
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  if (PRODUCTION) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Per-IP rate limits: gentle on page loads, strict on credential attempts.
const pageLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});
app.use('/interaction', pageLimiter);

const parseForm = express.urlencoded({ extended: false });

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Local-only helper so the flow can be exercised without Shopify.
app.get('/dev/callback', (req, res) => {
  res.type('text').send(`OIDC redirect received.\ncode=${req.query.code || ''}\nstate=${req.query.state || ''}`);
});

app.get('/interaction/:uid', async (req, res, next) => {
  try {
    const details = await provider.interactionDetails(req, res);
    if (details.prompt.name === 'login') {
      return res.render('login', { uid: details.uid, error: null, email: '' });
    }
    // Consent is auto-granted via loadExistingGrant; any other prompt is unexpected.
    return res.status(400).render('login', { uid: details.uid, error: 'Unexpected sign-in state. Start again from the store.', email: '' });
  } catch (err) {
    return next(err);
  }
});

app.post('/interaction/:uid/login', loginLimiter, parseForm, async (req, res, next) => {
  try {
    await provider.interactionDetails(req, res);
    const email = String(req.body.email || '');
    const password = String(req.body.password || '');
    const user = findUser(email);
    if (user && isLocked(user)) {
      return res.status(429).render('login', {
        uid: req.params.uid,
        error: 'Too many failed attempts. This account is locked for 15 minutes.',
        email,
      });
    }
    if (!user || !verifyPassword(user, password)) {
      if (user) recordFailure(email);
      // Same message whether the account exists or not: no account enumeration.
      return res.status(401).render('login', { uid: req.params.uid, error: 'Email or password is incorrect.', email });
    }
    clearFailures(email);
    return await provider.interactionFinished(
      req,
      res,
      { login: { accountId: user.id, remember: true } },
      { mergeWithLastSubmission: false }
    );
  } catch (err) {
    return next(err);
  }
});

app.use(provider.callback());

app.listen(PORT, () => {
  console.log(`dw-identity listening on ${ISSUER} (port ${PORT})`);
  console.log(`discovery: ${ISSUER}/.well-known/openid-configuration`);
});
