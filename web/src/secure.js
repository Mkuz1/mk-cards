// Small crypto helpers: base64url, signed values (HMAC) and encrypted values (AES-GCM).
// Both use the Worker secret TOKEN_KEY, so tokens kept in the database are useless without it.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  if (typeof bytes === 'string') bytes = enc.encode(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(value) {
  const b64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256b64url(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
}

export async function sha256hex(value) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function secretOf(env) {
  if (!env.TOKEN_KEY || env.TOKEN_KEY.length < 32) throw new Error('TOKEN_KEY secret is not set.');
  return env.TOKEN_KEY;
}

const keys = new Map();
async function key(env, use) {
  const id = `${use}:${secretOf(env)}`;
  if (!keys.has(id)) {
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(`${use}|${secretOf(env)}`));
    keys.set(id, use === 'sign'
      ? await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
      : await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keys.get(id);
}

/** A JSON value with a signature, safe to hand to the browser (for example in a cookie). */
export async function signValue(env, value) {
  const body = b64url(JSON.stringify(value));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(env, 'sign'), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function readSigned(env, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(env, 'sign'), fromB64url(sig), enc.encode(body));
    return ok ? JSON.parse(dec.decode(fromB64url(body))) : null;
  } catch {
    return null;
  }
}

export async function encrypt(env, text) {
  if (!text) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env, 'encrypt'), enc.encode(text)));
  return `${b64url(iv)}.${b64url(data)}`;
}

export async function decrypt(env, value) {
  if (!value) return '';
  const [iv, data] = String(value).split('.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await key(env, 'encrypt'), fromB64url(data)));
}

/** The claims of a JWT, without checking its signature (only for tokens received directly from the issuer). */
export function jwtClaims(token) {
  const part = String(token || '').split('.')[1];
  if (!part) throw new Error('Not a token.');
  return JSON.parse(dec.decode(fromB64url(part)));
}

export function jwtHeader(token) {
  return JSON.parse(dec.decode(fromB64url(String(token || '').split('.')[0])));
}
