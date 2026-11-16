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
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', plan TEXT NOT NULL DEFAULT 'trial',
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (card_id TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_card_day ON events (card_id, day);
`;
// Columns added after the first release, created on start-up when missing.
const ADDED_COLUMNS = [
  ['users', 'active', 'INTEGER NOT NULL DEFAULT 1'],
  ['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'org_id', 'TEXT'],
  ['users', 'role', 'TEXT'],
  ['users', 'last_login', 'INTEGER'],
  ['cards', 'active', 'INTEGER NOT NULL DEFAULT 1'],
  ['cards', 'inactive_message', 'TEXT'],
];
// orgs are company workspaces: users.org_id and users.role ('owner', 'admin' or 'member') place people in one.
// events records what visitors do with a card (view, save, whatsapp, email, call, qr, share, web), per day.
// media holds images, apart from the card records: kind 'photo' is the card's photo; 'og', 'thumb' and 'hero'
// are pictures drawn from the card for link previews and wallet passes. They are served at /media/<id>.<ext>.
// In cards, slug '' is the user's main card, shown at /username. Other cards live at /username/slug.
// attempts holds recent sign-in and sign-up attempts, used to slow down guessing and bulk sign-ups.

/** The database. One instance holds every table; statements sent together run as one transaction. */
export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(SCHEMA);
    this.addColumns();
    try {
      this.moveInlinePhotos();
    } catch (err) {
      console.error('Moving inline photos failed; cards keep their photos where they are.', err);
    }
  }

  addColumns() {
    const sql = this.ctx.storage.sql;
    const have = {};
    for (const [table, column, type] of ADDED_COLUMNS) {
      have[table] ||= new Set(sql.exec(`PRAGMA table_info(${table})`).toArray().map((c) => c.name));
      if (!have[table].has(column)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
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
const MAX_ENTRIES = 10; // phones or emails per card

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
  if (path === '/public/event' && method === 'POST') return recordEvent(request, env);
  if (path === '/me/activity.csv' && method === 'GET') return activityCsv(request, env, url, false);

  if (path === '/org' && method === 'GET') return orgOverview(request, env, url);
  if (path === '/org' && method === 'POST') return createOrg(request, env);
  if (path === '/org' && method === 'PUT') return updateOrg(request, env);
  if (path === '/org/import' && method === 'POST') return importMembers(request, env, url);
  if (path === '/org/logo' && method === 'PUT') return setOrgLogo(request, env);
  if (path === '/org/members.csv' && method === 'GET') return membersCsv(request, env, url);
  if (path === '/org/activity.csv' && method === 'GET') return activityCsv(request, env, url, true);

  if (path === '/me' && method === 'GET') return me(request, env);
  if (path === '/me' && method === 'DELETE') return deleteAccount(request, env, url);
  if (path === '/me/password' && method === 'POST') return changePassword(request, env);
  if (path === '/cards' && method === 'POST') return createCard(request, env);

  let m = /^\/cards\/([a-z0-9]{6,20})$/.exec(path);
  if (m && method === 'PUT') return updateCard(request, env, m[1]);
  if (m && method === 'DELETE') return deleteCard(request, env, m[1]);
  m = /^\/cards\/([a-z0-9]{6,20})\/stats$/.exec(path);
  if (m && method === 'GET') return cardStats(request, env, m[1]);
  m = /^\/cards\/([a-z0-9]{6,20})\/status$/.exec(path);
  if (m && method === 'POST') return setCardStatus(request, env, m[1]);
  m = /^\/org\/members\/([a-z0-9]{16})$/.exec(path);
  if (m && method === 'POST') return updateMember(request, env, m[1]);
  m = /^\/org\/members\/([a-z0-9]{16})\/password$/.exec(path);
  if (m && method === 'POST') return resetMemberPassword(request, env, m[1]);
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
  return json({ user: publicUser({ ...user, must_change: 0 }), cards: [], wallet: walletStatus(env) }, 201, { 'set-cookie': await startSession(env, url, user.id) });
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

  const user = await env.DB.prepare('SELECT id, username, email, pass_hash, active FROM users WHERE username = ? OR email = ?')
    .bind(name, name).first();
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    await recordAttempt(env, request, 'login');
    await addAttempt(env, accountKey);
    throw new HttpError(401, 'Wrong username or password.');
  }
  if (!user.active) throw new HttpError(403, 'This account has been deactivated by your company administrator.');
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(Date.now(), user.id).run();
  const cookieHeader = await startSession(env, url, user.id);
  return json(await accountState(env, await userById(env, user.id)), 200, { 'set-cookie': cookieHeader });
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
  const user = await currentUser(request, env);
  if (!user) return json({ user: null, cards: [], wallet: walletStatus(env) });
  return json(await accountState(env, user));
}

// Everything the app needs about the person who is logged in.
async function accountState(env, user) {
  let org = null;
  if (user.org_id) {
    const row = await env.DB.prepare('SELECT id, name, plan FROM orgs WHERE id = ?').bind(user.org_id).first();
    if (row) org = { id: row.id, name: row.name, plan: row.plan, role: user.role || 'member' };
  }
  return { user: { ...publicUser(user), org }, cards: await cardsOf(env, user.id), wallet: walletStatus(env) };
}

const USER_FIELDS = 'u.id, u.username, u.email, u.active, u.must_change, u.org_id, u.role';

async function userById(env, id) {
  return env.DB.prepare(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = ?`).bind(id).first();
}

async function deleteAccount(request, env, url) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(typeof body.password === 'string' ? body.password : '', row.pass_hash))) {
    throw new HttpError(403, 'That password is not correct.');
  }
  if (user.role === 'owner') {
    const others = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND id != ?').bind(user.org_id, user.id).first();
    if (others.n) throw new HttpError(409, 'You own a company workspace with other members. Make another person the owner first.');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE card_id IN (SELECT id FROM cards WHERE user_id = ?)').bind(user.id),
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
    env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPassword(next), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, keep),
  ]);
  return json({ ok: true });
}

const publicUser = (user) => ({ username: user.username, email: user.email, mustChange: Boolean(user.must_change) });

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT ${USER_FIELDS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
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
    `SELECT c.id, c.slug, c.data, c.views, c.updated_at, c.active, c.inactive_message,
            (SELECT COUNT(*) FROM contacts k WHERE k.card_id = c.id) AS contacts,
            (SELECT COUNT(*) FROM events e WHERE e.card_id = c.id AND e.kind = 'save') AS saves,
            (SELECT MAX(created_at) FROM media m WHERE m.card_id = c.id AND m.kind = 'og') AS assets_at
     FROM cards c WHERE c.user_id = ? ORDER BY c.slug = '' DESC, c.created_at`,
  ).bind(userId).all();
  return results.map(cardRow);
}

const cardRow = (r) => ({
  id: r.id, slug: r.slug, card: readCard(r.data), views: r.views || 0, contacts: r.contacts || 0, updatedAt: r.updated_at,
  assetsAt: r.assets_at || 0, saves: r.saves || 0, active: r.active !== 0, inactiveMessage: r.inactive_message || '',
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
  return json({ id, slug, card, views: 0, contacts: 0, saves: 0, active: true, inactiveMessage: '', updatedAt: now, assetsAt: 0 }, 201);
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
    env.DB.prepare('DELETE FROM events WHERE card_id = ?').bind(id),
    env.DB.prepare('DELETE FROM media WHERE card_id = ?').bind(id),
    env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ---------- analytics ----------

const EVENT_KINDS = new Set(['whatsapp', 'email', 'call', 'qr', 'share', 'web']);
const today = () => new Date().toISOString().slice(0, 10);
const trackStatement = (env, cardId, kind) =>
  env.DB.prepare('INSERT INTO events (card_id, kind, day, at) VALUES (?, ?, ?, ?)').bind(cardId, kind, today(), Date.now());

// Taps on a card page (WhatsApp, email, call, QR, share, website), sent by the page as they happen.
async function recordEvent(request, env) {
  const body = await readJson(request, 2000);
  if (!EVENT_KINDS.has(body.kind)) throw new HttpError(400, 'Unknown event.');
  const row = await findCard(env, body.u, body.s);
  if (!row || !row.active) return json({ ok: true });
  const viewer = await currentUser(request, env);
  if (viewer && viewer.id === row.user_id) return json({ ok: true }); // the owner's own taps do not count
  await trackStatement(env, row.id, body.kind).run();
  return json({ ok: true });
}

async function cardStats(request, env, id) {
  const row = await manageableCard(request, env, id);
  const days = 30;
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const [totals, daily, card] = await env.DB.batch([
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM events WHERE card_id = ? GROUP BY kind').bind(id),
    env.DB.prepare('SELECT day, kind, COUNT(*) AS n FROM events WHERE card_id = ? AND day >= ? GROUP BY day, kind').bind(id, since),
    env.DB.prepare('SELECT views FROM cards WHERE id = ?').bind(id),
  ]);
  const total = Object.fromEntries(totals.map((t) => [t.kind, t.n]));
  total.view = Math.max(total.view || 0, card[0] ? card[0].views : 0); // views counted before events existed
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const on = daily.filter((d) => d.day === day);
    const count = (kind) => (on.find((d) => d.kind === kind) || { n: 0 }).n;
    series.push({ day, view: count('view'), save: count('save') });
  }
  return json({ id: row.id, total, series });
}

const csvCell = (v) => {
  const t = String(v ?? '');
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const csvResponse = (text, filename) => new Response('﻿' + text, {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' },
});

// Day-by-day activity for the user's cards, or for every card in the company (admins).
async function activityCsv(request, env, url, wholeOrg) {
  const user = await requireUser(request, env);
  if (wholeOrg) requireAdminRole(user);
  const { results: cards } = await env.DB.prepare(
    `SELECT c.id, c.slug, c.data, u.username FROM cards c JOIN users u ON u.id = c.user_id WHERE ${wholeOrg ? 'u.org_id = ?' : 'c.user_id = ?'}`,
  ).bind(wholeOrg ? user.org_id : user.id).all();
  const kinds = ['view', 'save', 'whatsapp', 'email', 'call', 'qr', 'share', 'web'];
  const rows = [['date', ...(wholeOrg ? ['username'] : []), 'card', 'link', 'views', 'contact_saves', 'whatsapp', 'email', 'call', 'qr_opens', 'shares', 'website']];
  for (const c of cards) {
    const { results } = await env.DB.prepare('SELECT day, kind, COUNT(*) AS n FROM events WHERE card_id = ? GROUP BY day, kind ORDER BY day').bind(c.id).all();
    const byDay = {};
    for (const r of results) (byDay[r.day] ||= {})[r.kind] = r.n;
    const card = readCard(c.data);
    for (const [day, counts] of Object.entries(byDay)) {
      rows.push([day, ...(wholeOrg ? [c.username] : []), card.label || card.name, `${url.origin}/${c.username}${c.slug ? '/' + c.slug : ''}`, ...kinds.map((k) => counts[k] || 0)]);
    }
  }
  const head = rows.shift();
  rows.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return csvResponse(csv([head, ...rows]), wholeOrg ? 'mkcards-company-activity.csv' : 'mkcards-activity.csv');
}

// ---------- card status (active / inactive) ----------

// The card owner, or an admin of the company the owner belongs to.
async function manageableCard(request, env, id) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT c.id, c.slug, c.user_id, u.org_id FROM cards c JOIN users u ON u.id = c.user_id WHERE c.id = ?').bind(id).first();
  const admin = user.org_id && row && row.org_id === user.org_id && (user.role === 'admin' || user.role === 'owner');
  if (!row || (row.user_id !== user.id && !admin)) throw new HttpError(404, 'Card not found.');
  return { ...row, user };
}

async function setCardStatus(request, env, id) {
  await manageableCard(request, env, id);
  const body = await readJson(request);
  await env.DB.prepare('UPDATE cards SET active = ?, inactive_message = ? WHERE id = ?')
    .bind(body.active ? 1 : 0, text(body.message, 400) || null, id).run();
  return json({ ok: true, active: Boolean(body.active) });
}

const DEFAULT_LEFT_MESSAGE = '{name} is no longer with {company}. For assistance, please contact {company} using the details below.';

// What a visitor sees when a card has been switched off, for example because its holder left the company.
async function inactiveNotice(env, row) {
  const card = readCard(row.data);
  let org = null;
  if (row.org_id) {
    const o = await env.DB.prepare('SELECT name, data FROM orgs WHERE id = ?').bind(row.org_id).first();
    if (o) org = { name: o.name, ...JSON.parse(o.data || '{}') };
  }
  const company = (org && org.name) || card.company || '';
  const template = row.inactive_message || (org && org.leftMessage) || (company ? DEFAULT_LEFT_MESSAGE : 'This card is no longer active.');
  const message = template.replace(/\{name\}/g, card.name).replace(/\{company\}/g, company || 'the company');
  return {
    inactive: true,
    card: { name: card.name, company, accent: (org && org.accent) || card.accent, style: card.style, ar: {} },
    message,
    contact: org ? { email: org.contactEmail || '', phone: org.contactPhone || '', website: org.website || '' } : null,
  };
}

// ---------- company workspaces ----------

function requireAdminRole(user) {
  if (!user.org_id || (user.role !== 'admin' && user.role !== 'owner')) throw new HttpError(403, 'Only company administrators can do this.');
}

const ORG_SETTINGS = { accent: 7, leftMessage: 400, contactEmail: 120, contactPhone: 40, website: 300 };
function cleanOrgSettings(input) {
  const out = {};
  for (const [key, max] of Object.entries(ORG_SETTINGS)) out[key] = text(input && input[key], max);
  out.logo = input && MEDIA_PATH.test(input.logo || '') ? input.logo : '';
  if (!/^#[0-9a-f]{6}$/i.test(out.accent)) out.accent = '#2a5ba8';
  if (out.website) out.website = safeUrl(out.website);
  return out;
}

async function createOrg(request, env) {
  const user = await requireUser(request, env);
  if (user.org_id) throw new HttpError(409, 'You are already part of a company workspace.');
  const body = await readJson(request);
  const name = text(body.name, 80);
  if (!name) throw new HttpError(400, 'Enter the company name.');
  const id = randomId(12);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO orgs (id, name, data, plan, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, JSON.stringify(cleanOrgSettings({})), 'trial', Date.now()),
    env.DB.prepare("UPDATE users SET org_id = ?, role = 'owner' WHERE id = ?").bind(id, user.id),
  ]);
  return json(await accountState(env, await userById(env, user.id)), 201);
}

async function updateOrg(request, env) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const body = await readJson(request);
  const name = text(body.name, 80);
  if (!name) throw new HttpError(400, 'Enter the company name.');
  const before = await env.DB.prepare('SELECT data FROM orgs WHERE id = ?').bind(user.org_id).first();
  const settings = { ...cleanOrgSettings(body.settings), logo: JSON.parse(before.data || '{}').logo || '' };
  await env.DB.prepare('UPDATE orgs SET name = ?, data = ? WHERE id = ?').bind(name, JSON.stringify(settings), user.org_id).run();
  return json({ ok: true });
}

// The company logo: shown on members' wallet passes when their card has no logo of its own.
async function setOrgLogo(request, env) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const body = await readJson(request);
  const org = await env.DB.prepare('SELECT data FROM orgs WHERE id = ?').bind(user.org_id).first();
  const settings = JSON.parse(org.data || '{}');
  if (body.logo) {
    const image = parseImage(body.logo, 'logo');
    if (!image) throw new HttpError(400, 'That logo could not be used. Try a PNG or JPEG under 300 KB.');
    settings.logo = await replaceMedia(env, user.id, `org:${user.org_id}`, 'logo', image);
  } else {
    await env.DB.prepare("DELETE FROM media WHERE card_id = ? AND kind = 'logo'").bind(`org:${user.org_id}`).run();
    settings.logo = '';
  }
  await env.DB.prepare('UPDATE orgs SET data = ? WHERE id = ?').bind(JSON.stringify(settings), user.org_id).run();
  return json({ logo: settings.logo });
}

async function orgMembers(env, orgId) {
  const [users, cards] = await env.DB.batch([
    env.DB.prepare('SELECT id, username, email, active, role, must_change, last_login, created_at FROM users WHERE org_id = ? ORDER BY created_at').bind(orgId),
    env.DB.prepare(
      `SELECT c.id, c.user_id, c.slug, c.data, c.active, c.views,
              (SELECT COUNT(*) FROM events e WHERE e.card_id = c.id AND e.kind = 'save') AS saves
       FROM cards c JOIN users u ON u.id = c.user_id WHERE u.org_id = ? ORDER BY c.slug = '' DESC, c.created_at`,
    ).bind(orgId),
  ]);
  return users.map((u) => {
    const own = cards.filter((c) => c.user_id === u.id).map((c) => {
      const card = readCard(c.data);
      return { id: c.id, slug: c.slug, label: card.label, name: card.name, title: card.title, department: card.department,
        phones: card.phones, whatsapp: card.whatsapp, active: c.active !== 0, views: c.views || 0, saves: c.saves || 0 };
    });
    const main = own.find((c) => c.slug === '') || own[0] || {};
    return {
      id: u.id, username: u.username, email: u.email, active: u.active !== 0, role: u.role || 'member',
      pending: Boolean(u.must_change), lastLogin: u.last_login || 0, name: main.name || '', title: main.title || '',
      department: main.department || '', cards: own,
    };
  });
}

async function orgOverview(request, env) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const org = await env.DB.prepare('SELECT id, name, data, plan, created_at FROM orgs WHERE id = ?').bind(user.org_id).first();
  return json({
    org: { id: org.id, name: org.name, plan: org.plan, settings: cleanOrgSettings(JSON.parse(org.data || '{}')), defaultMessage: DEFAULT_LEFT_MESSAGE },
    members: await orgMembers(env, user.org_id),
    me: user.id,
  });
}

async function membersCsv(request, env, url) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const members = await orgMembers(env, user.org_id);
  const rows = [['email', 'username', 'name', 'title', 'department', 'mobile', 'office', 'whatsapp', 'role', 'status', 'card_link', 'views', 'contact_saves']];
  for (const m of members) {
    const main = m.cards.find((c) => c.slug === '') || {};
    const phone = (label) => ((main.phones || []).find((p) => p.label === label) || {}).value || '';
    rows.push([m.email, m.username, m.name, m.title, m.department, phone('mobile'), phone('work'), main.whatsapp || '', m.role,
      m.active ? (m.pending ? 'invited' : 'active') : 'deactivated', `${url.origin}/${m.username}`,
      m.cards.reduce((n, c) => n + c.views, 0), m.cards.reduce((n, c) => n + c.saves, 0)]);
  }
  return csvResponse(csv(rows), 'mkcards-members.csv');
}

// A small CSV reader (quoted fields, commas and new lines inside quotes).
function parseCsv(textIn) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const t = String(textIn).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const tempPassword = () => `Mk-${randomId(4)}-${randomId(4)}-${randomId(2)}`;

/**
 * Adds or updates company members from CSV rows. New people get an account, a card and a temporary password
 * (shown once, in the reply) that they must change when they first log in. People already in the company get
 * their main card updated from the row. Sent in small batches by the page.
 */
async function importMembers(request, env, url) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const body = await readJson(request, 200_000);
  const rows = parseCsv(body.csv || '');
  if (rows.length < 2) throw new HttpError(400, 'The file needs a header row and at least one person.');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const col = (r, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0 && r[i]) return r[i].trim(); } return ''; };
  if (head.indexOf('email') < 0) throw new HttpError(400, 'The file needs an "email" column.');
  if (rows.length - 1 > 25) throw new HttpError(400, 'Send at most 25 people at a time.');
  const org = await env.DB.prepare('SELECT name, data FROM orgs WHERE id = ?').bind(user.org_id).first();
  const settings = cleanOrgSettings(JSON.parse(org.data || '{}'));
  const results = [];

  for (const r of rows.slice(1)) {
    const email = col(r, 'email').toLowerCase();
    const name = col(r, 'name', 'full_name', 'fullname');
    const result = { email, name };
    try {
      if (!isEmail(email)) throw new HttpError(400, 'Email address is missing or not valid.');
      const role = ['admin', 'member'].includes(col(r, 'role').toLowerCase()) ? col(r, 'role').toLowerCase() : 'member';
      const phones = [['mobile', col(r, 'mobile', 'phone')], ['work', col(r, 'office', 'work_phone')]].filter(([, v]) => v).map(([label, value]) => ({ label, value }));
      const fields = {
        name, title: col(r, 'title', 'job_title'), department: col(r, 'department'), company: col(r, 'company') || org.name,
        phones, emails: [{ label: 'work', value: col(r, 'card_email', 'work_email') || email }], whatsapp: col(r, 'whatsapp'),
        website: col(r, 'website'), address: col(r, 'address'),
        ar: { name: col(r, 'name_ar'), title: col(r, 'title_ar'), department: col(r, 'department_ar'), company: col(r, 'company_ar') },
      };
      const existing = await env.DB.prepare('SELECT id, org_id, username FROM users WHERE email = ?').bind(email).first();
      if (existing && existing.org_id !== user.org_id) throw new HttpError(409, 'This email already has its own MK Cards account.');

      if (existing) {
        // Already in the company: update the main card with what the row gives.
        const main = await env.DB.prepare("SELECT id, data FROM cards WHERE user_id = ? AND slug = ''").bind(existing.id).first();
        if (main) {
          const current = readCard(main.data);
          const merged = { ...current };
          for (const [k, v] of Object.entries(fields)) {
            if (k === 'ar') merged.ar = { ...current.ar, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) };
            else if (Array.isArray(v) ? v.length : v) merged[k] = v;
          }
          const card = cleanCard(merged);
          card.photo = current.photo;
          await env.DB.prepare('UPDATE cards SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(card), Date.now(), main.id).run();
        }
        if (existing.id !== user.id) await env.DB.prepare('UPDATE users SET role = ? WHERE id = ? AND role != ?').bind(role, existing.id, 'owner').run();
        results.push({ ...result, username: existing.username, status: 'updated' });
        continue;
      }

      if (!name) throw new HttpError(400, 'Name is missing.');
      let base = slugify(col(r, 'username') || email.split('@')[0]).replace(/[^a-z0-9_-]/g, '').slice(0, 26);
      if (!USERNAME.test(base) || RESERVED.has(base)) base = `user-${randomId(4)}`;
      let username = base;
      for (let n = 2; await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first(); n++) username = `${base}-${n}`;
      const password = tempPassword();
      const card = cleanCard({ ...fields, accent: settings.accent, style: 'aurora' });
      const id = randomId(16);
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users (id, username, email, pass_hash, created_at, must_change, org_id, role) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
          .bind(id, username, email, await hashPassword(password), now, user.org_id, role),
        env.DB.prepare("INSERT INTO cards (id, user_id, slug, data, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?)")
          .bind(randomId(12), id, JSON.stringify(card), now, now),
      ]);
      results.push({ ...result, username, status: 'created', password, link: `${url.origin}/${username}` });
    } catch (err) {
      results.push({ ...result, status: 'error', reason: err instanceof HttpError ? err.message : 'Could not be added.' });
      if (!(err instanceof HttpError)) console.error(err);
    }
  }
  return json({ results });
}

async function memberOfMyOrg(request, env, memberId) {
  const user = await requireUser(request, env);
  requireAdminRole(user);
  const member = await env.DB.prepare('SELECT id, role, org_id FROM users WHERE id = ?').bind(memberId).first();
  if (!member || member.org_id !== user.org_id) throw new HttpError(404, 'That person is not in your company.');
  return { user, member };
}

// Activate or deactivate a person (and all their cards), or change their role.
async function updateMember(request, env, memberId) {
  const { user, member } = await memberOfMyOrg(request, env, memberId);
  const body = await readJson(request);
  if (typeof body.active === 'boolean') {
    if (member.id === user.id) throw new HttpError(400, 'You cannot deactivate yourself.');
    if (member.role === 'owner') throw new HttpError(403, 'The owner of the workspace cannot be deactivated.');
    const on = body.active ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(on, member.id),
      env.DB.prepare('UPDATE cards SET active = ? WHERE user_id = ?').bind(on, member.id),
      ...(on ? [] : [env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(member.id)]),
    ]);
  }
  if (body.role) {
    if (user.role !== 'owner') throw new HttpError(403, 'Only the owner of the workspace can change roles.');
    if (member.id === user.id || !['admin', 'member'].includes(body.role)) throw new HttpError(400, 'That role change is not possible.');
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, member.id).run();
  }
  if (body.leave === true) {
    // Remove the person from the company. Their cards stay, switched off with the company's message.
    if (member.role === 'owner' || member.id === user.id) throw new HttpError(400, 'That person cannot be removed.');
    await env.DB.batch([
      env.DB.prepare('UPDATE cards SET active = 0 WHERE user_id = ?').bind(member.id),
      env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(member.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(member.id),
    ]);
  }
  return json({ ok: true });
}

async function resetMemberPassword(request, env, memberId) {
  const { member } = await memberOfMyOrg(request, env, memberId);
  if (member.role === 'owner') throw new HttpError(403, 'The owner changes their own password.');
  const password = tempPassword();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 1 WHERE id = ?').bind(await hashPassword(password), member.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(member.id),
  ]);
  return json({ password });
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
  strip: { types: ['image/png'], max: 700_000 },
  logo: { types: ['image/png'], max: 300_000 },
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
  for (const kind of ['photo', 'logo']) {
    const value = card[kind] || '';
    if (value.startsWith('data:')) {
      const image = parseImage(value, kind);
      if (!image) throw new HttpError(400, kind === 'logo' ? 'That logo could not be used. Try a PNG or JPEG under 300 KB.' : 'That photo could not be used. Try another one.');
      card[kind] = await replaceMedia(env, userId, cardId, kind, image);
      continue;
    }
    const m = MEDIA_PATH.exec(value);
    const owned = m && await env.DB.prepare('SELECT 1 FROM media WHERE id = ? AND card_id = ? AND kind = ?').bind(m[1], cardId, kind).first();
    if (!owned) {
      card[kind] = '';
      await env.DB.prepare('DELETE FROM media WHERE card_id = ? AND kind = ?').bind(cardId, kind).run();
    }
  }
}

// Pictures drawn by the editor from the finished card: link preview, wallet thumbnail and wallet banner.
async function saveCardAssets(request, env, id) {
  const row = await ownCard(request, env, id);
  const body = await readJson(request, 1_200_000);
  const saved = {};
  for (const kind of ['og', 'thumb', 'hero', 'strip']) {
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
  // The banner drawn from the card, and the card's own logo or else the company's.
  const media = await cardMedia(env, id);
  let logoPath = card.logo;
  if (!logoPath && user.org_id) {
    const org = await env.DB.prepare('SELECT data FROM orgs WHERE id = ?').bind(user.org_id).first();
    logoPath = (org && JSON.parse(org.data || '{}').logo) || '';
  }

  if (kind === 'apple.pkpass') {
    if (!ready.apple) throw new HttpError(503, 'Apple Wallet passes are not set up yet.');
    let file;
    try {
      const strip = media.strip ? (await mediaBytes(env, media.strip.path)).bytes : null;
      const logo = logoPath ? (await mediaBytes(env, logoPath))?.bytes : null;
      file = await applePass(env, { cardId: id, card, link, strip, logo });
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
  const save = await googleSaveUrl(env, { cardId: id, card, link, origin: url.origin,
    hero: media.hero && media.hero.path, logo: logoPath });
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
    `SELECT c.id, c.slug, c.data, c.active, c.inactive_message, c.user_id, u.username, u.email,
            u.active AS user_active, u.org_id FROM cards c JOIN users u ON u.id = c.user_id
     WHERE u.username = ? AND c.slug = ?`,
  ).bind(username, slug).first();
}

async function publicCard(env, url) {
  const row = await findCard(env, url.searchParams.get('u'), url.searchParams.get('s'));
  if (!row) throw new HttpError(404, 'Card not found.');
  if (!row.active || !row.user_active) return json(await inactiveNotice(env, row));
  if (url.searchParams.has('view')) {
    await env.DB.batch([
      env.DB.prepare('UPDATE cards SET views = views + 1 WHERE id = ?').bind(row.id),
      trackStatement(env, row.id, 'view'),
    ]);
  }
  // contactEmail is the owner's account email: the page's "share your details" button writes to it.
  return json({ username: row.username, slug: row.slug, card: readCard(row.data), contactEmail: row.email });
}

async function publicVCard(env, url) {
  const row = await findCard(env, url.searchParams.get('u'), url.searchParams.get('s'));
  if (!row) throw new HttpError(404, 'Card not found.');
  if (!row.active || !row.user_active) throw new HttpError(410, 'This card is no longer active.');
  await trackStatement(env, row.id, 'save').run();
  const link = `${url.origin}/${row.username}${row.slug ? '/' + row.slug : ''}`;
  const card = inLanguage(readCard(row.data), url.searchParams.get('lang'));
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
    whatsappMessage: text(input.whatsappMessage, 300),
    website: safeUrl(input.website),
    address: text(input.address, 160),
    photo: '',
    logo: '',
    accent: /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent.toLowerCase() : '#2a5ba8',
    style: STYLES.has(input.style) ? input.style : 'aurora',
    links: [],
    // The Arabic version of the card's words, shown when a visitor switches the page to العربية.
    ar: cleanArabic(input.ar),
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
  // A new photo or logo (data: URL) or the card's current address for it; keepPhoto() checks and stores it.
  for (const kind of ['photo', 'logo']) {
    if (typeof input[kind] === 'string' && (input[kind].startsWith('data:') || MEDIA_PATH.test(input[kind]))) card[kind] = input[kind];
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

const AR_FIELDS = { name: 80, title: 80, department: 80, company: 80, bio: 400, address: 160 };

function cleanArabic(input) {
  const out = {};
  for (const [key, max] of Object.entries(AR_FIELDS)) {
    const value = text(input && input[key], max);
    if (value) out[key] = value;
  }
  return out;
}

/** The card as shown in a language: Arabic words where the owner wrote them, the main ones otherwise. */
export function inLanguage(card, lang) {
  return lang === 'ar' && card.ar && card.ar.name ? { ...card, ...card.ar } : card;
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
  if (typeof card.logo !== 'string') card.logo = '';
  if (typeof card.whatsappMessage !== 'string') card.whatsappMessage = '';
  if (!card.ar || typeof card.ar !== 'object') card.ar = {};
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
