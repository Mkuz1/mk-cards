// MK Cards — Cloudflare Worker: accounts, cards API, public card pages and the site's static files.
// All user data lives on Cloudflare in the Store Durable Object (a SQLite database built into the Worker).
import { DurableObject } from 'cloudflare:workers';
import { ASSETS } from './assets.generated.js';
import { qrPng, qrSvg } from './qr.js';
import { applePass, googleSaveUrl, walletStatus } from './wallet.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, slug TEXT NOT NULL DEFAULT '', data TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (user_id, slug));
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS contacts_card ON contacts (card_id, created_at DESC);
CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_key ON attempts (key, at);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, card_id TEXT, kind TEXT NOT NULL, type TEXT NOT NULL,
  data BLOB NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS media_card ON media (card_id, kind);
`;
// media holds images, apart from the card records: kind 'photo' is the card's photo; 'og', 'thumb' and 'hero'
// are pictures drawn from the card for link previews and wallet passes. They are served at /media/<id>.<ext>.
// In cards, slug '' is the user's main card, shown at /username. Other cards live at /username/slug.
// attempts holds recent sign-in and sign-up attempts, used to slow down guessing and bulk sign-ups.

/** The database. One instance holds every table; statements sent together run as one transaction. */
export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
    try {
      this.moveInlinePhotos();
    } catch (err) {
      console.error('Moving inline photos failed; cards keep their photos where they are.', err);
    }
  }

  // Cards saved before photos had their own table carried the picture inside the card record.
  moveInlinePhotos() {
    const sql = this.ctx.storage.sql;
    const rows = sql.exec(`SELECT id, user_id, data FROM cards WHERE data LIKE '%"photo":"data:%'`).toArray();
    for (const row of rows) {
      const card = JSON.parse(row.data);
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(card.photo || '');
      if (!m) continue;
      const id = randomId(16);
      sql.exec('INSERT INTO media (id, user_id, card_id, kind, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, row.user_id, row.id, 'photo', `image/${m[1]}`, base64ToBytes(m[2]).buffer, Date.now());
      card.photo = `/media/${id}.${MEDIA_EXT[`image/${m[1]}`]}`;
      sql.exec('UPDATE cards SET data = ? WHERE id = ?', JSON.stringify(card), row.id);
    }
  }

  run(statements) {
    return this.ctx.storage.transactionSync(() =>
      statements.map(({ sql, params }) => this.ctx.storage.sql.exec(sql, ...params).toArray()));
  }
}

// A small prepare/bind/first/all/run/batch interface over the Store, so queries read like ordinary SQL calls.
function database(env) {
  const store = env.STORE.get(env.STORE.idFromName('main'));
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...values) => statement(sql, values),
    first: async () => (await store.run([{ sql, params }]))[0][0] ?? null,
    all: async () => ({ results: (await store.run([{ sql, params }]))[0] }),
    run: async () => { await store.run([{ sql, params }]); },
  });
  return {
    prepare: (sql) => statement(sql),
    batch: (list) => store.run(list.map(({ sql, params }) => ({ sql, params }))),
  };
}

const MAX_BODY = 450_000; // bytes; a card with an embedded photo stays well under this
const MAX_CARDS_PER_USER = 10;
const MAX_CONTACTS_PER_CARD = 500;
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'mk_session';
const PBKDF2_ITERATIONS = 100_000; // the most Cloudflare Workers allows

// Names that are app pages or files, so they can never be usernames.
const RESERVED = new Set([
  'media', 'wallet',
  'api', 'new', 'edit', 'share', 'inbox', 'settings', 'privacy', 'terms', 'login', 'register', 'logout',
  'account', 'admin', 'icons', 'vendor', 'assets', 'static', 'about', 'help', 'support', 'www', 'app',
  'mkcards', 'mk-cards', 'me', 'public', 'null', 'undefined', 'index', 'sw', 'manifest', 'favicon', 'vcard', 'contacts',
]);
const USERNAME = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,29}$/;
const LINK_TYPES = new Set([
  'website', 'linkedin', 'x', 'instagram', 'facebook', 'youtube', 'tiktok',
  'github', 'whatsapp', 'telegram', 'calendar', 'other',
]);
const STYLES = new Set(['aurora', 'solid', 'mono']);
const ENTRY_LABELS = new Set(['mobile', 'work', 'home', 'personal', 'other']);
const MAX_ENTRIES = 6; // phones or emails per card

export default {
  async fetch(request, env) {
    return withSecurityHeaders(await app.fetch(request, env));
  },
};

// Browser protections: no other site may frame these pages, and pages only run this site's own scripts.
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
    "frame-ancestors 'none'", "manifest-src 'self'", "worker-src 'self'",
  ].join('; '),
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function withSecurityHeaders(response) {
  const res = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
  return res;
}

const app = {
  async fetch(request, env) {
    const url = new URL(request.url);
    env = { ...env, DB: database(env) };
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      const media = /^\/media\/([a-z0-9]{16})\.(jpg|png|webp)$/.exec(url.pathname);
      if (media && request.method === 'GET') return await serveMedia(env, media[1]);
      if (request.method === 'GET') {
        const m = /^\/([A-Za-z0-9_-]{3,30})(?:\/([A-Za-z0-9-]{1,30}))?\/?$/.exec(url.pathname);
        if (m && !RESERVED.has(m[1].toLowerCase())) return await cardPage(request, env, url, m[1], m[2] || '');
      }
      const res = serveAsset(request, url);
      // Link previews need full addresses for the page and its picture.
      if (!(res.headers.get('content-type') || '').startsWith('text/html')) return res;
      return new HTMLRewriter()
        .on('meta[property="og:url"]', { element: (el) => el.setAttribute('content', url.origin + url.pathname) })
        .on('meta[property="og:image"]', { element: (el) => el.setAttribute('content', `${url.origin}/og-default.jpg`) })
        .on('meta[name="twitter:image"]', { element: (el) => el.setAttribute('content', `${url.origin}/og-default.jpg`) })
        .transform(res);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong.' }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

async function api(request, env, url) {
  const method = request.method;
  const path = url.pathname.slice(4).replace(/\/+$/, ''); // after "/api"

  // Changes must come from our own pages, not from another website using the visitor's cookie.
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'Request not allowed.');
  }

  if (path === '/auth/register' && method === 'POST') return register(request, env, url);
  if (path === '/auth/login' && method === 'POST') return login(request, env, url);
  if (path === '/auth/logout' && method === 'POST') return logout(request, env, url);
  if (path === '/auth/username' && method === 'GET') return usernameAvailable(env, url);

  if (path === '/public/card' && method === 'GET') return publicCard(env, url);
  if (path === '/public/vcard' && method === 'GET') return publicVCard(env, url);
  if (path === '/public/contacts' && method === 'POST') return addContact(request, env);

  if (path === '/me' && method === 'GET') return me(request, env);
  if (path === '/me' && method === 'DELETE') return deleteAccount(request, env, url);
  if (path === '/me/password' && method === 'POST') return changePassword(request, env);
  if (path === '/cards' && method === 'POST') return createCard(request, env);

  let m = /^\/cards\/([a-z0-9]{6,20})$/.exec(path);
  if (m && method === 'PUT') return updateCard(request, env, m[1]);
  if (m && method === 'DELETE') return deleteCard(request, env, m[1]);
  m = /^\/cards\/([a-z0-9]{6,20})\/assets$/.exec(path);
  if (m && method === 'PUT') return saveCardAssets(request, env, m[1]);
  m = /^\/cards\/([a-z0-9]{6,20})\/wallet\/(apple\.pkpass|google)$/.exec(path);
  if (m && method === 'GET') return walletPass(request, env, url, m[1], m[2]);
  m = /^\/cards\/([a-z0-9]{6,20})\/qr\.(png|svg)$/.exec(path);
  if (m && method === 'GET') return cardQr(request, env, url, m[1], m[2]);
  m = /^\/cards\/([a-z0-9]{6,20})\/contacts$/.exec(path);
  if (m && method === 'GET') return listContacts(request, env, m[1]);
  m = /^\/cards\/([a-z0-9]{6,20})\/contacts\/(\d+)$/.exec(path);
  if (m && method === 'DELETE') return deleteContact(request, env, m[1], Number(m[2]));

  throw new HttpError(404, 'Not found.');
}

// ---------- accounts ----------

async function register(request, env, url) {
  const body = await readJson(request);
  const username = text(body.username, 40).toLowerCase();
  const email = text(body.email, 120).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME.test(username)) {
    throw new HttpError(400, 'Usernames are 3–30 characters: letters, numbers, hyphens or underscores.');
  }
  if (RESERVED.has(username)) throw new HttpError(409, 'That username is not available.');
  if (!isEmail(email)) throw new HttpError(400, 'That email address does not look right.');
  checkPassword(password);

  await throttle(env, request, 'register', 10, 60 * 60 * 1000, true);

  const taken = await env.DB.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?')
    .bind(username, email).first();
  if (taken) {
    throw new HttpError(409, taken.username === username
      ? 'That username is already taken.'
      : 'An account with that email already exists. Log in instead.');
  }

  const user = { id: randomId(16), username, email };
  await env.DB.prepare('INSERT INTO users (id, username, email, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, username, email, await hashPassword(password), Date.now()).run();
  return json({ user: publicUser(user), cards: [], wallet: walletStatus(env) }, 201, { 'set-cookie': await startSession(env, url, user.id) });
}

async function login(request, env, url) {
  const body = await readJson(request);
  const name = text(body.login, 120).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || !password) throw new HttpError(400, 'Enter your username and password.');

  await throttle(env, request, 'login', 20, 15 * 60 * 1000, false);
  // Also limit wrong passwords per account, which still works when guesses come from many addresses.
  const accountKey = `login-account:${name}`;
  if ((await countAttempts(env, accountKey, 15 * 60 * 1000)) >= 10) {
    throw new HttpError(429, 'Too many wrong passwords for this account. Please wait 15 minutes and try again.');
  }

  const user = await env.DB.prepare('SELECT id, username, email, pass_hash FROM users WHERE username = ? OR email = ?')
    .bind(name, name).first();
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    await recordAttempt(env, request, 'login');
    await addAttempt(env, accountKey);
    throw new HttpError(401, 'Wrong username or password.');
  }
  return json({ user: publicUser(user), cards: await cardsOf(env, user.id), wallet: walletStatus(env) }, 200,
    { 'set-cookie': await startSession(env, url, user.id) });
}

async function logout(request, env, url) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': cookie(url, '', 0) });
}

async function usernameAvailable(env, url) {
  const username = (url.searchParams.get('u') || '').toLowerCase();
  if (!USERNAME.test(username)) return json({ available: false });
  if (RESERVED.has(username)) return json({ available: false, reserved: true });
  const taken = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  return json({ available: !taken });
}

async function me(request, env) {
  const wallet = walletStatus(env);
  const user = await currentUser(request, env);
  if (!user) return json({ user: null, cards: [], wallet });
  return json({ user: publicUser(user), cards: await cardsOf(env, user.id), wallet });
}

async function deleteAccount(request, env, url) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(typeof body.password === 'string' ? body.password : '', row.pass_hash))) {
    throw new HttpError(403, 'That password is not correct.');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contacts WHERE card_id IN (SELECT id FROM cards WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM media WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM cards WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': cookie(url, '', 0) });
}

// Passwords are changed here, from inside the account. There is deliberately no reset-by-email.
async function changePassword(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const next = typeof body.next === 'string' ? body.next : '';
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(typeof body.current === 'string' ? body.current : '', row.pass_hash))) {
    throw new HttpError(403, 'Your current password is not correct.');
  }
  checkPassword(next);
  // Other devices are signed out; this one stays logged in.
  const keep = await sha256(readCookie(request, SESSION_COOKIE));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, keep),
  ]);
  return json({ ok: true });
}

const publicUser = (user) => ({ username: user.username, email: user.email });

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.username, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), Date.now()).first();
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'Please log in again.');
  return user;
}

async function startSession(env, url, userId) {
  const token = randomId(48);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), userId, Date.now() + maxAge * 1000),
  ]);
  return cookie(url, token, maxAge);
}

const cookie = (url, value, maxAge) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function checkPassword(password) {
  if (password.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'That password is too long.');
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !password) return false;
  return timingSafeEqual(toHex(await pbkdf2(password, fromHex(salt), Number(iterations))), hash);
}

// Slow down password guessing and bulk sign-ups from one address.
const ipKey = (request, kind) => `${kind}:${request.headers.get('cf-connecting-ip') || 'local'}`;

async function countAttempts(env, key, windowMs) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE key = ? AND at > ?')
    .bind(key, Date.now() - windowMs).first();
  return row.n;
}

async function addAttempt(env, key) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE at < ?').bind(Date.now() - 24 * 60 * 60 * 1000),
    env.DB.prepare('INSERT INTO attempts (key, at) VALUES (?, ?)').bind(key, Date.now()),
  ]);
}

async function throttle(env, request, kind, limit, windowMs, record) {
  if ((await countAttempts(env, ipKey(request, kind), windowMs)) >= limit) {
    throw new HttpError(429, 'Too many attempts. Please wait a while and try again.');
  }
  if (record) await addAttempt(env, ipKey(request, kind));
}

const recordAttempt = (env, request, kind) => addAttempt(env, ipKey(request, kind));

// ---------- cards (owner) ----------

async function cardsOf(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.slug, c.data, c.views, c.updated_at,
            (SELECT COUNT(*) FROM contacts k WHERE k.card_id = c.id) AS contacts,
            (SELECT MAX(created_at) FROM media m WHERE m.card_id = c.id AND m.kind = 'og') AS assets_at
     FROM cards c WHERE c.user_id = ? ORDER BY c.slug = '' DESC, c.created_at`,
  ).bind(userId).all();
  return results.map(cardRow);
}

const cardRow = (r) => ({
  id: r.id, slug: r.slug, card: readCard(r.data), views: r.views || 0, contacts: r.contacts || 0, updatedAt: r.updated_at,
  assetsAt: r.assets_at || 0,
});

async function createCard(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const card = cleanCard(body.card);

  const existing = await env.DB.prepare('SELECT slug FROM cards WHERE user_id = ?').bind(user.id).all();
  if (existing.results.length >= MAX_CARDS_PER_USER) {
    throw new HttpError(409, `You can have up to ${MAX_CARDS_PER_USER} cards.`);
  }
  const slugs = new Set(existing.results.map((r) => r.slug));

  // The first card is the main one at /username. Later cards live at /username/<name>, taken from the
  // card's own name ("Work" -> /username/work); a number is added if that link is already in use.
  let slug = '';
  if (slugs.has('')) {
    let base = slugify(card.label);
    if (!SLUG.test(base)) base = 'card';
    slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base.slice(0, 26)}-${n}`;
  }

  const now = Date.now();
  const id = randomId(12);
  await keepPhoto(env, user.id, id, card);
  await env.DB.prepare('INSERT INTO cards (id, user_id, slug, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, slug, JSON.stringify(card), now, now).run();
  return json({ id, slug, card, views: 0, contacts: 0, updatedAt: now, assetsAt: 0 }, 201);
}

async function ownCard(request, env, id) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT id, slug FROM cards WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) throw new HttpError(404, 'Card not found.');
  return { ...row, user };
}

async function updateCard(request, env, id) {
  const row = await ownCard(request, env, id);
  const card = cleanCard((await readJson(request)).card);
  const now = Date.now();
  await keepPhoto(env, row.user.id, id, card);
  await env.DB.prepare('UPDATE cards SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(card), now, id).run();
  return json({ id, slug: row.slug, card, updatedAt: now });
}

async function deleteCard(request, env, id) {
  await ownCard(request, env, id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contacts WHERE card_id = ?').bind(id),
    env.DB.prepare('DELETE FROM media WHERE card_id = ?').bind(id),
    env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---------- media (photos and drawn pictures, stored apart from card records) ----------

const MEDIA_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MEDIA_PATH = /^\/media\/([a-z0-9]{16})\.(jpg|png|webp)$/;
// What each kind of picture may be, and how large (bytes of the data: URL).
const MEDIA_RULES = {
  photo: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 300_000 },
  og: { types: ['image/jpeg'], max: 400_000 },
  hero: { types: ['image/jpeg'], max: 300_000 },
  thumb: { types: ['image/png'], max: 250_000 },
};

function parseImage(dataUrl, kind) {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  const rule = MEDIA_RULES[kind];
  if (!m || !rule.types.includes(m[1]) || dataUrl.length > rule.max) return null;
  return { type: m[1], bytes: base64ToBytes(m[2]) };
}

// A card's picture of one kind is replaced as a whole: the old file goes, a new one with a new address comes.
async function replaceMedia(env, userId, cardId, kind, image) {
  const id = randomId(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM media WHERE card_id = ? AND kind = ?').bind(cardId, kind),
    env.DB.prepare('INSERT INTO media (id, user_id, card_id, kind, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, userId, cardId, kind, image.type, image.bytes.buffer, Date.now()),
  ]);
  return `/media/${id}.${MEDIA_EXT[image.type]}`;
}

// The editor sends a new photo as a data: URL, or the address of the photo the card already has.
async function keepPhoto(env, userId, cardId, card) {
  if (card.photo.startsWith('data:')) {
    const image = parseImage(card.photo, 'photo');
    if (!image) throw new HttpError(400, 'That photo could not be used. Try another one.');
    card.photo = await replaceMedia(env, userId, cardId, 'photo', image);
    return;
  }
  const m = MEDIA_PATH.exec(card.photo);
  const owned = m && await env.DB.prepare("SELECT 1 FROM media WHERE id = ? AND card_id = ? AND kind = 'photo'").bind(m[1], cardId).first();
  if (!owned) {
    card.photo = '';
    await env.DB.prepare("DELETE FROM media WHERE card_id = ? AND kind = 'photo'").bind(cardId).run();
  }
}

// Pictures drawn by the editor from the finished card: link preview, wallet thumbnail and wallet banner.
async function saveCardAssets(request, env, id) {
  const row = await ownCard(request, env, id);
  const body = await readJson(request, 1_200_000);
  const saved = {};
  for (const kind of ['og', 'thumb', 'hero']) {
    if (body[kind] == null) continue;
    const image = parseImage(body[kind], kind);
    if (!image) throw new HttpError(400, `The ${kind} picture could not be used.`);
    saved[kind] = await replaceMedia(env, row.user.id, id, kind, image);
  }
  return json({ ok: true, assets: saved, assetsAt: Date.now() });
}

async function cardMedia(env, cardId) {
  const { results } = await env.DB.prepare('SELECT id, kind, type FROM media WHERE card_id = ?').bind(cardId).all();
  return Object.fromEntries(results.map((r) => [r.kind, { id: r.id, type: r.type, path: `/media/${r.id}.${MEDIA_EXT[r.type]}` }]));
}

async function mediaBytes(env, path) {
  const m = MEDIA_PATH.exec(path || '');
  if (!m) return null;
  const row = await env.DB.prepare('SELECT type, data FROM media WHERE id = ?').bind(m[1]).first();
  return row ? { type: row.type, bytes: new Uint8Array(row.data) } : null;
}

// Media addresses change whenever the picture changes, so browsers and link-preview services may keep them.
async function serveMedia(env, id) {
  const row = await env.DB.prepare('SELECT type, data FROM media WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.data, {
    headers: { 'content-type': row.type, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- wallet passes (owner only) ----------

async function walletPass(request, env, url, id, kind) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT slug, data FROM cards WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) throw new HttpError(404, 'Card not found.');
  const card = readCard(row.data);
  const link = `${url.origin}/${user.username}${row.slug ? '/' + row.slug : ''}`;
  const ready = walletStatus(env);

  if (kind === 'apple.pkpass') {
    if (!ready.apple) throw new HttpError(503, 'Apple Wallet passes are not set up yet.');
    let file;
    try {
      file = await applePass(env, { cardId: id, card, link });
    } catch (err) {
      console.error('Apple pass failed', err);
      throw new HttpError(503, 'The Apple Wallet pass could not be made. The Apple certificate needs checking.');
    }
    return new Response(file, {
      headers: {
        'content-type': 'application/vnd.apple.pkpass',
        'content-disposition': `attachment; filename="mkcards-${user.username}${row.slug ? '-' + row.slug : ''}.pkpass"`,
        'cache-control': 'private, no-store',
      },
    });
  }
  if (!ready.google) throw new HttpError(503, 'Google Wallet passes are not set up yet.');
  const save = await googleSaveUrl(env, { cardId: id, card, link, origin: url.origin });
  return new Response(null, { status: 302, headers: { location: save, 'cache-control': 'private, no-store' } });
}

// The card's QR code as a file. Only the card's owner can download it.
async function cardQr(request, env, url, id, format) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT slug FROM cards WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!row) throw new HttpError(404, 'Card not found.');
  const link = `${url.origin}/${user.username}${row.slug ? '/' + row.slug : ''}`;
  const filename = `mkcards-${user.username}${row.slug ? '-' + row.slug : ''}-qr.${format}`;
  const body = format === 'png' ? await qrPng(link) : qrSvg(link);
  return new Response(body, {
    headers: {
      'content-type': format === 'png' ? 'image/png' : 'image/svg+xml; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}

async function listContacts(request, env, id) {
  await ownCard(request, env, id);
  const { results } = await env.DB.prepare(
    'SELECT id, data, created_at FROM contacts WHERE card_id = ? ORDER BY created_at DESC LIMIT ?',
  ).bind(id, MAX_CONTACTS_PER_CARD).all();
  return json({ contacts: results.map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.data) })) });
}

async function deleteContact(request, env, id, contactId) {
  await ownCard(request, env, id);
  await env.DB.prepare('DELETE FROM contacts WHERE card_id = ? AND id = ?').bind(id, contactId).run();
  return json({ ok: true });
}

// ---------- public card ----------

async function findCard(env, username, slug) {
  username = String(username || '').toLowerCase();
  slug = String(slug || '').toLowerCase();
  if (!USERNAME.test(username) || (slug && !SLUG.test(slug))) return null;
  return env.DB.prepare(
    `SELECT c.id, c.slug, c.data, u.username, u.email FROM cards c JOIN users u ON u.id = c.user_id
     WHERE u.username = ? AND c.slug = ?`,
  ).bind(username, slug).first();
}

async function publicCard(env, url) {
  const row = await findCard(env, url.searchParams.get('u'), url.searchParams.get('s'));
  if (!row) throw new HttpError(404, 'Card not found.');
  if (url.searchParams.has('view')) {
    await env.DB.prepare('UPDATE cards SET views = views + 1 WHERE id = ?').bind(row.id).run();
  }
  // contactEmail is the owner's account email: the page's "share your details" button writes to it.
  return json({ username: row.username, slug: row.slug, card: readCard(row.data), contactEmail: row.email });
}

async function publicVCard(env, url) {
  const row = await findCard(env, url.searchParams.get('u'), url.searchParams.get('s'));
  if (!row) throw new HttpError(404, 'Card not found.');
  const link = `${url.origin}/${row.username}${row.slug ? '/' + row.slug : ''}`;
  const card = readCard(row.data);
  const photo = await mediaBytes(env, card.photo);
  return new Response(buildVCard(card, link, photo), {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="${row.username}${row.slug ? '-' + row.slug : ''}.vcf"`,
      'cache-control': 'no-store',
    },
  });
}

async function addContact(request, env) {
  const body = await readJson(request);
  const row = await findCard(env, body.u, body.s);
  if (!row) throw new HttpError(404, 'Card not found.');
  if (body.company_website) return json({ ok: true }, 201); // honeypot field: silently drop bots

  const contact = {
    name: text(body.name, 80),
    email: text(body.email, 120),
    phone: text(body.phone, 40),
    company: text(body.company, 80),
    note: text(body.note, 400),
  };
  if (!contact.name) throw new HttpError(400, 'Please add your name.');
  if (!contact.email && !contact.phone) throw new HttpError(400, 'Add an email or a phone number.');
  if (contact.email && !isEmail(contact.email)) throw new HttpError(400, 'That email address does not look right.');

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts WHERE card_id = ?').bind(row.id).first();
  if (count.n >= MAX_CONTACTS_PER_CARD) throw new HttpError(429, 'This card cannot receive more contacts right now.');

  await env.DB.prepare('INSERT INTO contacts (card_id, data, created_at) VALUES (?, ?, ?)')
    .bind(row.id, JSON.stringify(contact), Date.now()).run();
  return json({ ok: true }, 201);
}

export function buildVCard(card, link, photo) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const nameParts = (card.name || '').trim().split(/\s+/);
  const family = nameParts.length > 1 ? nameParts.pop() : '';
  const given = nameParts.join(' ');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(given)};;;`, `FN:${esc(card.name)}`];
  if (card.company || card.department) lines.push(`ORG:${esc(card.company)}${card.department ? ';' + esc(card.department) : ''}`);
  if (card.title) lines.push(`TITLE:${esc(card.title)}`);
  const telType = { mobile: 'CELL', work: 'WORK', home: 'HOME' };
  for (const p of card.phones || []) lines.push(`TEL;TYPE=${telType[p.label] || 'VOICE'}:${esc(p.value)}`);
  const mailType = { work: 'INTERNET,WORK', personal: 'INTERNET,HOME', home: 'INTERNET,HOME' };
  for (const e of card.emails || []) lines.push(`EMAIL;TYPE=${mailType[e.label] || 'INTERNET'}:${esc(e.value)}`);
  if (card.website) lines.push(`URL:${esc(card.website)}`);
  if (card.whatsapp) lines.push(`URL;TYPE=WhatsApp:${esc('https://wa.me/' + card.whatsapp.replace(/\D/g, ''))}`);
  if (card.address) lines.push(`ADR;TYPE=WORK:;;${esc(card.address)};;;;`);
  for (const l of card.links || []) lines.push(`URL;TYPE=${esc(l.type)}:${esc(l.url)}`);
  if (link) lines.push(`URL;TYPE=MK Cards:${esc(link)}`);
  if (card.bio) lines.push(`NOTE:${esc(card.bio)}`);
  if (photo && (photo.type === 'image/jpeg' || photo.type === 'image/png')) {
    lines.push(fold(`PHOTO;ENCODING=b;TYPE=${photo.type === 'image/png' ? 'PNG' : 'JPEG'}:${bytesToBase64(photo.bytes)}`));
  }
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

const fold = (line) => line.replace(/(.{74})(?=.)/g, '$1\r\n ');

// Serves the app shell for /username and /username/card, with share-preview metadata filled in.
async function cardPage(request, env, url, username, slug) {
  if (username !== username.toLowerCase() || slug !== slug.toLowerCase()) {
    return Response.redirect(`${url.origin}/${username.toLowerCase()}${slug ? '/' + slug.toLowerCase() : ''}`, 301);
  }
  const row = await findCard(env, username, slug);
  const shell = shellResponse(row ? 200 : 404);
  if (!row) return shell;

  const card = readCard(row.data);
  const title = `${card.name} — MK Cards`;
  const description = [card.title, card.company].filter(Boolean).join(' · ') || 'Digital business card';
  const og = (await cardMedia(env, row.id)).og;
  const image = og ? url.origin + og.path : `${url.origin}/og-default.jpg`;
  return new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', { element: (el) => el.setAttribute('content', description) })
    .on('meta[property="og:title"]', { element: (el) => el.setAttribute('content', title) })
    .on('meta[property="og:description"]', { element: (el) => el.setAttribute('content', description) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute('content', url.origin + url.pathname) })
    .on('meta[property="og:image"]', { element: (el) => el.setAttribute('content', image) })
    .on('meta[name="twitter:image"]', { element: (el) => el.setAttribute('content', image) })
    .on('meta[name="twitter:title"]', { element: (el) => el.setAttribute('content', title) })
    .on('meta[name="twitter:description"]', { element: (el) => el.setAttribute('content', description) })
    .on('meta[property="og:image:alt"]', { element: (el) => el.setAttribute('content', `${card.name}'s business card`) })
    .transform(shell);
}

// ---------- static files (bundled into the Worker by scripts/build-assets.mjs) ----------

const bytesOf = (asset) => Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0));

function shellResponse(status) {
  return new Response(bytesOf(ASSETS['/index.html']), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

function serveAsset(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const path = url.pathname.replace(/\/+$/, '') || '/index.html';
  const asset = ASSETS[path] || ASSETS[path + '.html'];
  // Anything that is not a file is an app page (/new, /settings, ...): the app shell handles it.
  if (!asset) return /\.[a-z0-9]+$/i.test(path) ? new Response('Not found', { status: 404 }) : shellResponse(200);
  if (request.headers.get('if-none-match') === asset.etag) return new Response(null, { status: 304, headers: { etag: asset.etag } });
  return new Response(bytesOf(asset), {
    headers: {
      'content-type': asset.type,
      etag: asset.etag,
      // Files are revalidated on each load so a new release shows up straight away.
      'cache-control': 'no-cache',
    },
  });
}

// ---------- validation helpers ----------

async function readJson(request, max = MAX_BODY) {
  const raw = await request.text();
  if (raw.length > max) throw new HttpError(413, 'That is too large. Try a smaller photo.');
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === 'object') return body;
  } catch {}
  throw new HttpError(400, 'Invalid request.');
}

const text = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max) : '';

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function safeUrl(value, max = 300) {
  let v = text(value, max);
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

function cleanCard(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Missing card.');
  const card = {
    name: text(input.name, 80),
    title: text(input.title, 80),
    company: text(input.company, 80),
    department: text(input.department, 80),
    bio: text(input.bio, 400),
    label: text(input.label, 40),
    phones: cleanEntries(input.phones, input.phone, 40),
    emails: cleanEntries(input.emails, input.email, 120),
    whatsapp: text(input.whatsapp, 40),
    website: safeUrl(input.website),
    address: text(input.address, 160),
    photo: '',
    accent: /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent.toLowerCase() : '#5b8cff',
    style: STYLES.has(input.style) ? input.style : 'aurora',
    links: [],
  };
  if (!card.name) throw new HttpError(400, 'A card needs a name.');
  if (card.whatsapp) {
    const digits = card.whatsapp.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      throw new HttpError(400, 'The WhatsApp number needs the full number with country code, like +971 50 123 4567.');
    }
  }
  for (const entry of card.emails) {
    if (!isEmail(entry.value)) throw new HttpError(400, `"${entry.value}" does not look like an email address.`);
  }
  // A new photo (data: URL) or the card's current photo address; keepPhoto() checks and stores it.
  if (typeof input.photo === 'string' && (input.photo.startsWith('data:') || MEDIA_PATH.test(input.photo))) {
    card.photo = input.photo;
  }
  if (Array.isArray(input.links)) {
    for (const link of input.links.slice(0, 12)) {
      const href = safeUrl(link && link.url);
      if (!href) continue;
      card.links.push({ type: LINK_TYPES.has(link.type) ? link.type : 'other', label: text(link.label, 40), url: href });
    }
  }
  return card;
}

// Phones and emails are lists of { label, value }. A single legacy value is accepted too.
function cleanEntries(list, legacy, max) {
  const source = Array.isArray(list) ? list : legacy ? [{ label: '', value: legacy }] : [];
  const out = [];
  for (const entry of source.slice(0, MAX_ENTRIES)) {
    const value = text(entry && entry.value, max);
    if (value) out.push({ label: ENTRY_LABELS.has(entry.label) ? entry.label : 'other', value });
  }
  return out;
}

// Cards saved before phones/emails became lists are read in the new shape.
function upgradeCard(card) {
  if (!Array.isArray(card.phones)) card.phones = card.phone ? [{ label: 'mobile', value: card.phone }] : [];
  if (!Array.isArray(card.emails)) card.emails = card.email ? [{ label: 'other', value: card.email }] : [];
  delete card.phone;
  delete card.email;
  if (typeof card.label !== 'string') card.label = '';
  if (typeof card.whatsapp !== 'string') card.whatsapp = '';
  if (typeof card.department !== 'string') card.department = '';
  return card;
}

const readCard = (data) => upgradeCard(JSON.parse(data));

const slugify = (value) =>
  String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');

function randomId(length) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((String(hex).match(/.{2}/g) || []).map((h) => parseInt(h, 16)));

async function sha256(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
