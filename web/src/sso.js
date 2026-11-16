// Company sign-in: Google and Microsoft (OpenID Connect, authorization code with PKCE) and Sign in with Apple.
// MK Cards registers one app with each provider; its client ID and secret are Worker secrets:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.
// Apple sign-in comes from the iPhone app; its identity token is checked against Apple's published keys.
import { fromB64url, jwtClaims, jwtHeader, sha256hex } from './secure.js';

const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    id: 'GOOGLE_CLIENT_ID',
    secret: 'GOOGLE_CLIENT_SECRET',
    issuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
  },
  microsoft: {
    // "organizations": work and school accounts only, from any company's Microsoft Entra ID.
    authorize: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    scope: 'openid email profile',
    id: 'MICROSOFT_CLIENT_ID',
    secret: 'MICROSOFT_CLIENT_SECRET',
    issuer: (iss, claims) => iss === `https://login.microsoftonline.com/${claims.tid}/v2.0`,
  },
};

export const SSO_PROVIDERS = Object.keys(PROVIDERS);

export function ssoStatus(env) {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  };
}

// Local tests point the provider at a stand-in server (set only in .dev.vars).
function endpoints(env, name) {
  const p = PROVIDERS[name];
  if (env.SSO_TEST_BASE) return { ...p, authorize: `${env.SSO_TEST_BASE}/${name}/authorize`, token: `${env.SSO_TEST_BASE}/${name}/token`, issuer: () => true };
  return p;
}

export function authorizeUrl(env, name, { redirectUri, state, nonce, challenge, hint }) {
  const p = endpoints(env, name);
  const q = new URLSearchParams({
    client_id: env[p.id], response_type: 'code', redirect_uri: redirectUri, scope: p.scope,
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  if (hint) q.set('login_hint', hint);
  return `${p.authorize}?${q}`;
}

/**
 * Exchanges the code for tokens and returns who signed in. The ID token comes straight from the provider's
 * token endpoint over TLS, so its claims are trusted after checking issuer, audience, expiry and nonce.
 */
export async function finishSignIn(env, name, { code, redirectUri, verifier, nonce }) {
  const p = endpoints(env, name);
  const res = await fetch(p.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier,
      client_id: env[p.id], client_secret: env[p.secret],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) throw new Error(data.error_description || data.error || 'The sign-in could not be completed.');
  const c = jwtClaims(data.id_token);
  const now = Date.now() / 1000;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!p.issuer(c.iss, c) || !aud.includes(env[p.id]) || !(c.exp > now - 60) || c.nonce !== nonce) {
    throw new Error('The sign-in answer could not be verified.');
  }
  if (name === 'google') {
    return {
      provider: 'google', subject: c.sub, name: c.name || '', domain: c.hd || '',
      email: c.email_verified ? String(c.email || '').toLowerCase() : '',
      // Google is the authority for gmail.com and for Workspace (hd) addresses.
      emailTrusted: Boolean(c.email_verified && (c.hd || /@(gmail|googlemail)\.com$/i.test(c.email || ''))),
    };
  }
  const email = String(c.email || c.preferred_username || '').toLowerCase();
  return {
    provider: 'microsoft', subject: `${c.tid}:${c.oid || c.sub}`, tenant: c.tid, name: c.name || '',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    // Microsoft lets tenants set any address, so it is only trusted inside the tenant a company has connected.
    emailTrusted: false,
  };
}

// ---------- Sign in with Apple (iPhone app) ----------

let appleKeys = { at: 0, keys: [] };

async function appleKey(kid) {
  if (Date.now() - appleKeys.at > 6 * 60 * 60 * 1000 || !appleKeys.keys.find((k) => k.kid === kid)) {
    const res = await fetch('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new Error('Apple sign-in is not reachable right now.');
    appleKeys = { at: Date.now(), keys: (await res.json()).keys || [] };
  }
  const jwk = appleKeys.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error('Unknown Apple key.');
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

/** Checks an identity token from the iPhone's Sign in with Apple and returns who signed in. */
export async function verifyAppleSignIn(env, token, rawNonce) {
  const header = jwtHeader(token);
  if (header.alg !== 'RS256') throw new Error('Unexpected Apple token.');
  const [h, p, s] = token.split('.');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await appleKey(header.kid), fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('The Apple sign-in could not be verified.');
  const c = jwtClaims(token);
  const audience = env.APPLE_BUNDLE_ID || 'app.mkcards';
  if (c.iss !== 'https://appleid.apple.com' || c.aud !== audience || !(c.exp > Date.now() / 1000 - 60)) {
    throw new Error('The Apple sign-in could not be verified.');
  }
  if (c.nonce && c.nonce !== await sha256hex(rawNonce || '')) throw new Error('The Apple sign-in could not be verified.');
  const verified = c.email_verified === true || c.email_verified === 'true';
  return { provider: 'apple', subject: c.sub, name: '', email: verified ? String(c.email || '').toLowerCase() : '', emailTrusted: verified, domain: '' };
}
