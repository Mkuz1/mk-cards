// MK Cards — single-page app. No build step: plain ES modules.
import { ART_VERSION, cardTheme, drawCardArt, hexRgb, mixHex } from './card-art.js';

export const APP_VERSION = '1.9.1'; // keep in step with VERSION in sw.js

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const toasts = document.getElementById('toasts');
const native = window.MKNative || null; // provided by the Android app

// ---------- tiny DOM helpers ----------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  cards: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M7 3h10M7 11h4M7 15h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.3-1.3L14 3h-4l-.3 2.4a7 7 0 0 0-2.3 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.3 1.3L10 21h4l.3-2.4a7 7 0 0 0 2.3-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5zM3 13h5l1 3h6l1-3h5"/>',
  phone: '<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a3 3 0 0 1-3 3A14 14 0 0 1 3 6a3 3 0 0 1 3-3z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 8l8 6 8-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.500 0 18M12 3c-3 3.5-3 14.500 0 18"/>',
  pin: '<path d="M12 21s7-6.200 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.500" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',
  whatsapp: '<path d="M4 20l1.300-4A8.500 8.500 0 1 1 8 18.700L4 20z"/><path d="M9.200 8.600c.2-.5.6-.6.9-.6h.5c.2 0 .4.1.5.4l.7 1.600c.1.2 0 .5-.1.6l-.5.6c-.1.1-.1.3 0 .5a6 6 0 0 0 2.700 2.400c.2.1.4 0 .5-.1l.6-.7c.1-.2.4-.2.6-.1l1.600.8c.2.1.3.3.3.5 0 .9-.6 1.600-1.400 1.800-1 .3-2.700-.2-4.400-1.700-1.600-1.400-2.500-3-2.500-4 0-.6.3-1.300.5-1.900z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chat: '<path d="M20 11.500a8 8 0 0 1-11.800 7L4 20l1.500-4.200A8 8 0 1 1 20 11.500z"/><path d="M9 10.500h6M9 13.500h4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M19 17v3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

// Solid icons for the card itself (as in the reference design); line icons everywhere else.
const SOLID = {
  phone: '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .7-.2 1z"/>',
  mail: '<path d="M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/>',
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>',
  save: '<path d="M15 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/>',
  whatsapp: '<path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.4 4.8 5-1.3A9.8 9.8 0 1 0 12 2.2zm5.7 13.8c-.2.7-1.4 1.300-2 1.400-.5.1-1.200.1-1.900-.1a17 17 0 0 1-1.700-.6c-3-1.300-4.900-4.300-5.100-4.500-.1-.2-1.200-1.600-1.200-3.100s.8-2.200 1.100-2.500c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.100c.1.200.1.400 0 .5l-.3.5-.4.5c-.1.100-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.100 1 2.100 1.300 2.400 1.500.3.100.5.100.7-.1l.9-1.100c.2-.300.400-.200.700-.1l2 1c.3.1.5.2.5.3.1.2.1.700-.1 1.400z"/>',
  globe: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.700 15.700 0 0 0-1.400-3.600A8 8 0 0 1 18.900 8zM12 4c.8 1.200 1.500 2.500 1.900 4h-3.800c.4-1.500 1.100-2.800 1.900-4zM4.300 14a8.200 8.200 0 0 1 0-4h3.400a16.500 16.500 0 0 0 0 4H4.300zm.8 2h2.900c.3 1.300.8 2.500 1.400 3.600A8 8 0 0 1 5.100 16zM8 8H5.100a8 8 0 0 1 4.300-3.600C8.800 5.500 8.400 6.700 8 8zm4 12c-.8-1.200-1.500-2.500-1.900-4h3.800c-.4 1.500-1.100 2.800-1.900 4zm2.300-6H9.700a14.700 14.700 0 0 1 0-4h4.600a14.700 14.700 0 0 1 0 4zm.3 5.600c.6-1.100 1.100-2.300 1.400-3.600h2.900a8 8 0 0 1-4.300 3.600zm1.800-5.600a16.500 16.500 0 0 0 0-4h3.400a8.200 8.200 0 0 1 0 4h-3.400z"/>',
  link: '<path d="M3.900 12a3.100 3.100 0 0 1 3.100-3.100h4V7H7a5 5 0 0 0 0 10h4v-1.900H7A3.100 3.100 0 0 1 3.900 12zM8 13h8v-2H8v2zm9-6h-4v1.900h4a3.100 3.100 0 0 1 0 6.200h-4V17h4a5 5 0 0 0 0-10z"/>',
};

function solidIcon(name) {
  if (!SOLID[name]) return icon(name);
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SOLID[name]}</svg>`;
  return span.firstChild;
}

function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

function logo() {
  return h('img', { class: 'brand-icon', src: '/icons/icon-192.png', alt: '' });
}

// ---------- account state (loaded from the server; nothing about the user is kept only on the device) ----------

let me = { user: null, cards: [] };

async function loadMe() {
  me = await api('/me');
}

const findCard = (id) => me.cards.find((c) => c.id === id) || null;
const cardPath = (entry) => `/${me.user.username}${entry.slug ? '/' + entry.slug : ''}`;
const cardUrl = (entry) => location.origin + cardPath(entry);
const qrFileBase = (entry) => `mkcards-${me.user.username}${entry.slug ? '-' + entry.slug : ''}-qr`;

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    // The session ended somewhere else (expired, or logged out on another device).
    if (res.status === 401 && me.user && !path.startsWith('/auth/')) {
      me = { user: null, cards: [] };
      go('/login');
    }
    throw err;
  }
  return data;
}

// ---------- shared pieces ----------

const COLOURS = [
  ['#2a5ba8', 'Midnight'], ['#5b8cff', 'Royal blue'], ['#7a5cff', 'Violet'], ['#e0559a', 'Rose'], ['#b8344f', 'Burgundy'],
  ['#f0683c', 'Copper'], ['#e3a008', 'Amber'], ['#1fa97a', 'Emerald'], ['#149fc4', 'Teal'], ['#3c4658', 'Graphite'],
];
const ACCENTS = COLOURS.map(([value]) => value);
const colourName = (value) => (COLOURS.find(([v]) => v === value) || [null, 'Custom'])[1];
const LINK_TYPES = {
  website: 'Website', linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', facebook: 'Facebook',
  youtube: 'YouTube', tiktok: 'TikTok', github: 'GitHub', whatsapp: 'WhatsApp', telegram: 'Telegram',
  calendar: 'Book a meeting', other: 'Link',
};

const PHONE_LABELS = { mobile: 'Mobile', work: 'Work', home: 'Home', other: 'Other' };
const EMAIL_LABELS = { work: 'Work', personal: 'Personal', other: 'Other' };
const MAX_ENTRIES = 6; // phones or emails per card
const MAX_CARDS = 10;

const slugify = (value) =>
  String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');

const initials = (name) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'MK';
const prettyUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

// ---------- the card ----------

// All shades are worked out here (not with CSS colour functions) so the card looks right on older iPhones too.
function themeVars(card) {
  const t = cardTheme(card);
  const rgba = (c, alpha) => `rgba(${hexRgb(c).join(',')},${alpha})`;
  return [
    `--deep:${t.deep}`, `--page:${t.page}`, `--glass-top:${t.glassTop}`, `--glass-bottom:${t.glassBottom}`,
    `--haze:${rgba(t.haze, 0.74)}`, `--page-haze:${rgba(t.haze, 0.34)}`, `--tint:${rgba(t.a, 0.22)}`,
    `--hi:${t.hi}`, `--hi-light:${mixHex(t.hi, '#ffffff', 0.45)}`, `--hi-top:${mixHex(t.hi, '#ffffff', 0.1)}`,
    `--hi-bottom:${mixHex(t.hi, '#000000', 0.1)}`, `--hi-glow:${rgba(t.hi, 0.5)}`, `--hi-ink:${mixHex(t.hi, '#000000', 0.84)}`,
  ].join(';');
}

const phoneLabel = (p) => ({ mobile: 'Mobile', work: 'Office', home: 'Home' })[p.label] || 'Phone';
const emailLabel = (e) => ({ work: 'Work', personal: 'Personal' })[e.label] || 'Email';
const telHref = (v) => 'tel:' + v.replace(/[^\d+]/g, '');
const waHref = (v) => 'https://wa.me/' + v.replace(/\D/g, '');

function avatarOf(card, cls) {
  return card.photo
    ? h('img', { class: cls, src: card.photo, alt: '' })
    : h('div', { class: cls, 'aria-hidden': 'true' }, h('span', {}, initials(card.name)));
}

/**
 * Draws a card. `actions.save` is called by the "Save contact" button on the public page; without it (in the
 * editor preview) the quick buttons are shown for looks only.
 */
function renderCard(card, { compact = false, actions = null } = {}) {
  if (compact) {
    const role = [card.title, card.company].filter(Boolean).join(' · ');
    return h('article', { class: `vc-mini ${card.style || 'aurora'}`, style: themeVars(card) },
      avatarOf(card, 'vc-avatar small'),
      h('div', { class: 'grow' },
        h('p', { class: 'vc-name', dir: 'auto' }, card.name || 'Your name'),
        role && h('p', { class: 'vc-title', dir: 'auto' }, role)));
  }

  const phones = (card.phones || []).filter((p) => p.value);
  const emails = (card.emails || []).filter((e) => e.value);
  const live = Boolean(actions);
  const tile = (iconName, label, href, extra = {}) => h(live && href ? 'a' : 'button', {
    class: `vc-action${extra.primary ? ' primary' : ''}`, href: live ? href : null, type: href ? null : 'button',
    target: href && /^https?:/.test(href) ? '_blank' : null, rel: 'noopener', tabindex: live ? null : '-1',
    onclick: extra.onclick || null,
  }, solidIcon(iconName), h('span', {}, label));
  const quick = [
    tile('save', 'Save contact', null, { primary: true, onclick: live ? actions.save : null }),
    card.whatsapp && tile('whatsapp', 'WhatsApp', waHref(card.whatsapp)),
    emails[0] && tile('mail', 'Email', 'mailto:' + emails[0].value),
    phones[0] && tile('phone', 'Call', telHref(phones[0].value)),
  ].filter(Boolean);

  const orgLine = card.department ? [card.department, card.company].filter(Boolean).join(' · ') : '';
  const hero = h('article', { class: `vc-hero vc-glass${live ? '' : ' preview'}` },
    card.company && h('p', { class: 'vc-eyebrow', dir: 'auto' }, card.company),
    avatarOf(card, 'vc-avatar'),
    h('h2', { class: 'vc-name', dir: 'auto' }, card.name || 'Your name'),
    card.title && h('p', { class: 'vc-title', dir: 'auto' }, card.title),
    orgLine && h('p', { class: 'vc-org', dir: 'auto' }, orgLine),
    card.bio && h('p', { class: 'vc-bio', dir: 'auto' }, card.bio),
    h('span', { class: 'vc-rule', 'aria-hidden': 'true' }),
    h('div', { class: 'vc-actions', style: `--n:${quick.length}` }, ...quick));

  const row = (iconName, label, value, href) => h(href ? 'a' : 'div', {
    class: 'vc-row', href, target: href && /^https?:/.test(href) ? '_blank' : null, rel: 'noopener',
  }, h('span', { class: 'vc-ico' }, solidIcon(iconName)),
  h('span', { class: 'grow' }, h('small', {}, label), h('bdi', { class: value.length > 24 ? 'long' : null }, value)),
  href ? h('span', { class: 'vc-chev' }, icon('chevron')) : null);
  const groups = [
    phones.map((p) => row('phone', phoneLabel(p), p.value, telHref(p.value))),
    card.whatsapp ? [row('whatsapp', 'WhatsApp', card.whatsapp, waHref(card.whatsapp))] : [],
    emails.map((e) => row('mail', emailLabel(e), e.value, 'mailto:' + e.value)),
    [card.website && row('globe', 'Website', prettyUrl(card.website), card.website),
      ...(card.links || []).filter((l) => l.url).map((l) => row('link', l.label || LINK_TYPES[l.type] || 'Link', prettyUrl(l.url), l.url))].filter(Boolean),
    card.address ? [row('pin', 'Address', card.address, 'https://maps.google.com/?q=' + encodeURIComponent(card.address))] : [],
  ].filter((g) => g.length);

  const wrap = h('div', { class: `vc ${card.style || 'aurora'}`, style: themeVars(card) }, hero);
  if (groups.length) wrap.append(h('section', { class: 'vc-details vc-glass' }, ...groups.map((g) => h('div', { class: 'vc-group' }, ...g))));
  return wrap;
}

function toast(message, action) {
  const el = h('div', { class: 'glass toast' + (action ? '' : ' plain') }, h('span', {}, message));
  if (action) el.append(h('button', { class: 'btn primary', onclick: () => { el.remove(); action.run(); } }, action.label));
  toasts.append(el);
  if (!action) setTimeout(() => el.remove(), 3600);
  return el;
}

function sheet(build) {
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: 'glass sheet stack', role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) close(); } }, panel);
  panel.append(...[build(close)].flat());
  document.body.append(scrim);
  document.addEventListener('keydown', onKey);
  const first = panel.querySelector('input, textarea, button');
  if (first) first.focus();
  return close;
}

function topbar(title, backTo) {
  return h('header', { class: 'topbar' },
    backTo != null && h('a', { class: 'btn icon', href: backTo, 'aria-label': 'Back' }, icon('back')),
    h('h1', {}, title));
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Link copied');
  } catch {
    toast('Could not copy. Press and hold the link to copy it.');
  }
}

async function shareLink(card, url) {
  const title = `${card.name} — MK Cards`;
  if (native) return native.share(title, `Here is my card: ${card.name}`, url);
  if (navigator.share) {
    try { await navigator.share({ title, url }); } catch { /* cancelled */ }
    return;
  }
  copyText(url);
}

function vcardFromContact(c) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const parts = (c.name || '').trim().split(/\s+/);
  const family = parts.length > 1 ? parts.pop() : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(parts.join(' '))};;;`, `FN:${esc(c.name)}`];
  if (c.company) lines.push(`ORG:${esc(c.company)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${esc(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

function saveVCard(text, filename) {
  if (native) return native.saveContact(text, filename);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// QR codes are generated from the card's address each time, so they can be re-made and downloaded without limit.
function qrMatrix(value) {
  const qr = window.qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return { n, d, isDark: (y, x) => qr.isDark(y, x) };
}

function qrBox(value) {
  try {
    const { n, d } = qrMatrix(value);
    const box = h('div', { class: 'qr', role: 'img', 'aria-label': 'QR code for this card' });
    box.innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="#0d1326" d="${d}"/></svg>`;
    return box;
  } catch (err) {
    console.error(err);
    return h('div', { class: 'stack center' },
      h('p', { class: 'error' }, 'The QR code could not be drawn on this device.'),
      h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Reload'));
  }
}

// ---------- wallet passes ----------

const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
const WALLET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h15a3 3 0 0 1 3 3M16 14.5h2"/></svg>';

// "Add to Apple Wallet" / "Add to Google Wallet", shown once the site owner has set up each wallet.
// The phone's own wallet comes first; the Android app only offers Google Wallet.
function walletButtons(entry) {
  const ready = me.wallet || {};
  const inAndroidApp = Boolean(native) && isAndroid;
  const apple = ready.apple && !inAndroidApp && walletButton(`/api/cards/${entry.id}/wallet/apple.pkpass`, 'Apple Wallet', 'apple');
  const google = ready.google && walletButton(`/api/cards/${entry.id}/wallet/google`, 'Google Wallet', 'google');
  const list = (isApple ? [apple, google] : [google, apple]).filter(Boolean);
  if (!list.length) return null;
  return h('div', { class: 'wallet-row' }, ...list);
}

function walletButton(href, name, kind) {
  const glyph = document.createElement('span');
  glyph.innerHTML = WALLET_ICON;
  const link = h('a', { class: `wallet-btn ${kind}`, href, rel: 'noopener' },
    glyph.firstChild, h('span', {}, h('small', {}, 'Add to'), name));
  // The iPhone app adds Apple passes itself, without leaving the app.
  if (kind === 'apple' && native && native.addPass) {
    link.addEventListener('click', (e) => { e.preventDefault(); native.addPass(location.origin + href); });
  }
  return link;
}

// QR files are made by the server (only for the card's owner), so the button is an ordinary download.
const qrFileUrl = (entry, format) => `/api/cards/${entry.id}/qr.${format}`;

function qrDownloadButton(entry, format, label, cls = 'btn') {
  return h('a', {
    class: cls, href: qrFileUrl(entry, format), download: `${qrFileBase(entry)}.${format}`,
    onclick: async (e) => {
      // The Android app saves the file itself; browsers handle the link as a normal download.
      if (!(native && native.saveFile)) return;
      e.preventDefault();
      try {
        const res = await fetch(qrFileUrl(entry, format), { credentials: 'same-origin' });
        if (!res.ok) throw new Error();
        const bytes = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        native.saveFile(btoa(binary), `${qrFileBase(entry)}.${format}`, format === 'png' ? 'image/png' : 'image/svg+xml');
      } catch {
        toast('Could not download the QR code. Check your connection and try again.');
      }
    },
  }, icon('download'), label);
}


// ---------- photo framing ----------

const PHOTO_SIZE = 360; // the saved photo is a small square JPEG so it travels with the card

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a picture we can read.'));
    img.src = src;
  });
}

// Lets the person drag and zoom their photo inside the card's frame, then returns the framed square.
function photoSheet(img, onDone) {
  sheet((close) => {
    const picture = h('img', { src: img.src, alt: '', draggable: 'false' });
    const frame = h('div', { class: 'cropper', tabindex: '0', role: 'group',
      'aria-label': 'Photo position. Drag, or use the arrow keys, to move the photo.' }, picture);
    const zoomInput = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' });
    let size = 0;   // frame width in pixels
    let base = 1;   // scale at which the photo just covers the frame
    let zoom = 1;
    let x = 0;      // top-left corner of the photo, relative to the frame
    let y = 0;

    const apply = () => {
      const w = img.naturalWidth * base * zoom;
      const hgt = img.naturalHeight * base * zoom;
      x = Math.min(0, Math.max(size - w, x)); // the photo must always fill the frame
      y = Math.min(0, Math.max(size - hgt, y));
      Object.assign(picture.style, { width: `${w}px`, height: `${hgt}px`, transform: `translate(${x}px, ${y}px)` });
    };
    const setZoom = (next) => {
      const centre = size / 2;
      const ratio = next / zoom; // keep whatever is at the middle of the frame in the middle
      x = centre - (centre - x) * ratio;
      y = centre - (centre - y) * ratio;
      zoom = next;
      apply();
    };
    const start = () => {
      size = frame.clientWidth;
      base = size / Math.min(img.naturalWidth, img.naturalHeight);
      x = (size - img.naturalWidth * base) / 2;
      y = (size - img.naturalHeight * base) / 2;
      apply();
    };
    requestAnimationFrame(start);

    let drag = null;
    frame.addEventListener('pointerdown', (e) => {
      drag = { px: e.clientX, py: e.clientY, x, y };
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      x = drag.x + e.clientX - drag.px;
      y = drag.y + e.clientY - drag.py;
      apply();
    });
    const endDrag = () => { drag = null; };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    frame.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
      if (!step) return;
      e.preventDefault();
      x += step[0];
      y += step[1];
      apply();
    });
    frame.addEventListener('wheel', (e) => {
      e.preventDefault();
      const next = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      zoomInput.value = String(next);
      setZoom(next);
    }, { passive: false });
    zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value)));

    return [
      h('h1', {}, 'Position your photo'),
      h('p', { class: 'muted small' }, 'Drag the photo to move it. Use the slider to zoom.'),
      frame,
      h('label', { class: 'field' }, h('span', {}, 'Zoom'), zoomInput),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => {
        const scale = base * zoom;
        const canvas = Object.assign(document.createElement('canvas'), { width: PHOTO_SIZE, height: PHOTO_SIZE });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // transparent PNGs get a white background instead of black
        ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
        ctx.drawImage(img, -x / scale, -y / scale, size / scale, size / scale, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        close();
        onDone(canvas.toDataURL('image/jpeg', 0.85));
      } }, 'Use photo'),
      h('button', { class: 'btn block', type: 'button', onclick: close }, 'Cancel'),
    ];
  });
}

// ---------- screens ----------

function welcomeScreen() {
  return h('div', { class: 'stack' },
    h('header', { class: 'topbar' }, h('div', { class: 'brand grow' }, logo(), 'MK Cards'),
      h('a', { class: 'btn', href: '/login' }, 'Log in')),
    h('section', { class: 'glass hero' },
      h('h1', {}, 'Your business card, always with you'),
      h('p', {}, 'Create a free account, make your card, and share it with a link or a QR code — no app needed on the other side.'),
      h('a', { class: 'btn primary', href: '/register' }, 'Create your account')),
    renderCard({
      name: 'Alex Morgan', title: 'Product Designer', company: 'Northwind Studio',
      phones: [{ label: 'mobile', value: '+1 555 010 2030' }], emails: [{ label: 'work', value: 'alex@example.com' }], website: 'https://example.com', accent: '#7a5cff', style: 'aurora',
    }),
    h('p', { class: 'muted small center' }, 'Example card'));
}

function authForm({ title, intro, fields, submitLabel, onSubmit, footer }) {
  const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
  const button = h('button', { class: 'btn primary block', type: 'submit' }, submitLabel);
  return h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    errorLine.hidden = true;
    button.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(e.target)));
    } catch (err) {
      errorLine.textContent = err.message;
      errorLine.hidden = false;
      button.disabled = false;
    }
  } },
    topbar(title, '/'),
    h('section', { class: 'glass panel stack' }, intro && h('p', { class: 'muted' }, intro), fields, errorLine, button),
    footer);
}

function registerScreen() {
  const hint = h('p', { class: 'small muted' }, `Your card will live at ${location.host}/username`);
  let timer = null;
  const checkUsername = (value) => {
    clearTimeout(timer);
    const name = value.trim().toLowerCase();
    if (!name) { hint.textContent = `Your card will live at ${location.host}/username`; hint.className = 'small muted'; return; }
    if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(name)) {
      hint.textContent = 'Use 3–30 letters, numbers, hyphens or underscores.';
      hint.className = 'small error';
      return;
    }
    hint.textContent = `${location.host}/${name}`;
    hint.className = 'small muted';
    timer = setTimeout(async () => {
      try {
        const { available, reserved } = await api('/auth/username?u=' + encodeURIComponent(name));
        hint.textContent = available ? `${location.host}/${name} is available`
          : reserved ? `"${name}" can't be used as a username` : `${name} is already taken`;
        hint.className = available ? 'small muted' : 'small error';
      } catch { /* the form itself reports problems on submit */ }
    }, 350);
  };

  return authForm({
    title: 'Create account',
    fields: [
      h('label', { class: 'field' }, h('span', {}, 'Username'),
        h('input', { class: 'input', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false',
          maxlength: 30, required: true, oninput: (e) => checkUsername(e.target.value) }), hint),
      h('label', { class: 'field' }, h('span', {}, 'Email'),
        h('input', { class: 'input', name: 'email', type: 'email', autocomplete: 'email', maxlength: 120, required: true })),
      h('label', { class: 'field' }, h('span', {}, 'Password'),
        h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 200, required: true }),
        h('p', { class: 'small muted' }, 'At least 8 characters. Keep it safe: it cannot be reset by email, only changed from your account.')),
    ],
    submitLabel: 'Create account',
    onSubmit: async (data) => {
      me = await api('/auth/register', { method: 'POST', body: data });
      go('/new');
    },
    footer: h('p', { class: 'center muted' }, 'Already have an account? ', h('a', { href: '/login' }, 'Log in')),
  });
}

function loginScreen() {
  return authForm({
    title: 'Log in',
    fields: [
      h('label', { class: 'field' }, h('span', {}, 'Username or email'),
        h('input', { class: 'input', name: 'login', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: 120, required: true })),
      h('label', { class: 'field' }, h('span', {}, 'Password'),
        h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', maxlength: 200, required: true })),
    ],
    submitLabel: 'Log in',
    onSubmit: async (data) => {
      me = await api('/auth/login', { method: 'POST', body: data });
      go(me.cards.length ? '/' : '/new');
    },
    footer: h('p', { class: 'center muted' }, 'New here? ', h('a', { href: '/register' }, 'Create an account')),
  });
}

// The link-preview and wallet pictures are drawn here from the saved card and stored with it.
async function drawAndUpload(entry) {
  try {
    const art = await drawCardArt(entry.card, cardUrl(entry));
    const res = await api(`/cards/${entry.id}/assets`, { method: 'PUT', body: art });
    entry.assetsAt = res.assetsAt;
  } catch (err) {
    console.warn('Could not save the card pictures; they will be redrawn next time.', err);
  }
}

// Cards saved before these pictures existed, or before a design change, are redrawn quietly in the background.
let redrawing = false;
async function redrawOutdatedArt() {
  if (redrawing || !me.user) return;
  redrawing = true;
  for (const entry of me.cards) {
    if ((entry.assetsAt || 0) < Math.max(entry.updatedAt || 0, ART_VERSION)) await drawAndUpload(entry);
  }
  redrawing = false;
}

function homeScreen() {
  setTimeout(redrawOutdatedArt, 400);
  if (!me.user) return welcomeScreen();
  const root = h('div', { class: 'stack' },
    h('header', { class: 'topbar' }, h('div', { class: 'brand grow' }, logo(), 'MK Cards'),
      h('span', { class: 'pill' }, '@' + me.user.username)));

  if (!me.cards.length) {
    root.append(h('section', { class: 'glass hero' },
      h('h1', {}, 'Make your first card'),
      h('p', {}, `It will be live at ${location.host}/${me.user.username} as soon as you save it.`),
      h('a', { class: 'btn primary', href: '/new' }, icon('plus'), 'Create your card')));
    return root;
  }

  root.append(h('h1', {}, me.cards.length === 1 ? 'Your card' : 'Your cards'));
  for (const entry of me.cards) {
    root.append(h('section', { class: 'stack', style: 'gap:10px' },
      h('a', { href: `/share/${entry.id}`, style: 'text-decoration:none', 'aria-label': `Share ${entry.card.name}` },
        renderCard(entry.card, { compact: true })),
      h('p', { class: 'small muted', style: 'padding:0 6px;overflow-wrap:anywhere' },
        entry.card.label ? `${entry.card.label} · ` : entry.slug === '' && me.cards.length > 1 ? 'Main card · ' : '',
        `${location.host}${cardPath(entry)} · ${entry.views} ${entry.views === 1 ? 'view' : 'views'}`),
      h('div', { class: 'grid-2 tight' },
        h('a', { class: 'btn primary', href: `/share/${entry.id}` }, icon('share'), 'Share'),
        h('a', { class: 'btn', href: `/edit/${entry.id}` }, icon('edit'), 'Edit'),
        h('a', { class: 'btn', href: `/inbox/${entry.id}` }, icon('inbox'), entry.contacts ? `Contacts (${entry.contacts})` : 'Contacts'),
        qrDownloadButton(entry, 'png', 'Download QR')),
      walletButtons(entry)));
  }
  if (me.cards.length < MAX_CARDS) {
    root.append(h('a', { class: 'btn block', href: '/new' }, icon('plus'), 'Add another card'));
  }
  return root;
}

function editorScreen(id) {
  const entry = id ? findCard(id) : null;
  if (id && !entry) return missingScreen('That card is not in your account.');
  if (!entry && me.cards.length >= MAX_CARDS) return missingScreen(`You can have up to ${MAX_CARDS} cards. Delete one to add another.`, 'Card limit reached');
  const isExtra = !entry && me.cards.some((c) => c.slug === '');
  const first = me.cards[0] && me.cards[0].card;

  const card = entry ? JSON.parse(JSON.stringify(entry.card)) : {
    label: '', name: first ? first.name : '', title: '', company: first ? first.company : '', department: '', bio: '', whatsapp: '',
    phones: [{ label: 'mobile', value: '' }],
    emails: [{ label: 'work', value: first ? '' : me.user.email }],
    website: '', address: '', photo: '', accent: first ? first.accent : ACCENTS[0], style: 'aurora', links: [],
  };
  card.phones = card.phones || [];
  card.whatsapp = card.whatsapp || '';
  card.department = card.department || '';
  card.emails = card.emails || [];
  const preview = h('div');
  const refresh = () => preview.replaceChildren(renderCard(card));
  const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });

  const input = (label, key, attrs = {}) =>
    h('label', { class: 'field' }, h('span', {}, label),
      h(attrs.rows ? 'textarea' : 'input', {
        class: 'input', value: card[key], dir: 'auto', ...attrs,
        oninput: (e) => { card[key] = e.target.value; refresh(); },
      }));

  // Photo
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // so choosing the same file again still opens the framing step
      if (!file) return;
      try {
        if (original) URL.revokeObjectURL(original.src);
        original = await loadImage(URL.createObjectURL(file));
        framePhoto();
      } catch (err) { toast(err.message); }
    },
  });
  // The full picture is kept while this screen is open, so the photo can be re-positioned without picking it again.
  let original = null;
  const framePhoto = async () => {
    try {
      const img = original || await loadImage(card.photo);
      photoSheet(img, (dataUrl) => { card.photo = dataUrl; refresh(); drawPhotoRow(); });
    } catch (err) { toast(err.message); }
  };
  const photoRow = h('div', { class: 'row wrap' });
  const drawPhotoRow = () => photoRow.replaceChildren(...[
    fileInput,
    h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, card.photo ? 'Change photo' : 'Add photo'),
    card.photo && h('button', { class: 'btn', type: 'button', onclick: framePhoto }, 'Adjust position'),
    card.photo && h('button', { class: 'btn danger', type: 'button', onclick: () => { card.photo = ''; original = null; refresh(); drawPhotoRow(); } }, 'Remove'),
  ].filter(Boolean));
  drawPhotoRow();

  // Phones and emails: as many as needed, each with its own type.
  const entryList = (list, labels, inputAttrs, addLabel) => {
    const box = h('div', { class: 'stack', style: 'gap:10px' });
    const draw = () => box.replaceChildren(
      ...list.map((item, i) => h('div', { class: 'link-row' },
        h('select', { class: 'input', 'aria-label': 'Type', onchange: (e) => { item.label = e.target.value; refresh(); } },
          Object.entries(labels).map(([value, text]) => h('option', { value, selected: item.label === value }, text))),
        h('input', { class: 'input', value: item.value, ...inputAttrs,
          oninput: (e) => { item.value = e.target.value; refresh(); } }),
        h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Remove',
          onclick: () => { list.splice(i, 1); draw(); refresh(); } }, icon('x')))),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        if (list.length >= MAX_ENTRIES) return toast(`A card can hold up to ${MAX_ENTRIES} of these.`);
        list.push({ label: Object.keys(labels).find((k) => !list.some((x) => x.label === k)) || 'other', value: '' });
        draw();
        box.querySelectorAll('input')[list.length - 1].focus();
      } }, icon('plus'), addLabel));
    draw();
    return box;
  };
  const phoneList = entryList(card.phones, PHONE_LABELS, { type: 'tel', autocomplete: 'tel', maxlength: 40, 'aria-label': 'Phone number', placeholder: 'Phone number' }, 'Add a phone');
  const emailList = entryList(card.emails, EMAIL_LABELS, { type: 'email', autocomplete: 'email', maxlength: 120, 'aria-label': 'Email address', placeholder: 'Email address' }, 'Add an email');

  // Links
  const linkList = h('div', { class: 'stack', style: 'gap:10px' });
  const drawLinks = () => linkList.replaceChildren(...card.links.map((link, i) =>
    h('div', { class: 'link-row' },
      h('select', { class: 'input', 'aria-label': 'Link type', onchange: (e) => { link.type = e.target.value; refresh(); } },
        Object.entries(LINK_TYPES).map(([value, label]) => h('option', { value, selected: link.type === value }, label))),
      h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://', 'aria-label': 'Link address', value: link.url,
        oninput: (e) => { link.url = e.target.value; refresh(); } }),
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Remove link',
        onclick: () => { card.links.splice(i, 1); drawLinks(); refresh(); } }, icon('x')))));
  drawLinks();

  // Appearance
  const swatches = h('div', { class: 'swatches' });
  const colourLabel = h('p', { class: 'muted small' });
  const drawSwatches = () => {
    swatches.replaceChildren(...COLOURS.map(([color, name]) =>
      h('button', { class: 'swatch', type: 'button', style: `background:${color}`, 'aria-label': name, title: name,
        'aria-pressed': String(card.accent === color), onclick: () => { card.accent = color; drawSwatches(); refresh(); } })));
    colourLabel.textContent = `Colour: ${colourName(card.accent)}`;
  };
  drawSwatches();
  const styles = h('div', { class: 'segmented' });
  const drawStyles = () => styles.replaceChildren(...[['aurora', 'Aurora'], ['solid', 'Solid'], ['mono', 'Graphite']].map(([value, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(card.style === value),
      onclick: () => { card.style = value; drawStyles(); refresh(); } }, label)));
  drawStyles();

  const saveBtn = h('button', { class: 'btn primary block', type: 'submit' }, entry ? 'Save changes' : 'Create card');

  async function submit(e) {
    e.preventDefault();
    errorLine.hidden = true;
    saveBtn.disabled = true;
    const payload = {
      ...card,
      phones: card.phones.filter((p) => p.value.trim()),
      emails: card.emails.filter((x) => x.value.trim()),
      links: card.links.filter((l) => l.url.trim()),
    };
    const before = new Set(me.cards.map((c) => c.id));
    let savedId = null;
    try {
      if (entry) {
        const res = await api(`/cards/${entry.id}`, { method: 'PUT', body: { card: payload } });
        entry.card = res.card;
        entry.updatedAt = res.updatedAt;
        savedId = entry.id;
        saveBtn.textContent = 'Saving pictures…';
        await drawAndUpload(entry);
        toast('Card saved');
      } else {
        const res = await api('/cards', { method: 'POST', body: { card: payload } });
        me.cards.push(res);
        savedId = res.id;
        saveBtn.textContent = 'Saving pictures…';
        await drawAndUpload(res);
      }
    } catch (err) {
      // If the reply got lost on the way back, the card may already be saved: check before asking to retry.
      if (!entry && !err.status) {
        try {
          await loadMe();
          const created = me.cards.find((c) => !before.has(c.id));
          if (created) return go(`/share/${created.id}`);
        } catch { /* still offline: fall through to the message */ }
      }
      errorLine.textContent = err.message;
      errorLine.hidden = false;
      errorLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
      saveBtn.disabled = false;
      return;
    }
    go(`/share/${savedId}`);
  }

  refresh();
  // Where this card will live. Extra cards take their link from the card name.
  const addressBox = h('div', { class: 'linkbox' });
  const drawAddress = () => {
    if (entry) addressBox.textContent = location.host + cardPath(entry);
    else if (!isExtra) addressBox.textContent = `${location.host}/${me.user.username}`;
    else {
      const taken = new Set(me.cards.map((c) => c.slug));
      const base = slugify(card.label) || 'card';
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 26)}-${n}`;
      addressBox.textContent = `${location.host}/${me.user.username}/${slug}`;
    }
  };
  drawAddress();
  const addressNote = entry ? null
    : isExtra ? 'This card gets its own link, taken from the card name above. The link cannot be changed later.'
      : 'This is your main card. It goes live when you save.';

  return h('form', { class: 'stack', onsubmit: submit, novalidate: true },
    topbar(entry ? 'Edit card' : 'New card', '/'),
    preview,
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Card name'),
      h('label', { class: 'field' }, h('span', {}, isExtra || (entry && entry.slug) ? 'Name this card' : 'Name this card (optional)'),
        h('input', { class: 'input', value: card.label, maxlength: 40, placeholder: 'Work, Personal, Events…',
          oninput: (e) => { card.label = e.target.value; drawAddress(); } })),
      h('p', { class: 'muted small' }, 'Only you see this name. It helps you tell your cards apart.')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'About you'),
      photoRow,
      input('Full name', 'name', { autocomplete: 'name', required: true, maxlength: 80 }),
      h('div', { class: 'grid-2' },
        input('Job title', 'title', { autocomplete: 'organization-title', maxlength: 80 }),
        input('Company', 'company', { autocomplete: 'organization', maxlength: 80 })),
      input('Department (optional)', 'department', { maxlength: 80, placeholder: 'e.g. Group Procurement' }),
      input('Short bio', 'bio', { rows: 3, maxlength: 400 })),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Phones'), phoneList),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'WhatsApp'),
      input('WhatsApp number', 'whatsapp', { type: 'tel', maxlength: 40, placeholder: '+971 50 123 4567' }),
      h('p', { class: 'muted small' }, 'Include the country code. Your card page gets a "Chat on WhatsApp" button that opens a chat with this number.')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Emails'), emailList),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Website and address'),
      input('Website', 'website', { type: 'url', inputmode: 'url', placeholder: 'https://', maxlength: 300 }),
      input('Address', 'address', { autocomplete: 'street-address', maxlength: 160 })),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Links'),
      linkList,
      h('button', { class: 'btn', type: 'button', onclick: () => {
        if (card.links.length >= 12) return toast('A card can hold up to 12 links.');
        card.links.push({ type: 'linkedin', label: '', url: '' });
        drawLinks();
      } }, icon('plus'), 'Add a link')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Look'), swatches, colourLabel, styles),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Card address'), addressBox,
      addressNote && h('p', { class: 'muted small' }, addressNote)),
    errorLine,
    saveBtn,
    entry && h('button', { class: 'btn danger block', type: 'button', onclick: () => confirmDelete(entry) }, icon('trash'), 'Delete card'));
}

function confirmDelete(entry) {
  sheet((close) => [
    h('h1', {}, 'Delete this card?'),
    h('p', { class: 'muted' }, 'Its link and QR code will stop working, and contacts shared with it are deleted. This cannot be undone.'),
    h('button', { class: 'btn danger block', onclick: async () => {
      try {
        await api(`/cards/${entry.id}`, { method: 'DELETE' });
      } catch (err) {
        if (err.status !== 404) return toast(err.message);
      }
      me.cards = me.cards.filter((c) => c.id !== entry.id);
      close();
      toast('Card deleted');
      go('/');
    } }, 'Delete card'),
    h('button', { class: 'btn block', onclick: close }, 'Keep card'),
  ]);
}

function shareScreen(id) {
  const entry = findCard(id);
  if (!entry) return missingScreen('That card is not in your account.');
  const url = cardUrl(entry);
  const root = h('div', { class: 'stack' },
    topbar('Share', '/'),
    renderCard(entry.card, { compact: true }),
    h('section', { class: 'glass panel stack center' },
      qrBox(url),
      h('p', { class: 'muted small' }, 'Scanning this code opens your card. It always points to the address below, so you can download it as often as you like.'),
      h('div', { class: 'linkbox' }, url),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', onclick: () => shareLink(entry.card, url) }, icon('share'), 'Share link'),
        h('button', { class: 'btn grow', onclick: () => copyText(url) }, icon('copy'), 'Copy')),
      h('div', { class: 'row' },
        qrDownloadButton(entry, 'png', 'QR as PNG', 'btn grow'),
        qrDownloadButton(entry, 'svg', 'QR as SVG', 'btn grow')),
      walletButtons(entry)),
    h('div', { class: 'row' },
      h('a', { class: 'btn grow', href: cardPath(entry) }, 'Preview'),
      h('a', { class: 'btn grow', href: `/edit/${entry.id}` }, icon('edit'), 'Edit')));

  if ('NDEFReader' in window) {
    root.append(h('button', { class: 'btn block', onclick: async () => {
      try {
        const ndef = new window.NDEFReader();
        const waiting = toast('Hold an NFC tag to the back of your phone…');
        await ndef.write({ records: [{ recordType: 'url', data: url }] });
        waiting.remove();
        toast('Tag written. Tap it with any phone to open your card.');
      } catch {
        toast('Could not write the tag. Check that NFC is on and try again.');
      }
    } }, 'Write to an NFC tag'));
  }
  return root;
}

function inboxScreen(id) {
  const entry = findCard(id);
  if (!entry) return missingScreen('That card is not in your account.');
  const list = h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading…'));
  const root = h('div', { class: 'stack' }, topbar('Contacts', '/'),
    h('p', { class: 'muted' }, `People who shared their details with ${entry.card.name}.`), list);

  const load = async () => {
    try {
      const { contacts } = await api(`/cards/${id}/contacts`);
      entry.contacts = contacts.length;
      if (!contacts.length) {
        list.replaceChildren(h('div', { class: 'center', style: 'padding:14px 0' },
          h('p', { style: 'font-weight:650' }, 'No contacts yet'),
          h('p', { class: 'muted small', style: 'margin:6px 0 16px' }, 'When someone opens your card and shares their details, they appear here.'),
          h('a', { class: 'btn primary', href: `/share/${id}` }, icon('share'), 'Share your card')));
        return;
      }
      list.replaceChildren(...contacts.map((c) => h('div', { class: 'item' },
        h('div', { class: 'grow' },
          h('p', { class: 'who' }, c.name, c.company ? ` · ${c.company}` : ''),
          c.email && h('p', { class: 'small' }, h('a', { href: 'mailto:' + c.email }, c.email)),
          c.phone && h('p', { class: 'small' }, h('a', { href: 'tel:' + c.phone.replace(/[^\d+]/g, '') }, c.phone)),
          c.note && h('p', { class: 'small muted', style: 'margin-top:4px' }, c.note),
          h('p', { class: 'small muted', style: 'margin-top:4px' }, new Date(c.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }))),
        h('button', { class: 'btn icon', 'aria-label': `Save ${c.name} to contacts`,
          onclick: () => saveVCard(vcardFromContact(c), `${c.name.replace(/[^\w-]+/g, '-') || 'contact'}.vcf`) }, icon('save')),
        h('button', { class: 'btn icon danger', 'aria-label': `Remove ${c.name}`, onclick: async () => {
          try { await api(`/cards/${id}/contacts/${c.id}`, { method: 'DELETE' }); load(); }
          catch (err) { toast(err.message); }
        } }, icon('trash')))));
    } catch (err) {
      list.replaceChildren(h('div', { class: 'stack center' }, h('p', { class: 'error' }, err.message),
        h('button', { class: 'btn', onclick: load }, 'Try again')));
    }
  };
  load();
  return root;
}

const NOT_USERNAMES = new Set(['terms', 'about', 'help', 'support', 'admin', 'account', 'logout', 'app', 'api']);

function publicScreen(username, slug = '') {
  if (NOT_USERNAMES.has(username)) return missingScreen('That page does not exist.', 'Page not found');
  const mine = me.user && me.user.username === username ? me.cards.find((c) => c.slug === slug) : null;
  const query = `u=${encodeURIComponent(username)}&s=${encodeURIComponent(slug)}`;
  const url = `${location.origin}/${username}${slug ? '/' + slug : ''}`;
  const root = h('div', { class: 'stack' }, h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading card…')));

  api(`/public/card?${query}${mine ? '' : '&view'}`).then(({ card, contactEmail }) => {
    document.title = `${card.name} — MK Cards`;
    // The page takes on the card's colours, like the reference design: a deep backdrop with a soft glow.
    document.body.classList.add('card-page');
    document.body.setAttribute('style', themeVars(card));
    // Paint the whole page, however long, not just the first screen (iPhones ignore fixed backgrounds).
    document.documentElement.style.background = cardTheme(card).page;
    const saveContact = async () => {
      if (!native) { location.href = `/api/public/vcard?${query}`; return; }
      try {
        const res = await fetch(`/api/public/vcard?${query}`);
        native.saveContact(await res.text(), `${username}.vcf`);
      } catch { toast('No connection. Check your internet and try again.'); }
    };
    root.replaceChildren(...[
      mine && topbar('Preview', `/share/${mine.id}`),
      renderCard(card, { actions: { save: saveContact } }),
      h('div', { class: 'vc-pills' },
        h('button', { class: 'vc-pill', onclick: () => shareLink(card, url) }, icon('share'), 'Share'),
        !mine && h('button', { class: 'vc-pill', onclick: () => exchangeSheet(username, slug, card, contactEmail, url) }, icon('mail'), 'Send my details')),
      h('p', { class: 'vc-footer' }, me.user ? 'MK Cards' : h('a', { href: '/' }, 'MK Cards')),
    ].filter(Boolean));
  }).catch((err) => {
    root.replaceChildren(err.status === 404
      ? missingScreen('This card does not exist, or its owner has deleted it.')
      : h('section', { class: 'glass panel stack center' }, h('p', { class: 'error' }, err.message),
          h('button', { class: 'btn', onclick: () => render() }, 'Try again')));
  });
  return root;
}

// The visitor fills in their details; sending opens their own email app with a ready-made message to the
// card owner. A copy is also kept in the owner's Contacts list, in case the email is never sent.
function exchangeSheet(username, slug, card, contactEmail, cardLink) {
  const first = card.name.split(/\s+/)[0];
  sheet((close) => {
    const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
    const send = h('button', { class: 'btn primary block', type: 'submit' }, icon('mail'), 'Open email to send');
    const field = (label, name, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h(attrs.rows ? 'textarea' : 'input', { class: 'input', name, ...attrs }));
    return h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errorLine.hidden = true;
      send.disabled = true;
      try {
        await api('/public/contacts', { method: 'POST', body: { ...data, u: username, s: slug } });
      } catch (err) {
        // A problem with what was typed stops here; a connection problem should not block the email.
        if (err.status) {
          errorLine.textContent = err.message;
          errorLine.hidden = false;
          send.disabled = false;
          return;
        }
      }
      const row = (label, value) => (value.trim() ? `${label}: ${value.trim()}` : null);
      const lines = [
        `Hi ${first},`, '', 'Here are my details:',
        row('Name', data.name), row('Email', data.email), row('Phone', data.phone), row('Company', data.company),
        data.note.trim() ? `\n${data.note.trim()}` : null,
        '', `Sent from your MK Cards page: ${cardLink}`,
      ].filter((line) => line !== null);
      const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(`${data.name.trim()} shared their details with you`)}&body=${encodeURIComponent(lines.join('\n'))}`;
      close();
      toast('Opening your email app. Press send there to finish.');
      location.href = mailto;
    } },
      h('h1', {}, `Share your details with ${first}`),
      h('p', { class: 'muted small' }, `Fill this in and your email app will open with a message to ${first}, ready to send.`),
      field('Your name', 'name', { autocomplete: 'name', required: true, maxlength: 80 }),
      field('Email', 'email', { type: 'email', autocomplete: 'email', maxlength: 120 }),
      field('Phone', 'phone', { type: 'tel', autocomplete: 'tel', maxlength: 40 }),
      field('Company', 'company', { autocomplete: 'organization', maxlength: 80 }),
      field('Note', 'note', { rows: 2, maxlength: 400 }),
      h('input', { name: 'company_website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position:absolute;left:-9999px' }),
      errorLine, send,
      h('button', { class: 'btn block', type: 'button', onclick: close }, 'Cancel'));
  });
}

function settingsScreen() {
  const appVersion = native && native.appVersion ? native.appVersion() : null;
  return h('div', { class: 'stack' },
    topbar('Settings'),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Account'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Username'), h('span', { class: 'pill' }, '@' + me.user.username)),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Email'), h('span', { class: 'muted small', style: 'overflow-wrap:anywhere;text-align:right' }, me.user.email)),
      h('button', { class: 'btn block', onclick: changePasswordSheet }, 'Change password'),
      h('button', { class: 'btn block', onclick: async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch (err) { return toast(err.message); }
        me = { user: null, cards: [] };
        go('/');
      } }, 'Log out')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'App'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Version'),
        h('span', { class: 'pill' }, appVersion ? `${appVersion} · web ${APP_VERSION}` : APP_VERSION)),
      h('button', { class: 'btn block', onclick: checkForUpdate }, 'Check for updates'),
      h('a', { class: 'btn block', href: '/privacy' }, 'Privacy')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Delete account'),
      h('p', { class: 'muted small' }, 'Removes your account, all your cards and the contacts sent to them. Your links and QR codes stop working.'),
      h('button', { class: 'btn danger block', onclick: confirmDeleteAccount }, icon('trash'), 'Delete my account')));
}

function changePasswordSheet() {
  sheet((close) => {
    const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
    const button = h('button', { class: 'btn primary block', type: 'submit' }, 'Change password');
    return h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errorLine.hidden = true;
      try {
        if (data.next !== data.again) throw new Error('The two new passwords do not match.');
        button.disabled = true;
        await api('/me/password', { method: 'POST', body: { current: data.current, next: data.next } });
        close();
        toast('Password changed');
      } catch (err) {
        errorLine.textContent = err.message;
        errorLine.hidden = false;
        button.disabled = false;
      }
    } },
      h('h1', {}, 'Change password'),
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.user.username, hidden: true }),
      h('label', { class: 'field' }, h('span', {}, 'Current password'),
        h('input', { class: 'input', name: 'current', type: 'password', autocomplete: 'current-password', required: true })),
      h('label', { class: 'field' }, h('span', {}, 'New password'),
        h('input', { class: 'input', name: 'next', type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 200, required: true }),
        h('p', { class: 'small muted' }, 'At least 8 characters.')),
      h('label', { class: 'field' }, h('span', {}, 'New password again'),
        h('input', { class: 'input', name: 'again', type: 'password', autocomplete: 'new-password', maxlength: 200, required: true })),
      h('p', { class: 'small muted' }, 'Other devices will be logged out. Keep your password safe: it cannot be reset by email.'),
      errorLine, button,
      h('button', { class: 'btn block', type: 'button', onclick: close }, 'Cancel'));
  });
}

function confirmDeleteAccount() {
  sheet((close) => {
    const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
    const button = h('button', { class: 'btn danger block', type: 'submit' }, 'Delete my account');
    return h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      errorLine.hidden = true;
      button.disabled = true;
      try {
        await api('/me', { method: 'DELETE', body: { password: new FormData(e.target).get('password') } });
        me = { user: null, cards: [] };
        close();
        toast('Your account was deleted');
        go('/');
      } catch (err) {
        errorLine.textContent = err.message;
        errorLine.hidden = false;
        button.disabled = false;
      }
    } },
      h('h1', {}, 'Delete your account?'),
      h('p', { class: 'muted' }, 'Everything is removed for good and cannot be brought back. Enter your password to confirm.'),
      h('label', { class: 'field' }, h('span', {}, 'Password'),
        h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
      errorLine, button,
      h('button', { class: 'btn block', type: 'button', onclick: close }, 'Keep my account'));
  });
}

function missingScreen(message, title = 'Card not found') {
  return h('section', { class: 'glass hero' }, h('h1', {}, title), h('p', {}, message),
    h('a', { class: 'btn primary', href: '/' }, 'Go to MK Cards'));
}

// ---------- router ----------

// [pattern, screen, tab, who]: who is 'user' (must be logged in), 'guest' (logged out only) or null (anyone).
const routes = [
  [/^\/$/, homeScreen, 'home', null],
  [/^\/login$/, loginScreen, null, 'guest'],
  [/^\/register$/, registerScreen, null, 'guest'],
  [/^\/new$/, () => editorScreen(null), 'new', 'user'],
  [/^\/edit\/([a-z0-9]+)$/, editorScreen, 'home', 'user'],
  [/^\/share\/([a-z0-9]+)$/, shareScreen, 'home', 'user'],
  [/^\/inbox\/([a-z0-9]+)$/, inboxScreen, 'home', 'user'],
  [/^\/settings$/, settingsScreen, 'settings', 'user'],
  [/^\/([a-z0-9][a-z0-9_-]{2,29})(?:\/([a-z0-9][a-z0-9-]{0,29}))?$/, publicScreen, null, null],
];

function render() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  document.body.classList.remove('card-page');
  document.body.removeAttribute('style');
  document.documentElement.style.background = '';
  document.title = 'MK Cards';
  let screen = missingScreen('That page does not exist.', 'Page not found');
  let tab = null;
  for (const [pattern, view, tabName, who] of routes) {
    const m = pattern.exec(path);
    if (!m) continue;
    if (who === 'user' && !me.user) { history.replaceState(null, '', '/login'); return render(); }
    if (who === 'guest' && me.user) { history.replaceState(null, '', '/'); return render(); }
    try {
      screen = view(m[1], m[2]);
    } catch (err) {
      // Show what went wrong instead of leaving the previous screen up.
      console.error(err);
      screen = h('section', { class: 'glass hero' }, h('h1', {}, 'This page could not be shown'),
        h('p', {}, `Your data is safe. Please reload and try again. (${err && err.message ? err.message : err})`),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload'));
    }
    tab = tabName;
    break;
  }
  app.replaceChildren(screen);
  // The tab bar is for people who are logged in; visitors get a clean page.
  tabbar.hidden = !me.user;
  tabbar.replaceChildren(...[['home', '/', 'cards', 'Cards'], ['new', '/new', 'plus', 'New'], ['settings', '/settings', 'gear', 'Settings']]
    .map(([name, href, iconName, label]) => h('a', { href, 'aria-current': tab === name ? 'page' : null }, icon(iconName), label)));
  window.scrollTo(0, 0);
}

function go(path) {
  history.pushState(null, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/privacy') return;
  e.preventDefault();
  go(url.pathname);
});
window.addEventListener('popstate', render);

async function boot() {
  app.replaceChildren(h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading…')));
  try {
    await loadMe();
  } catch (err) {
    app.replaceChildren(h('section', { class: 'glass hero' }, h('h1', {}, 'Could not load MK Cards'), h('p', {}, err.message),
      h('button', { class: 'btn primary', onclick: boot }, 'Try again')));
    return;
  }
  render();
}

// ---------- update notifications ----------

let updateToast = null;
function offerUpdate(message, label, run) {
  if (updateToast) updateToast.remove();
  updateToast = toast(message, { label, run });
}

// Web: a new service worker has been downloaded and is waiting to take over.
let registration = null;
function watchServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const offer = (worker) => offerUpdate('A new version of MK Cards is ready.', 'Update', () => worker.postMessage('skip-waiting'));
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  // Reload only when an update replaces a worker; the very first install must not reload the page.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

async function checkForUpdate() {
  if (native && native.checkForUpdate) native.checkForUpdate();
  if (registration) {
    try {
      await registration.update();
      if (registration.installing || registration.waiting) return;
    } catch {
      return toast('Could not check for updates. Check your internet and try again.');
    }
  }
  if (!native) toast('MK Cards is up to date.');
}

// Android app: Google Play reports that a newer release is available or downloaded.
window.MKCards = {
  nativeUpdate(state) {
    if (state === 'available') offerUpdate('An update for MK Cards is available.', 'Update', () => native.startUpdate());
    else if (state === 'downloaded') offerUpdate('The update is downloaded.', 'Restart', () => native.completeUpdate());
    else if (state === 'current') toast('MK Cards is up to date.');
    else if (state === 'unknown') toast('Could not check for updates right now.');
  },
};

boot();
watchServiceWorker();
if (native && native.ready) native.ready();
