// MK Cards — single-page app. No build step: plain ES modules.
import { ART_VERSION, cardTheme, drawCallBackground, drawCardArt, hexRgb, mixHex } from './card-art.js';

export const APP_VERSION = '2.7.1'; // keep in step with VERSION in sw.js

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const toasts = document.getElementById('toasts');
const native = window.MKNative || null; // provided by the Android and iPhone apps
// The iPhone app has its own tab bar, so the page's top navigation is hidden there.
const inAppTabs = Boolean(native && native.hasTabBar);

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
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  more: '<circle cx="5" cy="12" r="1.600"/><circle cx="12" cy="12" r="1.600"/><circle cx="19" cy="12" r="1.600"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20a6.500 6.500 0 0 1 13 0M16 4.500a3.500 3.500 0 0 1 0 7M18 14.500a6.500 6.500 0 0 1 3.500 5.500"/>',
  upload: '<path d="M12 16V4M8 8l4-4 4 4M5 20h14"/>',
  power: '<path d="M12 3v9M6.300 6.300a8 8 0 1 0 11.400 0"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chat: '<path d="M20 11.500a8 8 0 0 1-11.800 7L4 20l1.500-4.200A8 8 0 1 1 20 11.500z"/><path d="M9 10.500h6M9 13.500h4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M19 17v3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  signature: '<path d="M3 17c3-1 4-9 7-9 2 0-1 8 1 8 1.5 0 2.5-3 4-3 1 0 .5 2 1.5 2H21M3 21h18"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.5A3.75 3.75 0 0 1 17.25 18H7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
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
      if (native && native.signedOut) native.signedOut();
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
const MAX_ENTRIES = 10; // phones or emails per card
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

// The words on a card, in English and Arabic.
const CARD_WORDS = {
  en: {
    save: 'Save contact', whatsapp: 'WhatsApp', email: 'Email', call: 'Call', mobile: 'Mobile', office: 'Office',
    home: 'Home', phone: 'Phone', work: 'Work', personal: 'Personal', website: 'Website', address: 'Address',
    share: 'Share', qr: 'QR code', send: 'Send my details', scan: 'Scan to save contact',
    scanNote: 'Point a phone camera at the code. It offers to add this contact straight away.', close: 'Close',
    other: 'العربية', hereIs: 'Here is my card',
  },
  ar: {
    save: 'حفظ جهة الاتصال', whatsapp: 'واتساب', email: 'البريد', call: 'اتصال', mobile: 'الجوال', office: 'المكتب',
    home: 'المنزل', phone: 'الهاتف', work: 'العمل', personal: 'شخصي', website: 'الموقع الإلكتروني', address: 'العنوان',
    share: 'مشاركة', qr: 'رمز QR', send: 'أرسل بياناتي', scan: 'امسح لحفظ جهة الاتصال',
    scanNote: 'وجّه كاميرا الهاتف إلى الرمز لإضافة جهة الاتصال مباشرةً.', close: 'إغلاق',
    other: 'English', hereIs: 'هذه بطاقتي',
  },
};
const hasArabic = (card) => Boolean(card.ar && card.ar.name);
/** The card in a language: the Arabic words where the owner wrote them, the main ones otherwise. */
const inLanguage = (card, lang) => (lang === 'ar' && hasArabic(card) ? { ...card, ...card.ar } : card);

const phoneLabel = (p, w = CARD_WORDS.en) => ({ mobile: w.mobile, work: w.office, home: w.home })[p.label] || w.phone;
const emailLabel = (e, w = CARD_WORDS.en) => ({ work: w.work, personal: w.personal })[e.label] || w.email;
const telHref = (v) => 'tel:' + v.replace(/[^\d+]/g, '');
const waHref = (v, message) => 'https://wa.me/' + v.replace(/\D/g, '') + (message ? '?text=' + encodeURIComponent(message) : '');

/** A compact vCard for the page's QR code: scanning it with any phone camera offers "Add contact". */
function qrVCard(card, link) {
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const parts = (card.name || '').trim().split(/\s+/);
  const family = parts.length > 1 ? parts.pop() : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(parts.join(' '))};;;`, `FN:${esc(card.name)}`];
  if (card.company || card.department) lines.push(`ORG:${esc(card.company)}${card.department ? ';' + esc(card.department) : ''}`);
  if (card.title) lines.push(`TITLE:${esc(card.title)}`);
  const tel = { mobile: 'CELL', work: 'WORK', home: 'HOME' };
  for (const p of (card.phones || []).filter((x) => x.value).slice(0, 3)) lines.push(`TEL;TYPE=${tel[p.label] || 'VOICE'}:${esc(p.value)}`);
  for (const e of (card.emails || []).filter((x) => x.value).slice(0, 3)) lines.push(`EMAIL:${esc(e.value)}`);
  lines.push(`URL:${esc(link)}`, 'END:VCARD');
  return lines.join('\r\n');
}

function avatarOf(card, cls) {
  return card.photo
    ? h('img', { class: cls, src: card.photo, alt: '' })
    : h('div', { class: cls, 'aria-hidden': 'true' }, h('span', {}, initials(card.name)));
}

/**
 * Draws a card. `actions.save` is called by the "Save contact" button on the public page; without it (in the
 * editor preview) the quick buttons are shown for looks only. `lang` 'ar' shows the Arabic version, right to left.
 */
function renderCard(source, { compact = false, actions = null, lang = 'en' } = {}) {
  const card = inLanguage(source, lang);
  const w = CARD_WORDS[lang] || CARD_WORDS.en;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
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
  const wa = card.whatsapp && waHref(card.whatsapp, card.whatsappMessage);
  const quick = [
    tile('save', w.save, null, { primary: true, onclick: live ? actions.save : null }),
    wa && tile('whatsapp', w.whatsapp, wa),
    emails[0] && tile('mail', w.email, 'mailto:' + emails[0].value),
    phones[0] && tile('phone', w.call, telHref(phones[0].value)),
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
    phones.map((p) => row('phone', phoneLabel(p, w), p.value, telHref(p.value))),
    wa ? [row('whatsapp', w.whatsapp, card.whatsapp, wa)] : [],
    emails.map((e) => row('mail', emailLabel(e, w), e.value, 'mailto:' + e.value)),
    [card.website && row('globe', w.website, prettyUrl(card.website), card.website),
      ...(card.links || []).filter((l) => l.url).map((l) => row('link', l.label || LINK_TYPES[l.type] || 'Link', prettyUrl(l.url), l.url))].filter(Boolean),
    card.address ? [row('pin', w.address, card.address, 'https://maps.google.com/?q=' + encodeURIComponent(card.address))] : [],
  ].filter((g) => g.length);

  const wrap = h('div', { class: `vc ${card.style || 'aurora'}`, style: themeVars(card), dir, lang }, hero);
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

async function shareLink(card, url, intro = 'Here is my card') {
  const title = `${card.name} — MK Cards`;
  if (native) return native.share(title, `${intro}: ${card.name}`, url);
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
  // UTF-8 so Arabic and other scripts scan correctly.
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const qr = window.qrcode(0, 'M');
  qr.addData(value, 'Byte');
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
  const inIPhoneApp = Boolean(native) && !isAndroid;
  // Each app offers its own phone's wallet only: Apple Wallet in the iPhone app, Google Wallet in the Android app.
  const apple = ready.apple && !inAndroidApp && walletButton(`/api/cards/${entry.id}/wallet/apple.pkpass`, 'Apple Wallet', 'apple');
  const google = ready.google && !inIPhoneApp && walletButton(`/api/cards/${entry.id}/wallet/google`, 'Google Wallet', 'google');
  const list = (isApple ? [apple, google] : [google, apple]).filter(Boolean);
  if (!list.length) return null;
  return h('div', { class: 'wallet-row' }, ...list);
}

function walletButton(href, name, kind) {
  // Google Wallet: Google's own "Add to Google Wallet" button, unchanged, as its brand rules require.
  if (kind === 'google') {
    return h('a', { class: 'gwallet-btn', href, rel: 'noopener' },
      h('img', { src: '/wallet/google-wallet-button.svg', alt: 'Add to Google Wallet', width: 280, height: 48 }));
  }
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

async function logoPng(file, size = 300) {
  const img = await loadImage(URL.createObjectURL(file));
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * scale, hgt = img.naturalHeight * scale;
  canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/png');
}

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

// The public landing page: one offer (a free digital business card), one primary action (create it).
function welcomeScreen() {
  const cta = (label = 'Create your free card') => h('a', { class: 'btn primary lp-cta', href: '/register' }, label);
  const sample = {
    name: 'Layla Haddad', title: 'Head of Partnerships', company: 'Northwind Trading',
    phones: [{ label: 'mobile', value: '+971 50 123 4567' }], emails: [{ label: 'work', value: 'layla@northwind.ae' }],
    website: 'https://northwind.ae', accent: '#2a5ba8', style: 'aurora',
  };
  const samplePass = {
    kind: 'event', org: 'Trade Forum', title: 'Conference badge', header: { label: 'Pass', value: 'All access' },
    primary: { label: 'Attendee', value: 'Layla Haddad' }, front: [{ label: 'Company', value: 'Northwind' }, { label: 'Hall', value: '4' }],
    barcode: { format: 'none' }, colors: { bg: '#0d3b66', fg: '#ffffff', label: '#f4d35e' },
  };
  const tagline = 'Paper cards end up in a drawer. Yours stays one tap away, and it is always up to date.';

  const feature = (id, title, text, points, visual) => h('section', { class: 'lp-feature reveal', id },
    h('div', { class: 'lp-feature-copy' },
      h('h3', {}, title), h('p', { class: 'lp-body' }, text),
      h('ul', { class: 'lp-points' }, ...points.map((p) => h('li', {}, icon('check'), h('span', {}, p))))),
    h('div', { class: 'lp-feature-visual' }, visual));

  const contactsMock = h('div', { class: 'lp-mock-list' },
    ...[['Omar Saleh', 'Procurement lead, Gulf Logistics', 'Scanned card'], ['Nadia Rahman', 'Founder, Cedar Analytics', 'Event badge'], ['Karim Aoun', 'CFO, Levant Freight', 'Shared on your card']]
      .map(([n, r, s]) => h('div', { class: 'lp-mock-row' }, h('span', { class: 'lp-mock-avatar' }, initials(n)),
        h('span', { class: 'grow' }, h('strong', {}, n), h('small', {}, r)), h('span', { class: 'lp-mock-tag' }, s))));

  const steps = [
    ['Make your card', 'Add your name, role, phone numbers and links. Choose colours and add your photo or logo, in English and Arabic.'],
    ['Share it your way', 'Show your QR code, send the link, tap an NFC tag, or add it to Apple Wallet or Google Wallet.'],
    ['Keep every contact', 'People save your details in one tap. Scan the cards you receive so nobody gets lost.'],
  ];
  const faq = [
    ['Is MK Cards free?', 'Yes. Creating an account and your cards is free, and the people you share with never pay or sign up.'],
    ['Do people need the app to see my card?', 'No. Your card opens in any phone browser, and they save your contact in one tap.'],
    ['Can I have more than one card?', 'Yes. Make a card for each audience, such as work, clients or events, each with its own link and QR code.'],
    ['Does it work in Arabic?', 'Yes. Every card can have English and Arabic versions, and visitors switch between them.'],
    ['Can I add my card to my phone wallet?', 'Yes. Add it to Apple Wallet on iPhone or Google Wallet on Android, so it is ready without opening anything.'],
    ['What are passes?', 'Your own copies of IDs, travel passes, tickets and memberships, made from 23 templates and kept on your phone. They are for convenience, not official documents.'],
    ['Can my company manage everyone’s cards?', 'Yes. Import your team from a spreadsheet, sign in with Microsoft or Google, and design one printed card for the whole company.'],
    ['Can I delete my account?', 'Yes, at any time from your account page. Your cards and data are removed.'],
  ];

  const words = tagline.split(' ').map((w) => h('span', { class: 'lp-word' }, w + ' '));
  const page = h('div', { class: 'lp' },
    h('a', { class: 'skip', href: '#lp-main' }, 'Skip to content'),
    h('header', { class: 'lp-nav' },
      h('a', { class: 'brand', href: '/' }, logo(), h('span', {}, 'MK Cards')),
      h('nav', { class: 'lp-nav-links', 'aria-label': 'Sections' },
        h('a', { href: '#features' }, 'Features'), h('a', { href: '#how' }, 'How it works'), h('a', { href: '#faq' }, 'Questions')),
      h('div', { class: 'lp-nav-actions' },
        h('a', { class: 'lp-link', href: '/login' }, 'Log in'),
        h('a', { class: 'btn primary small', href: '/register' }, 'Get started'))),
    h('main', { id: 'lp-main' },
      h('section', { class: 'lp-hero' },
        h('div', { class: 'lp-hero-copy' },
          h('h1', { class: 'lp-title' }, 'Your business card ', h('br'), 'always in your pocket'),
          h('p', { class: 'lp-sub' }, 'Make a digital business card in minutes and share it with a QR code, a link, NFC or your phone’s wallet. The people you meet save your details in one tap, with no app to install.'),
          h('div', { class: 'lp-actions' }, cta(), h('a', { class: 'lp-link', href: '/login' }, 'I already have an account')),
          h('p', { class: 'lp-proof' }, icon('check'), 'Free to start. Works on iPhone, Android and the web.')),
        h('div', { class: 'lp-hero-visual', 'aria-label': 'Example card', role: 'img' },
          h('div', { class: 'lp-hero-card' }, renderCard(sample)),
          h('div', { class: 'lp-hero-pass' }, renderPass(samplePass)))),
      h('section', { class: 'lp-tagline', 'aria-label': tagline }, h('p', { 'aria-hidden': 'true' }, ...words)),
      h('div', { id: 'features', class: 'lp-features' },
        feature('share', 'Share it however the moment needs',
          'Every card has its own link and QR code that work without internet on your side.',
          ['Full screen QR code for meetings and stands', 'Add it to Apple Wallet or Google Wallet', 'Write it to NFC stickers, or tap phones on Android'],
          h('div', { class: 'lp-qr' }, qrBox('https://mkcards.pages.dev/layla'), h('small', {}, 'mkcards.pages.dev/layla'))),
        feature('scan', 'Never lose a contact again',
          'Photograph the paper cards and event badges you receive and the details are read for you.',
          ['Visitors can send you their details from your card', 'Export to a spreadsheet or send leads to Salesforce', 'Works offline and uploads later'],
          contactsMock),
        feature('passes', 'All your passes in one place',
          'Keep your own copies of IDs, travel passes, tickets and memberships next to your card.',
          ['23 templates, or design your own', 'Copy the barcode from your real card with the camera', 'Add them to your phone’s wallet'],
          h('div', { class: 'lp-pass-stack' },
            renderPass({ ...samplePass, kind: 'transit', transit: 'train', org: 'Example Rail', title: 'Train ticket', header: { label: 'Date', value: '24 Nov' }, primary: { label: 'Paris', value: 'PAR' }, to: { label: 'Lyon', value: 'LYS' }, front: [{ label: 'Coach', value: '12' }, { label: 'Seat', value: '45' }], colors: { bg: '#7a1f2b', fg: '#ffffff', label: '#f6c6cc' } }),
            renderPass({ ...samplePass, kind: 'store', org: 'Northside Fitness', title: 'Gym membership', header: { label: 'Plan', value: 'Premium' }, primary: { label: 'Member', value: 'Layla Haddad' }, front: [{ label: 'Member no.', value: 'G-88412' }], colors: { bg: '#0b6e4f', fg: '#ffffff', label: '#ffe08a' } }))),
        feature('teams', 'Matching cards for your whole team',
          'Give everyone a card in your company’s style and keep it accurate when people join or leave.',
          ['Import your team from a spreadsheet', 'Sign in with Microsoft 365 or Google Workspace', 'Design one printed card and download everyone’s'],
          h('div', { class: 'lp-team' }, ...['Layla Haddad', 'Omar Saleh', 'Nadia Rahman'].map((n, i) => h('div', { class: 'lp-team-row', style: `--d:${i}` },
            h('span', { class: 'lp-mock-avatar' }, initials(n)), h('strong', { class: 'grow' }, n), h('span', { class: 'lp-mock-tag' }, i === 2 ? 'Invited' : 'Active')))))),
      h('section', { id: 'how', class: 'lp-how reveal' },
        h('h2', { class: 'lp-h2' }, 'Ready in three steps'),
        h('ol', { class: 'lp-steps' }, ...steps.map(([t, d], i) => h('li', {}, h('span', { class: 'lp-step-n' }, String(i + 1).padStart(2, '0')), h('h3', {}, t), h('p', { class: 'lp-body' }, d))))),
      h('section', { id: 'faq', class: 'lp-faq reveal' },
        h('h2', { class: 'lp-h2' }, 'Questions people ask'),
        h('dl', { class: 'lp-faq-list' }, ...faq.map(([q, a]) => h('div', {}, h('dt', {}, q), h('dd', {}, a))))),
      h('section', { class: 'lp-final reveal' },
        h('h2', { class: 'lp-h2' }, 'Make your card in the next five minutes'),
        h('p', { class: 'lp-sub' }, 'Free to start. Nothing to install for the people you meet.'),
        cta(),
        h('div', { class: 'lp-get', 'aria-label': 'Get the app' },
          h('a', { class: 'btn', href: `${APP_REL}/MK-Cards-${APP_VER}-android.apk` }, icon('download'), 'Android app (APK)'),
          h('a', { class: 'btn', href: `${APP_REL}/MK-Cards-${APP_VER}-iphone.ipa` }, icon('download'), 'iPhone app (IPA)')),
        h('p', { class: 'small lp-get-note' }, 'The iPhone app installs with Sideloadly or AltStore and a free Apple account.'))),
    h('aside', { class: 'lp-more', 'aria-label': 'More apps by MK' },
      h('a', { href: 'https://www.koussa.net/' },
        h('span', {}, h('strong', {}, 'More free apps by MK'),
          h('span', {}, 'Mushaf, Islamic Azkar, MK PDF, MK Prod, MK Timetables and more, for iPhone, Mac, Windows, Android, TV and the web.')),
        h('span', { class: 'go' }, 'Visit www.koussa.net →'))),
    h('footer', { class: 'lp-footer' },
      h('span', { class: 'brand' }, logo(), h('span', {}, 'MK Cards')),
      h('nav', { 'aria-label': 'Legal' }, h('a', { href: '/privacy' }, 'Privacy'), h('a', { href: '/support' }, 'Support'), h('a', { href: '/delete-account' }, 'Delete account')),
      h('small', {}, '© 2026 MK Cards')));

  // Sections rise into place once; the tagline lights up word by word as it crosses the middle of the screen.
  requestAnimationFrame(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    }), { threshold: 0.15 });
    page.querySelectorAll('.reveal').forEach((el) => (still ? el.classList.add('in') : reveal.observe(el)));
    const lit = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('on'); lit.unobserve(e.target); }
    }), { rootMargin: '0px 0px -45% 0px' });
    words.forEach((w) => (still ? w.classList.add('on') : lit.observe(w)));
  });
  return page;
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
    footer: [ssoButtons('Sign up'), h('p', { class: 'center muted' }, 'Already have an account? ', h('a', { href: '/login' }, 'Log in'))],
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
    footer: [ssoButtons('Continue'), h('p', { class: 'center muted' }, 'New here? ', h('a', { href: '/register' }, 'Create an account'))],
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
  const head = h('header', { class: 'page-head' },
    h('div', { class: 'grow' },
      h('p', { class: 'eyebrow' }, 'Dashboard'),
      h('h1', {}, 'My cards'),
      h('p', { class: 'muted' }, 'Make a card for each audience and share its link or QR code. Your links: ',
        h('strong', {}, `${location.host}/${me.user.username}/…`))),
    h('div', { class: 'head-actions' },
      h('a', { class: 'btn', href: '/scan' }, icon('scan'), 'Scan a card'),
      h('a', { class: 'btn', href: '/api/me/activity.csv', download: 'mkcards-activity.csv' }, icon('download'), 'Activity CSV'),
      me.cards.length < MAX_CARDS && h('a', { class: 'btn primary', href: '/new' }, icon('plus'), 'New card')));

  const grid = h('div', { class: 'tiles' }, ...me.cards.map(cardTile));
  if (me.cards.length < MAX_CARDS) {
    grid.append(h('a', { class: 'tile tile-new', href: '/new' },
      h('span', { class: 'tile-plus' }, icon('plus')),
      h('strong', {}, me.cards.length ? 'New card' : 'Create your first card'),
      h('span', { class: 'muted small' }, 'e.g. Work, Suppliers, Clients, Events')));
  }
  return h('div', { class: 'stack wide-stack' }, head, grid);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// One card on the dashboard: the card's own colours on top, its address, numbers and actions below.
function cardTile(entry) {
  const card = entry.card;
  const role = [card.title, card.company].filter(Boolean).join(' · ');
  const badge = card.label || (entry.slug === '' && me.cards.length > 1 ? 'Main' : '');
  return h('article', { class: `tile${entry.active ? '' : ' off'}` },
    h('a', { class: `tile-head ${card.style || 'aurora'}`, href: `/share/${entry.id}`, style: themeVars(card), 'aria-label': `Share ${card.name}` },
      avatarOf(card, 'vc-avatar small'),
      h('span', { class: 'grow' }, h('span', { class: 'tile-name', dir: 'auto' }, card.name), role && h('span', { class: 'tile-role', dir: 'auto' }, role)),
      h('span', { class: 'tile-badges' }, badge && h('span', { class: 'badge' }, badge), !entry.active && h('span', { class: 'badge off' }, 'Off'))),
    h('div', { class: 'tile-body' },
      h('a', { class: 'tile-link', href: cardPath(entry), target: '_blank', rel: 'noopener' }, icon('external'), h('span', {}, `${location.host}${cardPath(entry)}`)),
      h('p', { class: 'tile-stats' },
        h('span', {}, h('strong', {}, entry.views), entry.views === 1 ? ' view' : ' views'),
        h('span', {}, h('strong', {}, entry.saves || 0), (entry.saves || 0) === 1 ? ' contact save' : ' contact saves'),
        h('span', { class: 'muted' }, `Updated ${shortDate(entry.updatedAt)}`)),
      h('div', { class: 'tile-actions' },
        h('a', { class: 'btn small primary', href: `/edit/${entry.id}` }, icon('edit'), 'Edit'),
        h('button', { class: 'btn small icon-only', 'aria-label': 'Copy link', title: 'Copy link', onclick: () => copyText(cardUrl(entry)) }, icon('copy')),
        h('a', { class: 'btn small icon-only', href: `/share/${entry.id}`, 'aria-label': 'QR code', title: 'QR code' }, icon('qr')),
        h('button', { class: 'btn small icon-only', 'aria-label': 'Statistics', title: 'Statistics', onclick: () => statsSheet(entry) }, icon('chart')),
        h('button', { class: 'btn small icon-only', 'aria-label': 'More', title: 'More', onclick: () => cardMenu(entry) }, icon('more')))));
}

function cardMenu(entry) {
  sheet((close) => [
    h('h1', { dir: 'auto' }, entry.card.label || entry.card.name),
    h('a', { class: 'btn block', href: `/share/${entry.id}`, onclick: close }, icon('share'), 'Share page and QR codes'),
    h('a', { class: 'btn block', href: `/inbox/${entry.id}`, onclick: close }, icon('inbox'), entry.contacts ? `Contacts sent to you (${entry.contacts})` : 'Contacts sent to you'),
    h('div', { class: 'row' },
      h('a', { class: 'btn grow', href: `/signature/${entry.id}`, onclick: close }, icon('signature'), 'Email signature'),
      h('a', { class: 'btn grow', href: `/background/${entry.id}`, onclick: close }, icon('monitor'), 'Call background')),
    h('div', { class: 'row' }, qrDownloadButton(entry, 'png', 'QR as PNG', 'btn grow'), qrDownloadButton(entry, 'svg', 'QR as SVG', 'btn grow')),
    walletButtons(entry),
    me.user.org && h('button', { class: 'btn block', onclick: () => { close(); myPrintCard(entry); } }, icon('download'), 'Print card (SVG)'),
    h('button', { class: 'btn block', onclick: () => { close(); cardStatusSheet(entry); } }, icon('power'), entry.active ? 'Turn this card off' : 'Turn this card back on'),
    h('button', { class: 'btn block', onclick: close }, 'Close'),
  ].filter(Boolean));
}

// Switching a card off keeps its address working but shows a short notice instead of the details.
function cardStatusSheet(entry, after) {
  sheet((close) => {
    const message = h('textarea', { class: 'input', rows: 3, maxlength: 400, placeholder: 'e.g. I have moved to a new role. Please contact the company for help.' }, entry.inactiveMessage || '');
    const turnOn = !entry.active;
    return [
      h('h1', {}, turnOn ? 'Turn this card back on?' : 'Turn this card off?'),
      h('p', { class: 'muted' }, turnOn ? 'Visitors will see the card and can save the contact again.'
        : 'Visitors will see a short notice instead of the details, and can no longer save the contact. You can turn it back on at any time.'),
      !turnOn && h('label', { class: 'field' }, h('span', {}, 'Message for visitors (optional)'), message),
      h('button', { class: `btn block ${turnOn ? 'primary' : 'danger'}`, onclick: async () => {
        try {
          await api(`/cards/${entry.id}/status`, { method: 'POST', body: { active: turnOn, message: turnOn ? entry.inactiveMessage : message.value } });
          entry.active = turnOn;
          if (!turnOn) entry.inactiveMessage = message.value;
          close();
          toast(turnOn ? 'Card turned on' : 'Card turned off');
          if (after) after(); else render();
        } catch (err) { toast(err.message); }
      } }, turnOn ? 'Turn on' : 'Turn off'),
      h('button', { class: 'btn block', onclick: close }, 'Cancel'),
    ].filter(Boolean);
  });
}

const STAT_LABELS = [['view', 'Views'], ['save', 'Contact saves'], ['whatsapp', 'WhatsApp'], ['call', 'Calls'], ['email', 'Emails'], ['qr', 'QR opens'], ['share', 'Shares'], ['web', 'Website visits']];

function statsSheet(entry) {
  sheet((close) => {
    const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
    api(`/cards/${entry.id}/stats`).then(({ total, series }) => {
      const max = Math.max(1, ...series.map((d) => d.view));
      const W = 300, H = 120, bw = W / series.length;
      const bars = series.map((d, i) => {
        const vh = (d.view / max) * (H - 14), sh = (d.save / max) * (H - 14);
        return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - vh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${vh.toFixed(1)}" rx="1.5" class="bar-view"><title>${d.day}: ${d.view} views</title></rect>`
          + (d.save ? `<rect x="${(i * bw + bw * 0.25).toFixed(1)}" y="${(H - sh).toFixed(1)}" width="${(bw * 0.5).toFixed(1)}" height="${sh.toFixed(1)}" rx="1.5" class="bar-save"><title>${d.day}: ${d.save} saves</title></rect>` : '');
      }).join('');
      const chart = h('div', { class: 'chart' });
      chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Views and contact saves over the last 30 days">${bars}</svg>`;
      body.replaceChildren(
        h('div', { class: 'stat-grid' }, ...STAT_LABELS.map(([k, label]) => h('div', { class: 'stat' }, h('strong', {}, total[k] || 0), h('span', {}, label)))),
        h('h2', {}, 'Last 30 days'),
        chart,
        h('p', { class: 'legend small muted' }, h('span', { class: 'dot view' }), 'Views ', h('span', { class: 'dot save' }), 'Contact saves'),
        h('p', { class: 'small muted' }, 'Contact saves count "Save contact" taps on the card page. Scans of the printed or wallet QR code add the contact without visiting the page, so they cannot be counted.'));
    }).catch((err) => body.replaceChildren(h('p', { class: 'error' }, err.message)));
    return [h('p', { class: 'eyebrow' }, 'Statistics'), h('h1', { dir: 'auto' }, entry.card.label || entry.card.name), body, h('button', { class: 'btn block', onclick: close }, 'Close')];
  });
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
  card.logo = card.logo || '';
  card.whatsappMessage = card.whatsappMessage || '';
  card.ar = { ...(card.ar || {}) };
  let previewLang = 'en';
  card.emails = card.emails || [];
  const preview = h('div');
  // The preview can show either language once an Arabic name is written.
  const langSwitch = h('div', { class: 'segmented preview-lang' });
  const drawLangSwitch = () => {
    langSwitch.hidden = !card.ar.name;
    if (!card.ar.name) previewLang = 'en';
    langSwitch.replaceChildren(...[['en', 'English'], ['ar', 'العربية']].map(([value, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(previewLang === value), onclick: () => { previewLang = value; drawLangSwitch(); refresh(); } }, label)));
  };
  const refresh = () => preview.replaceChildren(renderCard(card, { lang: previewLang }));
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
  // Company logo for the wallet passes: any picture is fitted into a 300 × 300 PNG.
  const logoInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { card.logo = await logoPng(file); drawLogoRow(); } catch (err) { toast(err.message); }
  } });
  const logoRow = h('div', { class: 'row wrap' });
  const drawLogoRow = () => logoRow.replaceChildren(...[
    logoInput,
    card.logo && h('img', { class: 'logo-preview', src: card.logo, alt: 'Logo' }),
    h('button', { class: 'btn small', type: 'button', onclick: () => logoInput.click() }, card.logo ? 'Change logo' : 'Add company logo'),
    card.logo && h('button', { class: 'btn small danger', type: 'button', onclick: () => { card.logo = ''; drawLogoRow(); } }, 'Remove'),
  ].filter(Boolean));
  drawLogoRow();
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

  drawLangSwitch();
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
    langSwitch,
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
      h('div', { class: 'field' }, h('span', {}, 'Company logo (optional, shown on wallet passes)'), logoRow),
      input('Short bio', 'bio', { rows: 3, maxlength: 400 })),
    h('section', { class: 'glass panel stack', dir: 'ltr' }, h('h2', {}, 'Arabic version (optional)'),
      h('p', { class: 'muted small' }, 'Fill these in Arabic and your card page gets an العربية switch. Visitors whose phone is set to Arabic see the Arabic version first. Phone numbers, emails and links are shared by both versions.'),
      ...[['name', 'الاسم الكامل', 80], ['title', 'المسمى الوظيفي', 80], ['company', 'الشركة', 80], ['department', 'القسم', 80], ['bio', 'نبذة', 400], ['address', 'العنوان', 160]]
        .map(([key, label, max]) => h('label', { class: 'field', dir: 'rtl' }, h('span', {}, label),
          h(key === 'bio' ? 'textarea' : 'input', { class: 'input', dir: 'rtl', lang: 'ar', maxlength: max, value: card.ar[key] || '', rows: key === 'bio' ? 3 : null,
            oninput: (e) => { card.ar[key] = e.target.value; if (key === 'name') drawLangSwitch(); refresh(); } })))),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Phones'), phoneList),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'WhatsApp'),
      input('WhatsApp number', 'whatsapp', { type: 'tel', maxlength: 40, placeholder: '+971 50 123 4567' }),
      input('Ready-made message (optional)', 'whatsappMessage', { rows: 2, maxlength: 300, placeholder: 'Hello, I got your details from your MK Cards page.' }),
      h('p', { class: 'muted small' }, 'Include the country code. Your card gets a WhatsApp button that opens a chat with this number; the message above is already typed in, ready to send.')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Emails'),
      h('p', { class: 'muted small' }, `Add as many as you need (up to ${MAX_ENTRIES}), each marked Work, Personal or Other.`), emailList),
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
      h('a', { class: 'btn grow', href: `/signature/${entry.id}` }, icon('signature'), 'Email signature'),
      h('a', { class: 'btn grow', href: `/background/${entry.id}` }, icon('monitor'), 'Call background')),
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

  // Count taps on the card's buttons (the owner's own visits are not counted by the server).
  const track = (kind) => {
    if (mine) return;
    const body = JSON.stringify({ u: username, s: slug, kind });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/public/event', new Blob([body], { type: 'application/json' }))) return; } catch { /* fall back */ }
    fetch('/api/public/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  root.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || !root.contains(a) || !a.closest('.vc')) return;
    const href = a.getAttribute('href');
    const kind = href.startsWith('tel:') ? 'call' : href.startsWith('mailto:') ? 'email' : href.includes('wa.me/') ? 'whatsapp' : /^https?:/.test(href) ? 'web' : null;
    if (kind) track(kind);
  });

  api(`/public/card?${query}${mine ? '' : '&view'}`).then((data) => {
    if (data.inactive) { root.replaceChildren(inactiveCardScreen(data)); return; }
    const { card, contactEmail, reportEmail } = data;
    document.title = `${card.name} — MK Cards`;
    // The page takes on the card's colours, like the reference design: a deep backdrop with a soft glow.
    document.body.classList.add('card-page');
    document.body.setAttribute('style', themeVars(card));
    // Paint the whole page, however long, not just the first screen (iPhones ignore fixed backgrounds).
    document.documentElement.style.background = cardTheme(card).page;
    // Language: the visitor's choice, else Arabic for Arabic-speaking phones when the card has an Arabic version.
    const saved = (() => { try { return localStorage.getItem('mk_card_lang'); } catch { return null; } })();
    const asked = new URLSearchParams(location.search).get('lang');
    let lang = hasArabic(card) && (asked || saved || (navigator.language || '').slice(0, 2)) === 'ar' ? 'ar' : 'en';

    const draw = () => {
      const w = CARD_WORDS[lang];
      const shown = inLanguage(card, lang);
      document.title = `${shown.name} — MK Cards`;
      const vcardQuery = `${query}${lang === 'ar' ? '&lang=ar' : ''}`;
      const saveContact = async () => {
        if (!native) { location.href = `/api/public/vcard?${vcardQuery}`; return; }
        try {
          const res = await fetch(`/api/public/vcard?${vcardQuery}`);
          native.saveContact(await res.text(), `${username}.vcf`);
        } catch { toast('No connection. Check your internet and try again.'); }
      };
      root.replaceChildren(...[
        mine && topbar('Preview', `/share/${mine.id}`),
        hasArabic(card) && h('div', { class: 'vc-lang' }, h('button', { class: 'vc-pill small', lang: lang === 'ar' ? 'en' : 'ar', onclick: () => {
          lang = lang === 'ar' ? 'en' : 'ar';
          try { localStorage.setItem('mk_card_lang', lang); } catch { /* private mode */ }
          draw();
        } }, w.other)),
        renderCard(card, { actions: { save: saveContact }, lang }),
        h('div', { class: 'vc-pills', dir: lang === 'ar' ? 'rtl' : 'ltr' },
          h('button', { class: 'vc-pill', onclick: () => { track('share'); shareLink(shown, url, w.hereIs); } }, icon('share'), w.share),
          h('button', { class: 'vc-pill', onclick: () => { track('qr'); cardQrSheet(shown, url, w); } }, icon('qr'), w.qr),
          !mine && h('button', { class: 'vc-pill', onclick: () => exchangeSheet(username, slug, shown, contactEmail, url) }, icon('mail'), w.send)),
        h('p', { class: 'vc-footer' }, me.user ? 'MK Cards' : h('a', { href: '/' }, 'MK Cards')),
        !mine && reportEmail && h('p', { class: 'vc-report' }, h('a', {
          href: `mailto:${reportEmail}?subject=${encodeURIComponent(`Report: ${url}`)}&body=${encodeURIComponent(`I would like to report this MK Cards card:\n${url}\n\nReason:\n`)}`,
        }, lang === 'ar' ? 'الإبلاغ عن هذه البطاقة' : 'Report this card')),
      ].filter(Boolean));
    };
    draw();
  }).catch((err) => {
    root.replaceChildren(err.status === 404
      ? missingScreen('This card does not exist, or its owner has deleted it.')
      : h('section', { class: 'glass panel stack center' }, h('p', { class: 'error' }, err.message),
          h('button', { class: 'btn', onclick: () => render() }, 'Try again')));
  });
  return root;
}

// A large QR code holding the contact itself, for a guest to scan with their own phone's camera.
function cardQrSheet(card, link, w) {
  sheet((close) => [
    h('div', { class: 'qr-sheet', dir: w === CARD_WORDS.ar ? 'rtl' : 'ltr' },
      h('h1', { dir: 'auto' }, card.name),
      h('p', { class: 'qr-sheet-title' }, w.scan),
      qrBox(qrVCard(card, link), true),
      h('p', { class: 'muted small' }, w.scanNote)),
    h('button', { class: 'btn block', onclick: close }, w.close),
  ]);
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
  const org = me.user.org;
  return h('div', { class: 'stack' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Account'), h('h1', {}, 'Your account'))),
    org && h('section', { class: 'glass panel stack' }, h('h2', {}, 'Company'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, org.name), h('span', { class: 'pill' }, { owner: 'Owner', admin: 'Administrator', member: 'Member' }[org.role] || 'Member'))),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Account'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Username'), h('span', { class: 'pill' }, '@' + me.user.username)),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Email'), h('span', { class: 'muted small', style: 'overflow-wrap:anywhere;text-align:right' }, me.user.email)),
      h('button', { class: 'btn block', onclick: changePasswordSheet }, me.user.hasPassword === false ? 'Add a password' : 'Change password'),
      h('button', { class: 'btn block', onclick: async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch (err) { return toast(err.message); }
        me = { user: null, cards: [] };
        if (native && native.signedOut) native.signedOut();
        go('/');
      } }, 'Log out')),
    signInSection(),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'Tools'),
      h('a', { class: 'btn block', href: '/contacts' }, icon('users'), 'Contacts and Salesforce'),
      h('a', { class: 'btn block', href: '/scan' }, icon('scan'), 'Scan a business card or badge'),
      me.cards[0] && h('a', { class: 'btn block', href: `/signature/${me.cards[0].id}` }, icon('signature'), 'Email signature'),
      me.cards[0] && h('a', { class: 'btn block', href: `/background/${me.cards[0].id}` }, icon('monitor'), 'Video-call background'),
      inAppTabs && h('a', { class: 'btn block', href: '/admin' }, icon('building'), me.user.org && me.user.org.role !== 'member' ? 'Company admin' : 'Company workspace')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'App'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Version'),
        h('span', { class: 'pill' }, appVersion ? `${appVersion} · web ${APP_VERSION}` : APP_VERSION)),
      h('button', { class: 'btn block', onclick: checkForUpdate }, 'Check for updates'),
      h('a', { class: 'btn block', href: '/support' }, 'Help and support'),
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
        toast(me.user.hasPassword === false ? 'Password added' : 'Password changed');
        me.user.hasPassword = true;
      } catch (err) {
        errorLine.textContent = err.message;
        errorLine.hidden = false;
        button.disabled = false;
      }
    } },
      h('h1', {}, me.user.hasPassword === false ? 'Add a password' : 'Change password'),
      me.user.hasPassword === false && h('p', { class: 'muted small' }, 'You sign in with Microsoft, Google or Apple. A password lets you also sign in with your username.'),
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.user.username, hidden: true }),
      me.user.hasPassword !== false && h('label', { class: 'field' }, h('span', {}, 'Current password'),
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
        const form = new FormData(e.target);
        await api('/me', { method: 'DELETE', body: { password: form.get('password'), confirm: form.get('confirm') } });
        me = { user: null, cards: [] };
        close();
        if (native && native.signedOut) native.signedOut();
        toast('Your account was deleted');
        go('/');
      } catch (err) {
        errorLine.textContent = err.message;
        errorLine.hidden = false;
        button.disabled = false;
      }
    } },
      h('h1', {}, 'Delete your account?'),
      h('p', { class: 'muted' }, me.user.hasPassword === false
        ? `Everything is removed for good and cannot be brought back. Type your username (${me.user.username}) to confirm.`
        : 'Everything is removed for good and cannot be brought back. Enter your password to confirm.'),
      me.user.hasPassword === false
        ? h('label', { class: 'field' }, h('span', {}, 'Username'), h('input', { class: 'input', name: 'confirm', autocapitalize: 'none', autocomplete: 'off', required: true }))
        : h('label', { class: 'field' }, h('span', {}, 'Password'),
          h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
      errorLine, button,
      h('button', { class: 'btn block', type: 'button', onclick: close }, 'Keep my account'));
  });
}

// ---------- company administration ----------

function adminScreen() {
  const org = me.user.org;
  const root = h('div', { class: 'stack wide-stack' });
  if (!org) {
    const name = h('input', { class: 'input', maxlength: 80, placeholder: 'Company name' });
    root.append(
      h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'For companies'), h('h1', {}, 'Company workspace'),
        h('p', { class: 'muted' }, 'Give your whole team matching MK Cards. Import people from a spreadsheet, keep everyone\'s details up to date, see how cards are used, and switch cards off when people leave.'))),
      h('section', { class: 'glass panel stack narrow' }, h('h2', {}, 'Set up your company'),
        h('label', { class: 'field' }, h('span', {}, 'Company name'), name),
        h('button', { class: 'btn primary block', onclick: async () => {
          try { me = await api('/org', { method: 'POST', body: { name: name.value } }); toast('Company workspace created'); render(); }
          catch (err) { toast(err.message); }
        } }, icon('building'), 'Create company workspace'),
        h('p', { class: 'small muted' }, 'You become the owner and can add administrators. Your own cards stay as they are.')));
    return root;
  }
  if (org.role !== 'admin' && org.role !== 'owner') {
    root.append(h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Company'), h('h1', {}, org.name),
      h('p', { class: 'muted' }, 'You are a member of this company workspace. Its administrators manage company cards and settings.'))));
    return root;
  }

  root.append(h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading…')));
  const load = async () => {
    let data;
    try { data = await api('/org'); } catch (err) { root.replaceChildren(h('section', { class: 'glass panel' }, h('p', { class: 'error' }, err.message))); return; }
    const { org: info, members } = data;
    const cards = members.flatMap((m) => m.cards);
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search people', 'aria-label': 'Search people' });
    const list = h('div', { class: 'member-list' });
    const drawList = () => {
      const q = search.value.trim().toLowerCase();
      const shown = members.filter((m) => !q || [m.name, m.email, m.username, m.title, m.department].join(' ').toLowerCase().includes(q));
      list.replaceChildren(...(shown.length ? shown.map((m) => memberRow(m, info, load, data.me)) : [h('p', { class: 'muted center' }, 'No one matches that search.')]));
    };
    search.addEventListener('input', drawList);
    const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importPeople(file, load);
    } });
    root.replaceChildren(
      h('header', { class: 'page-head' },
        h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Admin'), h('h1', {}, info.name),
          h('p', { class: 'muted' }, `Company workspace · ${info.plan === 'trial' ? 'Trial' : info.plan} plan`)),
        h('div', { class: 'head-actions' },
          h('button', { class: 'btn', onclick: () => orgSettingsSheet(info, load) }, icon('gear'), 'Company settings'),
          h('button', { class: 'btn primary', onclick: () => fileInput.click() }, icon('upload'), 'Import people'), fileInput)),
      h('div', { class: 'stat-grid wide' },
        ...[[members.length, 'People'], [members.filter((m) => m.active).length, 'Active people'], [cards.filter((c) => c.active).length, 'Active cards'],
          [cards.reduce((n, c) => n + c.views, 0), 'Card views'], [cards.reduce((n, c) => n + c.saves, 0), 'Contact saves']]
          .map(([n, label]) => h('div', { class: 'stat glass' }, h('strong', {}, n), h('span', {}, label)))),
      h('section', { class: 'glass panel stack' },
        h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, 'People'),
          h('button', { class: 'btn small', onclick: downloadTemplate }, icon('download'), 'Import template'),
          h('a', { class: 'btn small', href: '/api/org/members.csv', download: 'mkcards-staff-cards.csv' }, icon('download'), 'Export staff cards'),
          h('a', { class: 'btn small', href: '/api/org/activity.csv', download: 'mkcards-company-activity.csv' }, icon('chart'), 'Activity CSV')),
        search, list),
      importHelpPanel(),
      printPanel(data.print),
      h('div', { class: 'two-col' }, companySignInPanel(data.sso, load), crmPanel('admin')));
    drawList();
  };
  load();
  return root;
}

function memberRow(m, info, reload, myId) {
  const status = !m.active ? ['Deactivated', 'off'] : m.pending ? ['Invited', 'pending'] : ['Active', 'on'];
  const call = async (path, body, done) => {
    try { const res = await api(path, { method: 'POST', body }); if (done) done(res); reload(); } catch (err) { toast(err.message); }
  };
  const isOwner = me.user.org.role === 'owner';
  const details = h('div', { class: 'member-cards', hidden: true },
    ...m.cards.map((c) => h('div', { class: 'row member-card' },
      h('span', { class: 'grow' }, h('strong', {}, c.label || (c.slug === '' ? 'Main card' : c.slug)), ' ',
        h('a', { href: `/${m.username}${c.slug ? '/' + c.slug : ''}`, target: '_blank', rel: 'noopener', class: 'small' }, `${location.host}/${m.username}${c.slug ? '/' + c.slug : ''}`),
        h('span', { class: 'small muted' }, ` · ${plural(c.views, 'view')} · ${plural(c.saves, 'save')}`)),
      h('button', { class: `btn small${c.active ? '' : ' primary'}`, onclick: () => call(`/cards/${c.id}/status`, { active: !c.active }) },
        icon('power'), c.active ? 'Turn off' : 'Turn on'))));
  return h('div', { class: `member${m.active ? '' : ' off'}` },
    h('div', { class: 'member-main' },
      h('span', { class: 'member-avatar' }, initials(m.name || m.username)),
      h('div', { class: 'grow member-who' },
        h('strong', { dir: 'auto' }, m.name || m.username), h('span', { class: 'small muted' }, m.email),
        (m.title || m.department) && h('span', { class: 'small muted', dir: 'auto' }, [m.title, m.department].filter(Boolean).join(' · '))),
      h('div', { class: 'member-meta' },
        h('span', { class: `badge ${status[1]}` }, status[0]),
        m.role !== 'member' && h('span', { class: 'badge role' }, m.role === 'owner' ? 'Owner' : 'Admin'),
        h('span', { class: 'small muted' }, plural(m.cards.reduce((n, c) => n + c.views, 0), 'view'), ' · ', plural(m.cards.reduce((n, c) => n + c.saves, 0), 'save')))),
    h('div', { class: 'member-actions' },
      h('button', { class: 'btn small', onclick: () => { details.hidden = !details.hidden; } }, icon('cards'), `Cards (${m.cards.length})`),
      m.id !== myId && m.role !== 'owner' && h('button', { class: `btn small${m.active ? ' danger' : ' primary'}`, onclick: () => {
        if (m.active) {
          sheet((close) => [
            h('h1', {}, `Deactivate ${m.name || m.username}?`),
            h('p', { class: 'muted' }, 'They can no longer log in, and all their cards switch off. Visitors see the company\'s "no longer with us" message and contact details instead. You can reactivate them at any time.'),
            h('button', { class: 'btn danger block', onclick: () => { close(); call(`/org/members/${m.id}`, { active: false }); } }, 'Deactivate'),
            h('button', { class: 'btn block', onclick: close }, 'Cancel'),
          ]);
        } else call(`/org/members/${m.id}`, { active: true });
      } }, icon('power'), m.active ? 'Deactivate' : 'Reactivate'),
      m.id !== myId && m.role !== 'owner' && m.active && h('button', { class: 'btn small', onclick: () => call(`/org/members/${m.id}/password`, {}, (res) => {
        sheet((close) => [
          h('h1', {}, 'Temporary password'),
          h('p', { class: 'muted' }, `Give this to ${m.name || m.username}. They log in with username "${m.username}" and must choose a new password straight away. It is shown only once.`),
          h('div', { class: 'linkbox center big' }, res.password),
          h('button', { class: 'btn primary block', onclick: () => copyText(res.password) }, icon('copy'), 'Copy'),
          h('button', { class: 'btn block', onclick: close }, 'Done'),
        ]);
      }) }, icon('key'), 'Reset password'),
      isOwner && m.id !== myId && m.role !== 'owner' && h('button', { class: 'btn small', onclick: () => call(`/org/members/${m.id}`, { role: m.role === 'admin' ? 'member' : 'admin' }) },
        icon('users'), m.role === 'admin' ? 'Make member' : 'Make admin')),
    details);
}

// Every column the import understands. Only email and name are required; empty cells leave a detail as it is.
const TEMPLATE_HEAD = [
  'email', 'username', 'temporary_password', 'role', 'name', 'title', 'department', 'company', 'card_label',
  'mobile', 'office', 'whatsapp', 'whatsapp_message', 'card_email', 'website', 'linkedin', 'address', 'bio',
  'name_ar', 'title_ar', 'department_ar', 'company_ar', 'address_ar', 'bio_ar',
];
const TEMPLATE_EXAMPLE = [
  'sara.haddad@company.example', 'sara-haddad', 'Welcome-2026!', 'member', 'Sara Haddad', 'Senior Architect', 'Design', '', 'Work',
  '+971 50 000 0001', '+971 4 000 0000', '+971500000001', 'Hello Sara, I found your card.', '', 'https://company.example',
  'https://www.linkedin.com/in/sara-haddad', 'Dubai, United Arab Emirates', 'Designing landmark buildings across the Gulf.',
  'سارة حداد', 'مهندسة معمارية أولى', 'التصميم', '', 'دبي، الإمارات العربية المتحدة', '',
];
const TEMPLATE_NOTES = [
  'Required: email, name. username: chosen by you (3–30 letters, numbers, - or _), or left empty to make one from the email.',
  'temporary_password: at least 8 characters, or empty to generate one. People must change it when they first sign in.',
  'role: member or admin. company: empty uses your company name. card_email: the email shown on the card (default: the sign-in email).',
  'Rows for people already in your company update their main card; a temporary_password in such a row resets their password.',
];

// Phone app downloads from the public GitHub release.
const APP_VER = '2.1.1';
const APP_REL = `https://github.com/Mkuz1/mk-cards/releases/download/v${APP_VER}`;

function downloadTemplate() {
  saveCsv([TEMPLATE_HEAD, TEMPLATE_EXAMPLE], 'mkcards-import-template.csv');
}

const csvLine = (r) => r.map((v) => (/[",\n\r]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))).join(',');
function saveCsv(rows, filename) {
  const blob = new Blob(['﻿' + rows.map(csvLine).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Reads a CSV file and sends it to the server ten people at a time, then shows what happened.
async function importPeople(file, reload) {
  const textIn = await file.text();
  const rows = []; let row = [], cell = '', q = false;
  const t = textIn.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const people = rows.filter((r) => r.some((c) => c.trim()));
  if (people.length < 2) return toast('That file has no people in it. Use the import template.');
  const [head, ...body] = people;
  const progress = h('p', { class: 'muted' }, `Adding 0 of ${body.length}…`);
  const close = sheet(() => [h('h1', {}, 'Importing people'), progress]);
  const results = [];
  for (let i = 0; i < body.length; i += 10) {
    try {
      const res = await api('/org/import', { method: 'POST', body: { csv: [head, ...body.slice(i, i + 10)].map(csvLine).join('\n') } });
      results.push(...res.results);
    } catch (err) {
      results.push(...body.slice(i, i + 10).map((r) => ({ email: r[head.indexOf('email')] || '', status: 'error', reason: err.message })));
    }
    progress.textContent = `Adding ${Math.min(i + 10, body.length)} of ${body.length}…`;
  }
  close();
  const created = results.filter((r) => r.status === 'created');
  const updated = results.filter((r) => r.status === 'updated');
  const failed = results.filter((r) => r.status === 'error');
  const withPassword = results.filter((r) => r.password);
  sheet((done) => [
    h('h1', {}, 'Import finished'),
    h('div', { class: 'stat-grid' }, h('div', { class: 'stat' }, h('strong', {}, created.length), h('span', {}, 'Added')),
      h('div', { class: 'stat' }, h('strong', {}, updated.length), h('span', {}, 'Updated')), h('div', { class: 'stat' }, h('strong', {}, failed.length), h('span', {}, 'Not added'))),
    withPassword.length > 0 && h('p', { class: 'muted' }, 'People with a temporary password must choose their own when they first sign in. Their sign-in details are also in "Export staff cards" until they do.'),
    withPassword.length > 0 && h('button', { class: 'btn primary block', onclick: () => saveCsv([['email', 'name', 'username', 'temporary_password', 'card_link', 'login_page'],
      ...withPassword.map((r) => [r.email, r.name, r.username, r.password, r.link, `${location.origin}/login`])], 'mkcards-sign-in-details.csv') }, icon('download'), 'Download sign-in details'),
    failed.length && h('div', { class: 'stack' }, h('h2', {}, 'Not added'),
      ...failed.map((r) => h('p', { class: 'small' }, h('strong', {}, r.email || '(no email)'), ` — ${r.reason}`))),
    h('button', { class: 'btn block', onclick: () => { done(); reload(); } }, 'Done'),
  ].filter(Boolean));
}

function orgSettingsSheet(info, reload) {
  sheet((close) => {
    const s = { ...info.settings };
    const field = (label, key, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h(attrs.rows ? 'textarea' : 'input', { class: 'input', value: s[key] || '', ...attrs, oninput: (e) => { s[key] = e.target.value; } }));
    const name = h('input', { class: 'input', value: info.name, maxlength: 80 });
    const orgLogoInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { const res = await api('/org/logo', { method: 'PUT', body: { logo: await logoPng(file) } }); s.logo = res.logo; info.settings.logo = res.logo; drawOrgLogo(); toast('Logo saved'); }
      catch (err) { toast(err.message); }
    } });
    const orgLogoRow = h('div', { class: 'row wrap' });
    const drawOrgLogo = () => orgLogoRow.replaceChildren(...[orgLogoInput,
      s.logo && h('img', { class: 'logo-preview', src: s.logo, alt: 'Logo' }),
      h('button', { class: 'btn small', type: 'button', onclick: () => orgLogoInput.click() }, s.logo ? 'Change logo' : 'Upload logo'),
      s.logo && h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        try { await api('/org/logo', { method: 'PUT', body: { logo: '' } }); s.logo = ''; info.settings.logo = ''; drawOrgLogo(); } catch (err) { toast(err.message); }
      } }, 'Remove')].filter(Boolean));
    drawOrgLogo();
    const swatches = h('div', { class: 'swatches' });
    const draw = () => swatches.replaceChildren(...COLOURS.map(([c, n]) => h('button', { class: 'swatch', type: 'button', style: `background:${c}`, title: n, 'aria-label': n,
      'aria-pressed': String(s.accent === c), onclick: () => { s.accent = c; draw(); } })));
    draw();
    return [
      h('h1', {}, 'Company settings'),
      h('label', { class: 'field' }, h('span', {}, 'Company name'), name),
      h('div', { class: 'field' }, h('span', {}, 'Colour for new people\'s cards'), swatches),
      h('div', { class: 'field' }, h('span', {}, 'Company logo (on everyone\'s wallet passes unless a card has its own)'), orgLogoRow),
      h('h2', {}, 'When someone leaves'),
      field('Message on their card', 'leftMessage', { rows: 3, maxlength: 400, placeholder: info.defaultMessage }),
      h('p', { class: 'small muted' }, '{name} and {company} are filled in automatically. Visitors also see the contact details below.'),
      field('Company email', 'contactEmail', { type: 'email', maxlength: 120 }),
      field('Company phone', 'contactPhone', { type: 'tel', maxlength: 40 }),
      field('Company website', 'website', { type: 'url', maxlength: 300, placeholder: 'https://' }),
      h('button', { class: 'btn primary block', onclick: async () => {
        try { await api('/org', { method: 'PUT', body: { name: name.value, settings: s } }); me.user.org.name = name.value; close(); toast('Settings saved'); reload(); }
        catch (err) { toast(err.message); }
      } }, 'Save'),
      h('button', { class: 'btn block', onclick: close }, 'Cancel'),
    ];
  });
}

function importHelpPanel() {
  return h('details', { class: 'glass panel stack help-panel' },
    h('summary', {}, h('strong', {}, 'How bulk import works'), h('span', { class: 'muted small' }, ' — columns, usernames and temporary passwords')),
    h('ol', { class: 'small' },
      h('li', {}, 'Download the import template. It has every column MK Cards understands, and an example row.'),
      h('li', {}, 'Fill in one row per person (Excel, Numbers or Google Sheets), save as CSV, and choose Import people.'),
      h('li', {}, 'Download the sign-in details at the end, or later with Export staff cards, and send each person their username and temporary password. They choose their own password when they first sign in.')),
    h('ul', { class: 'small muted' }, ...TEMPLATE_NOTES.map((n) => h('li', {}, n))),
    h('p', { class: 'small muted' }, 'Export staff cards gives every card with all details and links: card page, save-contact file, QR code, email signature, Zoom background and the print files.'));
}

// The company's printed card: a link to the design editor and the print page.
function printPanel(hasDesign) {
  return h('section', { class: 'glass panel stack' },
    h('div', { class: 'row wrap' }, h('span', { class: 'panel-icon' }, icon('cards')), h('h2', { class: 'grow' }, 'Printed business cards'),
      h('span', { class: `pill${hasDesign ? ' ok' : ''}` }, hasDesign ? 'Design ready' : 'No design yet')),
    h('p', { class: 'muted small' }, 'One fixed design for everyone in the company. Upload the front and back artwork and your brand fonts, place the fields, and download print-ready SVG cards for everyone.'),
    h('div', { class: 'row wrap' },
      h('a', { class: 'btn primary', href: '/admin/design' }, icon('edit'), hasDesign ? 'Edit card design' : 'Create card design'),
      h('a', { class: 'btn', href: '/admin/print' }, icon('download'), 'Print cards')));
}

// ---------- first sign-in for invited people ----------

function setPasswordScreen() {
  const err = h('p', { class: 'error', role: 'alert', hidden: true });
  const button = h('button', { class: 'btn primary block', type: 'submit' }, 'Save my password');
  return h('form', { class: 'stack narrow', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    err.hidden = true;
    try {
      if (d.next !== d.again) throw new Error('The two new passwords do not match.');
      button.disabled = true;
      await api('/me/password', { method: 'POST', body: { current: d.current, next: d.next } });
      me.user.mustChange = false;
      toast('Password saved. Welcome to MK Cards!');
      go('/');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; button.disabled = false; }
  } },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, me.user.org ? me.user.org.name : 'Welcome'), h('h1', {}, 'Choose your password'),
      h('p', { class: 'muted' }, 'Your account was set up for you. Choose your own password to continue.'))),
    h('section', { class: 'glass panel stack' },
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.user.username, hidden: true }),
      h('label', { class: 'field' }, h('span', {}, 'Temporary password'), h('input', { class: 'input', name: 'current', type: 'password', autocomplete: 'current-password', required: true })),
      h('label', { class: 'field' }, h('span', {}, 'New password'), h('input', { class: 'input', name: 'next', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }),
        h('p', { class: 'small muted' }, 'At least 8 characters.')),
      h('label', { class: 'field' }, h('span', {}, 'New password again'), h('input', { class: 'input', name: 'again', type: 'password', autocomplete: 'new-password', required: true })),
      err, button));
}

// What visitors see when a card has been switched off.
function inactiveCardScreen(data) {
  const { card, message, contact } = data;
  document.body.classList.add('card-page');
  document.body.setAttribute('style', themeVars(card));
  document.documentElement.style.background = cardTheme(card).page;
  const rows = contact ? [
    contact.email && ['mail', 'Email', contact.email, 'mailto:' + contact.email],
    contact.phone && ['phone', 'Phone', contact.phone, telHref(contact.phone)],
    contact.website && ['globe', 'Website', prettyUrl(contact.website), contact.website],
  ].filter(Boolean) : [];
  return h('div', { class: `vc ${card.style || 'aurora'}`, style: themeVars(card) },
    h('article', { class: 'vc-hero vc-glass' },
      card.company && h('p', { class: 'vc-eyebrow' }, card.company),
      h('h2', { class: 'vc-name' }, card.name),
      h('span', { class: 'vc-rule', 'aria-hidden': 'true' }),
      h('p', { class: 'vc-title' }, 'This card is no longer active'),
      h('p', { class: 'vc-bio' }, message)),
    rows.length && h('section', { class: 'vc-details vc-glass' }, h('div', { class: 'vc-group' },
      ...rows.map(([ic, label, value, href]) => h('a', { class: 'vc-row', href, target: /^https?:/.test(href) ? '_blank' : null, rel: 'noopener' },
        h('span', { class: 'vc-ico' }, solidIcon(ic)), h('span', { class: 'grow' }, h('small', {}, label), h('bdi', {}, value)), h('span', { class: 'vc-chev' }, icon('chevron')))))),
    h('p', { class: 'vc-footer' }, 'MK Cards'));
}

function missingScreen(message, title = 'Card not found') {
  return h('section', { class: 'glass hero' }, h('h1', {}, title), h('p', {}, message),
    h('a', { class: 'btn primary', href: '/' }, 'Go to MK Cards'));
}

// ---------- messages carried back in the address (after signing in elsewhere) ----------

const FLASH = {
  linked: (v) => `${SSO_LABELS[v] || 'Account'} connected. You can now sign in with it.`,
  sso: (v) => `${SSO_LABELS[v] || 'Company'} sign-in is connected for your company.`,
  crm: () => 'Salesforce is connected.',
};

function flashFromUrl() {
  const q = new URLSearchParams(location.search);
  let changed = false;
  if (q.get('error')) { toast(q.get('error')); q.delete('error'); changed = true; }
  for (const [key, message] of Object.entries(FLASH)) {
    if (q.has(key)) { toast(message(q.get(key))); q.delete(key); changed = true; }
  }
  if (changed) history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
}

// ---------- sign-in with Microsoft, Google and Apple ----------

const SSO_LABELS = { microsoft: 'Microsoft', google: 'Google', apple: 'Apple' };
const SSO_GLYPHS = {
  microsoft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M3 3h8.6v8.6H3z"/><path fill="#7fba00" d="M12.4 3H21v8.6h-8.6z"/><path fill="#00a4ef" d="M3 12.4h8.6V21H3z"/><path fill="#ffb900" d="M12.4 12.4H21V21h-8.6z"/></svg>',
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.98-4.32 2.98-7.33z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96z"/><path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.86A10 10 0 0 0 3.07 7.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3 .9-3.9 2.300-1.7 2.900-.4 7.200 1.200 9.500.8 1.100 1.700 2.400 2.900 2.400 1.200-.1 1.600-.8 3-.8s1.800.8 3.100.8c1.300 0 2.100-1.200 2.800-2.300.9-1.300 1.300-2.600 1.300-2.700 0 0-2.400-.9-2.400-3.700zM14.200 5.800c.6-.8 1.100-1.800 1-2.800-.9 0-2 .6-2.700 1.400-.6.700-1.100 1.700-1 2.700 1 .1 2-.5 2.700-1.300z"/></svg>',
};

function ssoGlyph(provider) {
  const span = h('span', { class: 'sso-glyph' });
  span.innerHTML = SSO_GLYPHS[provider];
  return span;
}

// "Continue with Microsoft / Google" on the sign-in pages, once MK Cards has been registered with each.
function ssoButtons(verb) {
  const status = me.sso || {};
  const list = ['microsoft', 'google'].filter((p) => status[p]);
  if (!list.length) return null;
  return h('div', { class: 'sso-block' },
    h('p', { class: 'divider' }, h('span', {}, 'or')),
    ...list.map((p) => h('a', { class: 'btn block sso-btn', href: `/api/auth/sso/${p}/start` }, ssoGlyph(p), `${verb} with ${SSO_LABELS[p]}`)),
    h('p', { class: 'small muted center' }, 'Use your work account if your company has set up MK Cards.'));
}

async function startSso(provider, mode) {
  try {
    const { ticket } = await api('/auth/ticket', { method: 'POST', body: { mode } });
    location.href = `/api/auth/sso/${provider}/start?mode=${mode}&ticket=${encodeURIComponent(ticket)}`;
  } catch (err) {
    toast(err.message);
  }
}

function signInSection() {
  const status = me.sso || {};
  const ids = me.user.identities || [];
  const rows = ['microsoft', 'google', 'apple'].filter((p) => status[p] || ids.some((i) => i.provider === p)).map((p) => {
    const id = ids.find((i) => i.provider === p);
    return h('div', { class: 'row signin-row' }, ssoGlyph(p),
      h('span', { class: 'grow' }, h('strong', {}, SSO_LABELS[p]), h('small', { class: 'muted block' }, id ? id.email || 'Connected' : 'Not connected')),
      id ? h('button', { class: 'btn small', onclick: async () => {
        try { await api(`/me/identities/${p}`, { method: 'DELETE' }); await loadMe(); render(); toast(`${SSO_LABELS[p]} disconnected`); }
        catch (err) { toast(err.message); }
      } }, 'Disconnect') : p !== 'apple' && h('button', { class: 'btn small', onclick: () => startSso(p, 'link') }, 'Connect'));
  });
  return h('section', { class: 'glass panel stack' }, h('h2', {}, 'Sign-in methods'),
    h('div', { class: 'row signin-row' }, h('span', { class: 'sso-glyph key' }, icon('key')),
      h('span', { class: 'grow' }, h('strong', {}, 'Password'), h('small', { class: 'muted block' }, me.user.hasPassword === false ? 'Not set' : 'Set'))),
    ...rows,
    !rows.length && h('p', { class: 'small muted' }, 'Microsoft and Google sign-in will appear here once they are switched on for MK Cards.'));
}

// Company sign-in, on the admin page: an administrator connects the company's Microsoft tenant or Google
// Workspace domain by signing in with it once. People from that company can then sign in with their work account.
function companySignInPanel(info, reload) {
  const panel = h('section', { class: 'glass panel stack' });
  const draw = (sso) => {
    const claimed = (p) => sso.claims.find((c) => c.provider === p);
    const available = ['microsoft', 'google'].filter((p) => sso.available[p] || claimed(p));
    panel.replaceChildren(...[
      h('div', { class: 'row' }, h('span', { class: 'panel-icon' }, icon('shield')), h('h2', { class: 'grow' }, 'Company sign-in')),
      h('p', { class: 'muted small' }, 'Let your people sign in with their Microsoft 365 or Google Workspace account. Connect your company by signing in once with an administrator\'s work account.'),
      ...(available.length ? available.map((p) => {
        const c = claimed(p);
        return h('div', { class: 'row signin-row' }, ssoGlyph(p),
          h('span', { class: 'grow' }, h('strong', {}, SSO_LABELS[p]), h('small', { class: 'muted block' }, c ? `Connected: ${c.label}` : 'Not connected')),
          c ? h('button', { class: 'btn small', onclick: async () => {
            try { draw(await api(`/org/sso/${p}`, { method: 'DELETE' })); toast('Disconnected'); } catch (err) { toast(err.message); }
          } }, 'Disconnect') : h('button', { class: 'btn small primary', onclick: () => startSso(p, 'claim') }, 'Connect'));
      }) : [h('p', { class: 'small muted' }, 'Microsoft and Google sign-in are not switched on for MK Cards yet.')]),
      sso.claims.length > 0 && h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: sso.autoCreate, onchange: (e) => save({ ...sso, autoCreate: e.target.checked }) }),
        h('span', {}, h('strong', {}, 'Add new people automatically'), h('small', { class: 'muted block' }, 'Anyone in your company who signs in gets an account and a card in the company colours.'))),
      sso.claims.length > 0 && h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: sso.requireSso, onchange: (e) => save({ ...sso, requireSso: e.target.checked }) }),
        h('span', {}, h('strong', {}, 'Require company sign-in'), h('small', { class: 'muted block' }, 'Members can no longer sign in with a password. The owner always can.'))),
    ].filter(Boolean));
  };
  const save = async (next) => {
    try { draw(await api('/org/sso', { method: 'PUT', body: { autoCreate: next.autoCreate, requireSso: next.requireSso } })); toast('Saved'); }
    catch (err) { toast(err.message); reload(); }
  };
  draw(info || { claims: [], available: {}, autoCreate: false, requireSso: false });
  return panel;
}

// ---------- Salesforce ----------

function crmPanel(back = 'contacts') {
  const panel = h('section', { class: 'glass panel stack crm-panel' }, h('p', { class: 'muted' }, 'Loading Salesforce…'));
  const head = () => h('div', { class: 'row' }, h('span', { class: 'panel-icon sf' }, icon('cloud')), h('h2', { class: 'grow' }, 'Salesforce'));
  const load = async () => {
    let st;
    try { st = await api('/crm'); } catch (err) { panel.replaceChildren(...[head(), h('p', { class: 'error' }, err.message)].filter(Boolean)); return; }
    crmConnected = st.connected;
    const connectHref = `/api/crm/salesforce/start${back === 'admin' ? '?back=admin' : ''}`;
    if (st.connected) {
      panel.replaceChildren(...[head(),
        h('p', {}, h('span', { class: 'pill ok' }, icon('check'), 'Connected'), ' ', h('span', { class: 'muted small' }, st.userName ? `as ${st.userName}` : '')),
        h('p', { class: 'small muted' }, st.scope === 'company' ? 'Contacts captured by everyone in your company are sent to your company\'s Salesforce as leads, owned by the card holder when they are a Salesforce user.' : 'Your contacts are sent to Salesforce as leads.'),
        st.canManage && h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: st.autoSync, onchange: async (e) => {
            try { await api('/crm', { method: 'PUT', body: { autoSync: e.target.checked } }); toast('Saved'); } catch (err) { toast(err.message); }
          } }), h('span', {}, h('strong', {}, 'Send new contacts automatically'), h('small', { class: 'muted block' }, 'Otherwise, send them one by one from the contact list.'))),
        st.canManage && h('div', { class: 'row' },
          h('a', { class: 'btn small', href: connectHref }, 'Reconnect'),
          h('button', { class: 'btn small danger', onclick: async () => {
            try { await api('/crm', { method: 'DELETE' }); toast('Salesforce disconnected'); load(); } catch (err) { toast(err.message); }
          } }, 'Disconnect'))].filter(Boolean));
      return;
    }
    if (!st.canManage) {
      panel.replaceChildren(...[head(), h('p', { class: 'small muted' }, 'Your company has not connected Salesforce yet. Ask a company administrator to connect it on the Admin page.')]);
      return;
    }
    const form = { loginUrl: st.loginUrl, clientId: st.clientId, clientSecret: '' };
    const input = (label, key, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h('input', { class: 'input', value: form[key] || '', autocomplete: 'off', spellcheck: 'false', ...attrs, oninput: (e) => { form[key] = e.target.value; } }));
    const own = h('details', { class: 'own-app', open: !st.mkApp || st.ownApp },
      h('summary', {}, st.mkApp ? 'Use your own Salesforce app (optional)' : 'Your Salesforce app'),
      h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, 'In Salesforce Setup, open App Manager and create an External Client App with OAuth turned on. Use this callback URL, and the scopes "Manage user data via APIs (api)" and "Perform requests at any time (refresh_token, offline_access)". Require PKCE. Then copy its consumer key and secret here.'),
        h('div', { class: 'linkbox small' }, st.callbackUrl),
        input('Salesforce login address', 'loginUrl', { placeholder: 'https://login.salesforce.com', inputmode: 'url' }),
        h('p', { class: 'small muted' }, 'Use https://test.salesforce.com for a sandbox, or your My Domain address.'),
        input('Consumer key', 'clientId'),
        input('Consumer secret', 'clientSecret', { type: 'password', placeholder: st.ownApp ? 'Saved — type to replace' : '' }),
        h('button', { class: 'btn small', onclick: async () => {
          try { await api('/crm', { method: 'PUT', body: form }); toast('Saved'); load(); } catch (err) { toast(err.message); }
        } }, 'Save app details')));
    panel.replaceChildren(...[head(),
      h('p', { class: 'small muted' }, 'Send the people you meet to Salesforce as leads: contacts shared on your card pages and cards or badges you scan.'),
      (st.mkApp || st.ownApp) ? h('a', { class: 'btn primary block', href: connectHref }, icon('cloud'), 'Connect Salesforce') : null,
      own].filter(Boolean));
  };
  load();
  return panel;
}
let crmConnected = false;

// ---------- contacts ----------

const SOURCE_LABELS = { form: 'Shared on your card', scan: 'Scanned card', badge: 'Scanned badge', manual: 'Added by hand' };

function contactsScreen() {
  const list = h('div', { class: 'contact-list' }, h('p', { class: 'muted' }, 'Loading…'));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search contacts', 'aria-label': 'Search contacts' });
  let contacts = [];
  const crm = crmPanel('contacts');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = contacts.filter((c) => !q || [c.name, c.company, c.email, c.phone, c.title, c.event].join(' ').toLowerCase().includes(q));
    if (!contacts.length) {
      list.replaceChildren(h('div', { class: 'empty center' },
        h('span', { class: 'empty-icon' }, icon('users')),
        h('p', { class: 'strong' }, 'No contacts yet'),
        h('p', { class: 'muted small' }, 'Scan the business cards and badges of people you meet, or let visitors share their details on your card page.'),
        h('a', { class: 'btn primary', href: '/scan' }, icon('scan'), 'Scan a card')));
      return;
    }
    list.replaceChildren(...(shown.length ? shown.map(contactItem) : [h('p', { class: 'muted center' }, 'No one matches that search.')]));
  };
  const contactItem = (c) => {
    const status = h('span', { class: 'crm-status' });
    const drawStatus = () => {
      if (c.crm) status.replaceChildren(h('span', { class: 'pill ok' }, icon('check'), c.crm.id === 'duplicate' ? 'Already in Salesforce' : 'In Salesforce'));
      else if (crmConnected) {
        status.replaceChildren(h('button', { class: 'btn small', onclick: async (e) => {
          e.target.disabled = true;
          try { const r = await api(`/contacts/${c.id}/crm`, { method: 'POST' }); c.crm = { id: r.id }; c.crmError = ''; toast(r.duplicate ? 'Already in Salesforce' : 'Sent to Salesforce'); }
          catch (err) { c.crmError = err.message; toast(err.message); }
          drawStatus();
        } }, icon('cloud'), 'Send to Salesforce'), c.crmError && h('small', { class: 'error block' }, c.crmError));
      } else status.replaceChildren();
    };
    drawStatus();
    const role = [c.title, c.company].filter(Boolean).join(' · ');
    return h('article', { class: 'contact' },
      h('span', { class: 'contact-avatar' }, initials(c.name)),
      h('div', { class: 'grow' },
        h('p', { class: 'who', dir: 'auto' }, c.name),
        role && h('p', { class: 'small', dir: 'auto' }, role),
        h('p', { class: 'small links' }, c.email && h('a', { href: 'mailto:' + c.email }, c.email), c.phone && h('a', { href: telHref(c.phone) }, c.phone), c.mobile && h('a', { href: telHref(c.mobile) }, c.mobile)),
        h('p', { class: 'small muted' }, [shortDate(c.createdAt), SOURCE_LABELS[c.source] || '', c.event].filter(Boolean).join(' · ')),
        c.note && h('p', { class: 'small muted note' }, c.note),
        status),
      h('div', { class: 'contact-actions' },
        h('button', { class: 'btn icon', title: 'Save to phone', 'aria-label': `Save ${c.name} to your phone`,
          onclick: () => saveVCard(vcardFromContact(c), `${c.name.replace(/[^\w-]+/g, '-') || 'contact'}.vcf`) }, icon('save')),
        h('button', { class: 'btn icon danger', title: 'Remove', 'aria-label': `Remove ${c.name}`, onclick: async () => {
          if (!confirm(`Remove ${c.name} from your contacts?`)) return;
          try { await api(`/contacts/${c.id}`, { method: 'DELETE' }); contacts = contacts.filter((x) => x !== c); draw(); }
          catch (err) { toast(err.message); }
        } }, icon('trash'))));
  };
  search.addEventListener('input', draw);
  const load = async () => {
    try { ({ contacts } = await api('/contacts')); draw(); }
    catch (err) { list.replaceChildren(h('p', { class: 'error' }, err.message)); }
  };
  // The list waits for the Salesforce status, so each contact shows the right button.
  setTimeout(load, 250);
  return h('div', { class: 'stack wide-stack' },
    h('header', { class: 'page-head' },
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Leads'), h('h1', {}, 'Contacts'),
        h('p', { class: 'muted' }, 'People who shared their details on your card pages, and the cards and badges you scanned.')),
      h('div', { class: 'head-actions' },
        h('a', { class: 'btn', href: '/api/contacts.csv', download: 'mkcards-contacts.csv' }, icon('download'), 'Export CSV'),
        h('a', { class: 'btn primary', href: '/scan' }, icon('scan'), 'Scan a card'))),
    h('div', { class: 'contacts-layout' },
      h('section', { class: 'glass panel stack' }, search, list),
      h('div', { class: 'stack' }, crm)));
}

// ---------- scanning business cards and badges ----------

let scanHandler = null; // the scan screen on show; the iPhone app hands its scans here

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = h('script', { src });
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(el);
  });
}

async function decodeQr(canvas) {
  try {
    if ('BarcodeDetector' in window) {
      const found = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
      if (found[0]) return found[0].rawValue;
    }
  } catch { /* fall back to jsQR */ }
  try {
    if (!window.jsQR) await loadScript('/vendor/jsqr.js');
    const ctx = canvas.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = window.jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    return hit ? hit.data : '';
  } catch {
    return '';
  }
}

function unescapeV(value) {
  return String(value || '').replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1').trim();
}

/** Contact details from a QR code: a vCard, a MECARD, or an MK Cards link. */
async function contactFromQr(value) {
  const v = String(value || '').trim();
  if (/^BEGIN:VCARD/i.test(v)) {
    const c = {};
    const lines = v.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    for (const line of lines) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [key, ...params] = line.slice(0, i).split(';');
      const val = unescapeV(line.slice(i + 1));
      const k = key.toUpperCase().replace(/^ITEM\d+\./, '');
      const p = params.join(';').toUpperCase();
      if (k === 'FN') c.name = val;
      else if (k === 'N' && !c.name) c.name = val.split(';').slice(0, 2).reverse().join(' ').trim();
      else if (k === 'ORG') c.company = val.split(';')[0];
      else if (k === 'TITLE') c.title = val;
      else if (k === 'EMAIL' && !c.email) c.email = val;
      else if (k === 'TEL') { if (/CELL/.test(p) && !c.mobile) c.mobile = val; else if (!c.phone) c.phone = val; }
      else if (k === 'URL' && !c.website && !/wa\.me/.test(val)) c.website = val;
      else if (k === 'ADR' && !c.address) c.address = val.split(';').filter(Boolean).join(', ');
      else if (k === 'NOTE') c.note = val;
    }
    return c;
  }
  if (/^MECARD:/i.test(v)) {
    const c = {};
    for (const part of v.slice(7).split(/(?<!\\);/)) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const k = part.slice(0, i).toUpperCase();
      const val = unescapeV(part.slice(i + 1));
      if (k === 'N') c.name = val.includes(',') ? val.split(',').reverse().join(' ').trim() : val;
      else if (k === 'TEL' && !c.phone) c.phone = val;
      else if (k === 'EMAIL') c.email = val;
      else if (k === 'URL') c.website = val;
      else if (k === 'ADR') c.address = val;
      else if (k === 'ORG') c.company = val;
      else if (k === 'NOTE') c.note = val;
    }
    return c;
  }
  if (/^https?:\/\//i.test(v)) {
    const url = new URL(v);
    const m = /^\/([a-z0-9][a-z0-9_-]{2,29})(?:\/([a-z0-9][a-z0-9-]{0,29}))?\/?$/i.exec(url.pathname);
    if (url.host === location.host && m) {
      try {
        const data = await api(`/public/card?u=${encodeURIComponent(m[1])}&s=${encodeURIComponent(m[2] || '')}`);
        const card = data.card;
        if (card && card.name) {
          return { name: card.name, title: card.title, company: card.company, email: (card.emails || [])[0]?.value,
            phone: (card.phones || []).find((p) => p.label !== 'mobile')?.value, mobile: (card.phones || []).find((p) => p.label === 'mobile')?.value,
            website: card.website || v, address: card.address };
        }
      } catch { /* treat as a plain link */ }
    }
    return { website: v };
  }
  return v ? { note: v.slice(0, 400) } : null;
}

// A rough reading of plain text from a card, used only when the AI reader is not available.
function contactFromText(textIn) {
  const t = String(textIn || '');
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const email = (t.match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i) || [])[0] || '';
  const phones = t.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  const website = (t.match(/\b(?:https?:\/\/)?(?:www\.)[^\s,;]+/i) || [])[0] || '';
  const name = lines.find((l) => /^[\p{L}][\p{L}.'-]+(\s[\p{L}][\p{L}.'-]+){1,3}$/u.test(l) && !/@|\d/.test(l)) || '';
  return { name, email, phone: phones[0] || '', mobile: phones[1] || '', website };
}

async function downscale(source, max = 1600) {
  const img = source instanceof Blob ? await loadImage(URL.createObjectURL(source)) : await loadImage(source);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  if (source instanceof Blob) URL.revokeObjectURL(img.src);
  return canvas;
}

function scanScreen() {
  const stage = h('div', { class: 'stack' });
  let eventName = '';
  try { eventName = localStorage.getItem('mk_scan_event') || ''; } catch { /* private mode */ }
  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) readPicture({ file });
  } });
  const nativeScan = native && native.scanCard;

  const start = () => stage.replaceChildren(
    h('section', { class: 'glass panel stack' },
      h('div', { class: 'scan-options' },
        h('button', { class: 'scan-option', onclick: () => (nativeScan ? native.scanCard('card') : fileInput.click()) },
          h('span', { class: 'scan-icon' }, icon('camera')), h('strong', {}, 'Business card'), h('small', {}, 'Take a photo; the details are read for you')),
        h('button', { class: 'scan-option', onclick: () => (nativeScan ? native.scanCard('badge') : fileInput.click()) },
          h('span', { class: 'scan-icon' }, icon('qr')), h('strong', {}, 'Event badge'), h('small', {}, 'Photograph the badge\'s QR code')),
        h('button', { class: 'scan-option', onclick: () => review({}, 'manual') },
          h('span', { class: 'scan-icon' }, icon('type')), h('strong', {}, 'Type it in'), h('small', {}, 'Add someone by hand'))),
      h('label', { class: 'field' }, h('span', {}, 'Event (optional, kept for your next scans)'),
        h('input', { class: 'input', value: eventName, maxlength: 80, placeholder: 'e.g. GITEX 2026', oninput: (e) => {
          eventName = e.target.value;
          try { localStorage.setItem('mk_scan_event', eventName); } catch { /* private mode */ }
        } })),
      h('p', { class: 'small muted' }, 'Photos are only used to read the details and are not kept.')),
    fileInput);

  async function readPicture({ file, image, text: ocr, qr }) {
    const preview = h('img', { class: 'scan-preview', alt: 'The photographed card' });
    stage.replaceChildren(h('section', { class: 'glass panel stack center' }, preview, h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Reading the card…')));
    let canvas = null;
    try {
      canvas = await downscale(file || image);
      preview.src = canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      if (!ocr && !qr) { toast(err.message); start(); return; }
    }
    const code = qr || (canvas ? await decodeQr(canvas) : '');
    if (code) {
      const found = await contactFromQr(code);
      if (found && (found.name || found.email)) return review(found, 'badge');
    }
    try {
      const { fields } = await api('/scan/read', { method: 'POST', body: { image: canvas ? canvas.toDataURL('image/jpeg', 0.85) : '', text: ocr || '' } });
      const mobile = fields.phones.find((p) => p.label === 'mobile');
      const other = fields.phones.find((p) => p !== mobile);
      review({
        name: fields.name, title: fields.title, company: fields.company, email: fields.emails[0] || '',
        phone: other ? other.value : '', mobile: mobile ? mobile.value : '', website: fields.website || fields.linkedin, address: fields.address,
        note: [fields.department, fields.emails.slice(1).join(', '), fields.ar && fields.ar.name ? `${fields.ar.name} ${fields.ar.title || ''}`.trim() : ''].filter(Boolean).join('\n'),
      }, 'scan');
    } catch (err) {
      toast(err.message);
      review(Object.assign(ocr ? contactFromText(ocr) : {}, code ? { note: code } : {}), 'scan');
    }
  }

  function review(found, source) {
    const c = { ...found, event: found.event || eventName };
    const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
    const field = (label, key, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h(attrs.rows ? 'textarea' : 'input', { class: 'input', value: c[key] || '', dir: 'auto', ...attrs, oninput: (e) => { c[key] = e.target.value; } }));
    const save = h('button', { class: 'btn primary block', type: 'submit' }, icon('check'), 'Save contact');
    stage.replaceChildren(h('form', { class: 'glass panel stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      errorLine.hidden = true;
      save.disabled = true;
      try {
        const { contact } = await api('/contacts', { method: 'POST', body: { ...c, source } });
        if (native && native.haptic) native.haptic('success');
        done(contact);
      } catch (err) {
        errorLine.textContent = err.message;
        errorLine.hidden = false;
        save.disabled = false;
      }
    } },
      h('h2', {}, source === 'manual' ? 'New contact' : 'Check the details'),
      source !== 'manual' && h('p', { class: 'small muted' }, 'Correct anything that was misread before saving.'),
      h('div', { class: 'grid2' },
        field('Name', 'name', { autocomplete: 'off', required: true, maxlength: 80 }),
        field('Job title', 'title', { maxlength: 80 }),
        field('Company', 'company', { maxlength: 80 }),
        field('Email', 'email', { type: 'email', maxlength: 120, autocapitalize: 'none' }),
        field('Mobile', 'mobile', { type: 'tel', maxlength: 40 }),
        field('Phone', 'phone', { type: 'tel', maxlength: 40 }),
        field('Website', 'website', { type: 'url', maxlength: 200, autocapitalize: 'none' }),
        field('Event', 'event', { maxlength: 80 })),
      field('Address', 'address', { maxlength: 160 }),
      field('Note', 'note', { rows: 3, maxlength: 400, placeholder: 'What did you talk about?' }),
      errorLine, save,
      h('button', { class: 'btn block', type: 'button', onclick: start }, 'Start again')));
  }

  function done(contact) {
    stage.replaceChildren(h('section', { class: 'glass panel stack center' },
      h('span', { class: 'done-icon' }, icon('check')),
      h('h2', {}, `${contact.name} saved`),
      h('p', { class: 'muted small' }, crmConnected ? 'Added to your contacts and on its way to Salesforce.' : 'Added to your contacts.'),
      h('div', { class: 'row wrap center-row' },
        h('button', { class: 'btn primary', onclick: start }, icon('scan'), 'Scan another'),
        h('button', { class: 'btn', onclick: () => saveVCard(vcardFromContact(contact), `${contact.name.replace(/[^\w-]+/g, '-')}.vcf`) }, icon('save'), 'Save to phone'),
        h('a', { class: 'btn', href: '/contacts' }, 'All contacts'))));
  }

  scanHandler = (result) => readPicture(result);
  api('/crm').then((st) => { crmConnected = st.connected; }).catch(() => {});
  start();
  return h('div', { class: 'stack' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Contacts'), h('h1', {}, 'Scan a card'),
      h('p', { class: 'muted' }, 'Photograph a business card or an event badge. MK Cards reads the details and adds the person to your contacts.'))),
    stage);
}

// ---------- email signature ----------

const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// The signature and background tools work for the signed-in owner (by card id) and, through /tools/…?u=&s=,
// for anyone with the card's address, such as staff following the links in their company's export.
const toolSubject = (e) => e && { card: e.card, slug: e.slug, username: me.user.username, link: cardUrl(e), orgLogo: (me.user.org && me.user.org.logo) || '' };

function publicToolScreen(kind) {
  const q = new URLSearchParams(location.search);
  const holder = h('div', { class: 'stack' }, h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading…')));
  api(`/public/card?u=${encodeURIComponent(q.get('u') || '')}&s=${encodeURIComponent(q.get('s') || '')}`).then((data) => {
    if (data.inactive || !data.card) { holder.replaceChildren(missingScreen('This card is no longer active.')); return; }
    const subject = { card: data.card, slug: data.slug, username: data.username, orgLogo: data.orgLogo || '',
      link: `${location.origin}/${data.username}${data.slug ? '/' + data.slug : ''}` };
    holder.replaceChildren(kind === 'signature' ? signatureScreen(subject) : backgroundScreen(subject));
  }).catch((err) => holder.replaceChildren(missingScreen(err.message)));
  return holder;
}

function signatureHtml(entry, opts) {
  const card = entry.card;
  const t = cardTheme(card);
  const link = entry.link;
  const abs = (path) => (path ? location.origin + path : '');
  const photo = opts.photo && card.photo ? abs(card.photo) : '';
  const logoSrc = opts.logo ? abs(card.logo || entry.orgLogo || '') : '';
  const qr = opts.qr ? `${location.origin}/api/public/qr.png?u=${encodeURIComponent(entry.username)}&s=${encodeURIComponent(entry.slug)}` : '';
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const navy = t.deep;
  const gold = '#a8862e';
  const line = (label, value, href) => value ? `<tr><td style="${font}font-size:12px;color:#6b7280;padding:1px 8px 1px 0;white-space:nowrap">${label}</td><td style="${font}font-size:12px;padding:1px 0"><a href="${escHtml(href)}" style="color:${navy};text-decoration:none">${escHtml(value)}</a></td></tr>` : '';
  const phones = (card.phones || []).slice(0, 2).map((p) => line(p.label === 'mobile' ? 'M' : 'T', p.value, telHref(p.value))).join('');
  const email = (card.emails || [])[0];
  const rows = phones + (email ? line('E', email.value, 'mailto:' + email.value) : '') + (card.website ? line('W', prettyUrl(card.website), card.website) : '');
  const role = [card.title, card.department].filter(Boolean).join(' · ');
  const nameBlock = `<div style="${font}font-size:${opts.style === 'compact' ? 15 : 17}px;font-weight:bold;color:${navy};line-height:1.3">${escHtml(card.name)}</div>`
    + (role ? `<div style="${font}font-size:13px;color:#374151;line-height:1.4">${escHtml(role)}</div>` : '')
    + (card.company ? `<div style="${font}font-size:11px;letter-spacing:1.5px;color:${gold};font-weight:bold;text-transform:uppercase;padding-top:2px">${escHtml(card.company)}</div>` : '');
  const save = `<a href="${escHtml(link)}" style="${font}font-size:12px;color:${navy};font-weight:bold;text-decoration:none">Save my contact &rsaquo;</a>`;
  if (opts.style === 'compact') {
    return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:0">${nameBlock}`
      + `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px">${rows}</table>`
      + `<div style="padding-top:6px">${save}</div></td></tr></table>`;
  }
  const left = photo ? `<td style="padding:0 16px 0 0;vertical-align:top"><img src="${escHtml(photo)}" width="84" height="84" alt="${escHtml(card.name)}" style="display:block;width:84px;height:84px;border-radius:42px;border:2px solid ${gold}"></td>` : '';
  const right = qr ? `<td style="padding:0 0 0 16px;vertical-align:top;border-left:1px solid #e5e7eb"><a href="${escHtml(link)}"><img src="${escHtml(qr)}" width="84" height="84" alt="QR code to save my contact" style="display:block;width:84px;height:84px"></a><div style="${font}font-size:9px;color:#6b7280;text-align:center;padding-top:3px">Scan to save</div></td>` : '';
  const logoRow = logoSrc ? `<tr><td colspan="3" style="padding-top:10px"><img src="${escHtml(logoSrc)}" height="36" alt="${escHtml(card.company || 'Logo')}" style="display:block;height:36px;width:auto"></td></tr>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${left}`
    + `<td style="padding:0 ${qr ? 16 : 0}px 0 0;vertical-align:top">${nameBlock}<div style="width:40px;height:2px;background:${gold};margin:8px 0 6px;font-size:0;line-height:0">&nbsp;</div>`
    + `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows}</table><div style="padding-top:6px">${save}</div></td>${right}</tr>${logoRow}</table>`;
}

function signaturePlain(entry) {
  const c = entry.card;
  return [c.name, [c.title, c.company].filter(Boolean).join(', '), ...(c.phones || []).slice(0, 2).map((p) => p.value),
    (c.emails || [])[0]?.value, c.website, `Save my contact: ${entry.link}`].filter(Boolean).join('\n');
}

function signatureScreen(id) {
  const entry = typeof id === 'object' ? id : toolSubject(findCard(id));
  if (!entry) return missingScreen('That card is not in your account.');
  const card = entry.card;
  const opts = { style: 'classic', photo: Boolean(card.photo), qr: true, logo: Boolean(card.logo || entry.orgLogo) };
  const preview = h('div', { class: 'sig-preview' });
  const draw = () => { preview.innerHTML = signatureHtml(entry, opts); };
  const toggle = (label, key, disabled) => h('label', { class: 'check inline' },
    h('input', { type: 'checkbox', checked: opts[key], disabled, onchange: (e) => { opts[key] = e.target.checked; draw(); } }), h('span', {}, label));
  const styles = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Style' },
    ...[['classic', 'Classic'], ['compact', 'Compact']].map(([value, label]) => h('button', { type: 'button', 'aria-pressed': String(opts.style === value), onclick: (e) => {
      opts.style = value;
      styles.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      draw();
    } }, label)));
  const copyRich = async () => {
    const html = signatureHtml(entry, opts);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([signaturePlain(entry)], { type: 'text/plain' }) })]);
      toast('Signature copied. Paste it into your email signature settings.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(preview);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      toast(ok ? 'Signature copied. Paste it into your email signature settings.' : 'Select the signature above and copy it.');
    }
  };
  const download = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(card.name)} — email signature</title></head><body>${signatureHtml(entry, opts)}</body></html>`;
    saveBlob(new Blob([html], { type: 'text/html' }), `signature-${entry.username}${entry.slug ? '-' + entry.slug : ''}.htm`);
  };
  draw();
  const how = [
    ['Outlook (Windows and Mac)', 'Settings › Mail › Signatures (or File › Options › Mail › Signatures). Make a new signature and paste.'],
    ['Outlook on the web and new Outlook', 'Settings › Accounts › Signatures. Make a new signature, paste, and save.'],
    ['Gmail', 'Settings › See all settings › General › Signature › Create new. Paste, then Save changes at the bottom.'],
    ['Apple Mail on Mac', 'Mail › Settings › Signatures › +. Untick "Always match my default message font", then paste.'],
    ['iPhone Mail', 'Settings › Apps › Mail › Signature. Paste; the iPhone keeps the text and links.'],
  ];
  return h('div', { class: 'stack' },
    topbar('Email signature', '/'),
    h('section', { class: 'glass panel stack' },
      h('div', { class: 'row wrap' }, styles, h('span', { class: 'grow' }),
        toggle('Photo', 'photo', !card.photo), toggle('QR code', 'qr'), toggle('Logo', 'logo', !(card.logo || entry.orgLogo))),
      preview,
      h('button', { class: 'btn primary block', onclick: copyRich }, icon('copy'), 'Copy signature'),
      h('button', { class: 'btn block', onclick: download }, icon('download'), 'Download as a file (.htm)')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'How to add it'),
      ...how.map(([title, steps]) => h('details', { class: 'how' }, h('summary', {}, title), h('p', { class: 'small muted' }, steps)))));
}

function saveBlob(blob, filename) {
  if (native && native.saveFile) {
    const reader = new FileReader();
    reader.onload = () => native.saveFile(String(reader.result).split(',')[1], filename, blob.type);
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- video-call background ----------

// Video-call background colours: [key, name, card colour ('mono' for black, '' for the card's own), light paper].
const BACKGROUNDS = [
  ['navy', 'Midnight navy', '#2a5ba8', ''], ['company', 'Card colour', '', ''], ['black', 'Black', 'mono', ''],
  ['emerald', 'Emerald', '#1fa97a', ''], ['burgundy', 'Burgundy', '#b8344f', ''], ['sand', 'Sand', '#a8862e', '#f3ead8'], ['white', 'White', '#2a5ba8', '#ffffff'],
];

function backgroundScreen(id) {
  const entry = typeof id === 'object' ? id : toolSubject(findCard(id));
  if (!entry) return missingScreen('That card is not in your account.');
  const card = entry.card;
  const wanted = new URLSearchParams(location.search).get('colour');
  const opts = { colour: BACKGROUNDS.some(([k]) => k === wanted) ? wanted : 'navy', side: 'left', qr: true, details: true, logo: Boolean(card.logo || entry.orgLogo) };
  const holder = h('div', { class: 'bg-preview' });
  let canvas = null;
  let logoImg = null;
  const draw = async () => {
    if (opts.logo && !logoImg) logoImg = await loadImage(card.logo || entry.orgLogo).catch(() => null);
    const [, , accent, paper] = BACKGROUNDS.find(([k]) => k === opts.colour);
    const look = paper ? { theme: 'light', paper } : { theme: 'dark' };
    const shown = accent === 'mono' ? { ...card, style: 'mono' } : accent ? { ...card, accent, style: 'aurora' } : card;
    canvas = await drawCallBackground(shown, entry.link, { ...look, side: opts.side, details: opts.details,
      qr: opts.qr ? qrMatrix(entry.link) : null, logo: opts.logo ? logoImg : null });
    canvas.setAttribute('aria-label', 'Background preview');
    holder.replaceChildren(canvas);
  };
  const seg = (label, key, choices) => {
    const group = h('div', { class: 'segmented', role: 'group', 'aria-label': label },
      ...choices.map(([value, text]) => h('button', { type: 'button', 'aria-pressed': String(opts[key] === value), onclick: (e) => {
        opts[key] = value;
        group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        draw();
      } }, text)));
    return group;
  };
  const toggle = (label, key, disabled) => h('label', { class: 'check inline' },
    h('input', { type: 'checkbox', checked: opts[key], disabled, onchange: (e) => { opts[key] = e.target.checked; draw(); } }), h('span', {}, label));
  draw();
  return h('div', { class: 'stack' },
    topbar('Video-call background', '/'),
    h('section', { class: 'glass panel stack' },
      holder,
      h('div', { class: 'swatches bg-colours', role: 'group', 'aria-label': 'Colour' }, ...BACKGROUNDS.map(([k, label, accent, paper]) => h('button', {
        type: 'button', class: 'swatch', title: label, 'aria-label': label, 'aria-pressed': String(opts.colour === k),
        style: `background:${paper || (accent === 'mono' ? '#14171f' : accent || card.accent || '#2a5ba8')}`,
        onclick: (e) => { opts.colour = k; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); },
      }))),
      h('div', { class: 'row wrap' }, seg('Name on the', 'side', [['left', 'Left'], ['right', 'Right']])),
      h('div', { class: 'row wrap' }, toggle('QR code', 'qr'), toggle('Email and phone', 'details'), toggle('Logo', 'logo', !(card.logo || entry.orgLogo))),
      h('button', { class: 'btn primary block', onclick: () => canvas && canvas.toBlob((blob) => saveBlob(blob, `background-${entry.username}${entry.slug ? '-' + entry.slug : ''}-${opts.colour}.jpg`), 'image/jpeg', 0.92) },
        icon('download'), 'Download (1920 × 1080)')),
    h('section', { class: 'glass panel stack' }, h('h2', {}, 'How to use it'),
      h('p', { class: 'small muted' }, 'Zoom: Settings › Backgrounds & effects › + › Add image. Teams: before or during a meeting, Effects › Backgrounds › Add new. Google Meet: Apply visual effects › Backgrounds › Upload. Webex: Change virtual background › +.'),
      h('p', { class: 'small muted' }, 'Your own preview may look mirrored; the people in the call see the text the right way round.')));
}

// The iPhone app hands back scans made with its own camera.
window.MKCards = window.MKCards || {};
window.MKCards.scanned = (result) => {
  if (location.pathname !== '/scan') go('/scan');
  if (scanHandler) scanHandler(result);
};

// ---------- printed business cards: design editor, print page, staff download ----------

let printEngine = null;
const loadPrintEngine = () => printEngine || (printEngine = import('/print-engine.js'));
const pid = () => Math.random().toString(36).slice(2, 10);
const PRINT_ELEMENTS = { text: 'Text field', lines: 'Contact lines', qr: 'QR code', logo: 'Company logo', photo: 'Photo', rect: 'Colour block' };
const CARD_SIZES = [['85x55', '85 × 55 mm (UAE / ISO)'], ['90x55', '90 × 55 mm'], ['89x51', '88.9 × 50.8 mm (US 3.5 × 2 in)'], ['90x50', '90 × 50 mm'], ['custom', 'Custom size']];

function defaultPrintLayout() {
  const T = { font: 'sans', weight: 400, color: '#1f2328', align: 'left', fit: true, spacing: 0 };
  return {
    size: { w: 85, h: 55 }, bleed: 3, elements: [
      { id: pid(), side: 'front', type: 'rect', x: -3, y: -3, w: 91, h: 13, color: '#0f2343', radius: 0 },
      { id: pid(), side: 'front', type: 'rect', x: -3, y: 10, w: 91, h: 0.6, color: '#b0892f', radius: 0 },
      { id: pid(), side: 'front', type: 'logo', x: 6, y: 1.5, w: 22, h: 7 },
      { id: pid(), side: 'front', type: 'text', ...T, field: 'company', x: 34, y: 3.2, w: 45, h: 4, size: 6.5, weight: 700, color: '#ffffff', align: 'right', upper: true, spacing: 0.12 },
      { id: pid(), side: 'front', type: 'text', ...T, field: 'name', x: 6, y: 17, w: 73, h: 5, size: 12, weight: 700, font: 'serif', color: '#0f2343' },
      { id: pid(), side: 'front', type: 'text', ...T, field: 'title', x: 6, y: 23.5, w: 73, h: 4, size: 7.5, color: '#4a5672' },
      { id: pid(), side: 'front', type: 'lines', ...T, x: 6, y: 34, w: 60, h: 14, size: 6.5, lineHeight: 1.45,
        lines: [{ field: 'mobile', prefix: 'M  ' }, { field: 'office', prefix: 'T  ' }, { field: 'email', prefix: 'E  ' }, { field: 'website', prefix: 'W  ' }] },
      { id: pid(), side: 'back', type: 'rect', x: -3, y: -3, w: 91, h: 61, color: '#0f2343', radius: 0 },
      { id: pid(), side: 'back', type: 'rect', x: 29.5, y: 10, w: 26, h: 26, color: '#ffffff', radius: 2 },
      { id: pid(), side: 'back', type: 'qr', x: 31.5, y: 12, w: 22, h: 22, color: '#0f2343', target: 'card' },
      { id: pid(), side: 'back', type: 'text', ...T, field: 'static', text: 'Scan to save my contact', x: 6, y: 39, w: 73, h: 4, size: 6.5, color: '#d5b757', align: 'center' },
      { id: pid(), side: 'back', type: 'text', ...T, field: 'card_url', x: 6, y: 45, w: 73, h: 4, size: 6, color: '#ffffff', align: 'center' },
    ],
  };
}

const SAMPLE_CARD = {
  id: '', label: 'Sample', link: `${location.origin}/sara-haddad`, vcardLink: `${location.origin}/api/public/vcard?u=sara-haddad&s=`,
  card: { name: 'Sara Haddad', title: 'Senior Procurement Manager', department: 'Procurement', company: '',
    phones: [{ label: 'mobile', value: '+971 50 123 4567' }, { label: 'work', value: '+971 4 555 0100' }], emails: [{ value: 'sara.haddad@company.example' }],
    website: 'https://company.example', address: 'Dubai, United Arab Emirates', links: [{ type: 'linkedin', url: 'https://www.linkedin.com/in/sara' }],
    ar: { name: 'سارة حداد', title: 'مديرة المشتريات', department: 'المشتريات', address: 'دبي، الإمارات العربية المتحدة' } },
};

async function urlToDataUrl(E, url) {
  try { const r = await fetch(url, { credentials: 'same-origin' }); return r.ok ? await E.blobToDataUrl(await r.blob()) : null; } catch { return null; }
}

/** Loads the company's design: layout, brand fonts, artwork and logo. */
async function loadPrintSetup() {
  const E = await loadPrintEngine();
  const P = await api('/print');
  P.fresh = !P.layout;
  P.layout = P.layout || defaultPrintLayout();
  const fonts = {};
  for (const [slot, weight] of [['regular', 400], ['bold', 700]]) {
    if (!P.files[slot]) continue;
    const r = await fetch(`/api/print/font/${slot}?v=${P.files[slot].v}`, { credentials: 'same-origin' });
    if (r.ok) fonts[weight] = await r.arrayBuffer();
  }
  await E.setBrandFonts(fonts);
  P.art = {};
  for (const side of ['front', 'back']) {
    if (!P.files[side]) continue;
    try { P.art[side] = await loadPrintArt(E, side, P.files[side]); } catch (err) { P.artError = err.message; }
  }
  P.logo = P.org.logo ? await urlToDataUrl(E, P.org.logo) : null;
  return { E, P };
}

async function loadPrintArt(E, side, meta) {
  const r = await fetch(`/api/print/art/${side}?v=${meta.v}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`The ${side} artwork could not be loaded.`);
  const blob = await r.blob();
  return E.prepareArt({ mime: meta.type, data: meta.type === 'image/svg+xml' ? await blob.text() : await E.blobToDataUrl(blob) });
}

async function printContext(E, P, entry) {
  const c = entry || SAMPLE_CARD;
  return { card: c.card, link: c.link, vcardLink: c.vcardLink, org: P.org, art: P.art,
    images: { logo: P.logo, photo: c.card.photo ? await urlToDataUrl(E, c.card.photo) : null } };
}

async function renderPrintCard(E, P, entry, cropMarks = true) {
  const ctx = await printContext(E, P, entry);
  const [front, back] = [await E.renderSide(P.layout, 'front', ctx, { cropMarks }), await E.renderSide(P.layout, 'back', ctx, { cropMarks })];
  const person = entry ? entry.card.name : 'sample';
  return { front, back, base: `${E.fileSafe(person)}${entry && entry.slug ? '-' + E.fileSafe(entry.slug) : ''}` };
}

const svgBlobUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

function printPreviewSheet(title, r) {
  const fu = svgBlobUrl(r.front.svg), bu = svgBlobUrl(r.back.svg);
  sheet((close) => [
    h('h1', {}, title),
    h('p', { class: 'muted small' }, 'Print-ready SVG in millimetres, with bleed and crop marks. All text is converted to outlines, so the printer needs no fonts.'),
    ...[...new Set([...r.front.warnings, ...r.back.warnings])].map((w) => h('p', { class: 'notice small' }, w)),
    h('div', { class: 'pp-pair' },
      h('figure', {}, h('img', { src: fu, alt: 'Front' }), h('figcaption', {}, 'Front')),
      h('figure', {}, h('img', { src: bu, alt: 'Back' }), h('figcaption', {}, 'Back'))),
    h('div', { class: 'row wrap' },
      h('a', { class: 'btn grow', href: fu, download: `${r.base}-front.svg` }, icon('download'), 'Front SVG'),
      h('a', { class: 'btn grow', href: bu, download: `${r.base}-back.svg` }, icon('download'), 'Back SVG')),
    h('button', { class: 'btn primary block', onclick: async () => {
      const E = await loadPrintEngine();
      saveBlob(E.zip({ [`${r.base}-front.svg`]: r.front.svg, [`${r.base}-back.svg`]: r.back.svg }), `${r.base}-print-card.zip`);
    } }, icon('download'), 'Front + back (ZIP)'),
    h('button', { class: 'btn block', onclick: close }, 'Close'),
  ]);
}

/** A staff member downloads their own print card, when the company allows it. */
async function myPrintCard(entry) {
  const waiting = toast('Preparing your print card…');
  try {
    const { E, P } = await loadPrintSetup();
    const mine = P.staff.flatMap((s) => s.cards).find((c) => c.id === entry.id);
    if (!mine) throw new Error('This card is not part of your company\'s print design.');
    const r = await renderPrintCard(E, P, mine);
    waiting.remove();
    printPreviewSheet(`Print card — ${entry.card.label || entry.card.name}`, r);
  } catch (err) {
    waiting.remove();
    toast(err.message);
  }
}

// The design editor.
function designScreen() {
  if (!me.user.org || me.user.org.role === 'member') return missingScreen('Only company administrators can edit the card design.', 'Card design');
  const root = h('div', { class: 'stack wide-stack' }, h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading the design…')));
  (async () => {
    let E, P;
    try { ({ E, P } = await loadPrintSetup()); } catch (err) { root.replaceChildren(h('section', { class: 'glass panel' }, h('p', { class: 'error' }, err.message))); return; }
    const L = P.layout;
    let allowStaff = P.allowStaff, side = 'front', sel = null, dirty = P.fresh, who = '';
    const people = P.staff.flatMap((s) => s.cards.map((c) => ({ key: c.id, s, c })));
    const saveBtn = h('button', { class: `btn primary${dirty ? ' pulse' : ''}`, onclick: () => save() }, icon('check'), 'Save design');
    const mark = () => { if (!dirty) { dirty = true; saveBtn.classList.add('pulse'); } };
    window.onbeforeunload = () => (dirty ? true : null);

    const stage = h('div', { class: 'dz-stage', tabindex: '0', 'aria-label': 'Card layout' });
    const artImg = h('img', { class: 'dz-art-img', alt: '', hidden: true });
    const textImg = h('img', { class: 'dz-text-img', alt: '' });
    const handles = h('div', { class: 'dz-handles' });
    stage.append(artImg, textImg, handles);
    const warnBox = h('div', { class: 'stack' });
    const props = h('section', { class: 'glass panel stack' });
    const sideTabs = h('div', { class: 'segmented' }, ...['front', 'back'].map((s) => h('button', { type: 'button', 'aria-pressed': String(s === side), onclick: () => { sel = null; setSide(s); } }, s === 'front' ? 'Front' : 'Back')));
    const whoSel = h('select', { class: 'input dz-who', 'aria-label': 'Preview with', onchange: (e) => { who = e.target.value; render(); } },
      h('option', { value: '' }, 'Preview: sample person'), ...people.map((p) => h('option', { value: p.key }, `Preview: ${p.s.name || p.s.username}${p.s.cards.length > 1 ? ' — ' + p.c.label : ''}`)));
    const els = () => L.elements.filter((e) => e.side === side);
    const cur = () => L.elements.find((e) => e.id === sel);
    const label = (e) => (e.type === 'text' ? (e.field === 'static' ? e.text || 'Fixed text' : E.FIELDS[e.field])
      : e.type === 'lines' ? `Contact lines: ${(e.lines || []).map((l) => E.FIELDS[l.field]).join(', ') || 'empty'}` : PRINT_ELEMENTS[e.type]);
    const pct = (v, total) => `${(v / total) * 100}%`;

    let busy = false, again = false, boxes = [];
    const render = async () => {
      if (busy) { again = true; return; }
      busy = true;
      try {
        const W = L.size.w, H = L.size.h, B = L.bleed;
        stage.style.aspectRatio = `${W + 2 * B} / ${H + 2 * B}`;
        const art = P.art[side];
        if (art) {
          const a = E.artBox(art, W, H, B);
          const key = side + (P.files[side] || {}).v;
          if (artImg.dataset.k !== key) {
            artImg.src = art.kind === 'svg' ? svgBlobUrl(art.svg) : art.url;
            artImg.dataset.k = key;
          }
          Object.assign(artImg.style, { left: pct(a.x + B, W + 2 * B), top: pct(a.y + B, H + 2 * B), width: pct(a.w, W + 2 * B), height: pct(a.h, H + 2 * B) });
          artImg.hidden = false;
        } else artImg.hidden = true;
        const entry = people.find((p) => p.key === who);
        const r = await E.renderSide(L, side, await printContext(E, P, entry && entry.c), { withArt: false, guides: true });
        const old = textImg.src;
        textImg.src = svgBlobUrl(r.svg);
        if (old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1000);
        boxes = r.boxes;
        const warns = [...r.warnings];
        if (art && E.artBox(art, W, H, B).noBleed) warns.unshift(`The ${side} artwork has no bleed, so it sits on the trim. Ask your designer for a ${W + 2 * B} × ${H + 2 * B} mm version so no white shows after cutting.`);
        if (P.artError) warns.push(P.artError);
        warnBox.replaceChildren(...warns.map((w) => h('p', { class: 'notice small' }, w)));
        drawHandles();
      } catch (err) { toast(err.message || 'The preview could not be drawn.'); }
      finally { busy = false; if (again) { again = false; render(); } }
    };
    const drawHandles = () => {
      const W = L.size.w + 2 * L.bleed, H = L.size.h + 2 * L.bleed, B = L.bleed;
      handles.replaceChildren(...els().map((e) => {
        const bx = boxes.find((b) => b.id === e.id) || {};
        const hh = e.type === 'text' || e.type === 'lines' ? bx.h || 4 : e.type === 'qr' ? e.w : e.h;
        return h('div', { class: `dz-h${e.id === sel ? ' on' : ''}${bx.empty ? ' empty' : ''}`, 'data-h': e.id, title: label(e),
          style: `left:${pct(e.x + B, W)};top:${pct(e.y + B, H)};width:${pct(e.w, W)};height:${pct(hh, H)}` },
        bx.empty && h('span', { class: 'dz-ph' }, label(e)), h('i', { class: 'dz-grip', 'data-grip': '' }));
      }));
    };

    // ----- properties -----
    const num = (key, lab, e, step = 0.5, extra = {}) => h('label', { class: 'field' }, h('span', {}, lab),
      h('input', { class: 'input', type: 'number', step, value: e[key] ?? 0, ...extra, oninput: (ev) => { const v = parseFloat(ev.target.value); if (!Number.isFinite(v)) return; e[key] = v; if (e.type === 'qr' && key === 'w') e.h = v; update(); } }));
    const select = (lab, value, options, onset) => h('label', { class: 'field' }, h('span', {}, lab),
      h('select', { class: 'input', onchange: (ev) => onset(ev.target.value) }, ...options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l))));
    const fieldOptions = () => Object.entries(E.FIELDS);
    const typography = (e) => [
      h('div', { class: 'grid2' },
        select('Font', e.font, [['sans', 'Sans (Inter / Noto Kufi)'], ['serif', 'Serif (Noto Serif / Naskh)'], ...(P.files.regular || P.files.bold ? [['brand', `Brand font (${(P.files.regular || P.files.bold).name})`]] : [])], (v) => { e.font = v; update(); }),
        select('Weight', e.weight, [[400, 'Regular'], [700, 'Bold']], (v) => { e.weight = Number(v); update(); })),
      h('div', { class: 'grid3' }, num('size', 'Size (pt)', e, 0.5, { min: 3, max: 72 }),
        h('label', { class: 'field' }, h('span', {}, 'Colour'), h('input', { class: 'input dz-color', type: 'color', value: e.color || '#000000', oninput: (ev) => { e.color = ev.target.value; update(); } })),
        num('spacing', 'Tracking', e, 0.01, { min: -0.1, max: 0.6 })),
      h('div', { class: 'segmented' }, ...['left', 'center', 'right'].map((a) => h('button', { type: 'button', 'aria-pressed': String((e.align || 'left') === a), onclick: () => { e.align = a; drawProps(); update(); } }, a[0].toUpperCase() + a.slice(1)))),
      h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: Boolean(e.upper), onchange: (ev) => { e.upper = ev.target.checked; update(); } }), h('span', {}, 'Capitals')),
      h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: e.fit !== false, onchange: (ev) => { e.fit = ev.target.checked; update(); } }), h('span', {}, 'Shrink long text to fit the width')),
    ];
    const drawProps = () => {
      const e = cur();
      if (!e) {
        props.replaceChildren(h('h2', {}, 'Fields'),
          h('p', { class: 'small muted' }, 'Click a field on the card to edit it, drag it to move, drag its corner to resize. Arrow keys nudge it by 0.25 mm (with Shift: 1 mm).'),
          ...(els().length ? els().map((x) => h('button', { class: 'dz-li', onclick: () => pick(x.id) }, h('strong', {}, PRINT_ELEMENTS[x.type]), h('small', { class: 'muted' }, label(x))))
            : [h('p', { class: 'small muted' }, 'Nothing on this side yet. Add fields below the card.')]));
        return;
      }
      const parts = [
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, PRINT_ELEMENTS[e.type]),
          h('button', { class: 'btn small', title: 'Duplicate', onclick: () => { const c = { ...JSON.parse(JSON.stringify(e)), id: pid(), x: e.x + 2, y: e.y + 2 }; L.elements.push(c); pick(c.id); update(); } }, icon('copy')),
          h('button', { class: 'btn small danger', title: 'Remove', onclick: () => { L.elements = L.elements.filter((x) => x !== e); sel = null; drawProps(); update(); } }, icon('trash')),
          h('button', { class: 'btn small', title: 'Done', onclick: () => { sel = null; drawHandles(); drawProps(); } }, icon('check'))),
      ];
      if (e.type === 'text') {
        parts.push(select('Shows', e.field, fieldOptions(), (v) => { e.field = v; if (/_ar$/.test(v)) e.align = 'right'; drawProps(); update(); }));
        parts.push(e.field === 'static'
          ? h('label', { class: 'field' }, h('span', {}, 'Text'), h('input', { class: 'input', value: e.text || '', dir: 'auto', maxlength: 200, oninput: (ev) => { e.text = ev.target.value; update(); } }))
          : h('label', { class: 'field' }, h('span', {}, 'Before the value (optional)'), h('input', { class: 'input', value: e.prefix || '', maxlength: 24, placeholder: 'e.g. M  or  T: ', oninput: (ev) => { e.prefix = ev.target.value; update(); } })));
      }
      if (e.type === 'lines') {
        parts.push(h('p', { class: 'small muted' }, 'Lines with nothing in them are left out and the rest close up.'),
          ...e.lines.map((l, i) => h('div', { class: 'row dz-line' },
            h('select', { class: 'input grow', onchange: (ev) => { l.field = ev.target.value; drawProps(); update(); } }, ...fieldOptions().map(([v, n]) => h('option', { value: v, selected: v === l.field }, n))),
            l.field === 'static'
              ? h('input', { class: 'input grow', value: l.text || '', placeholder: 'Text', dir: 'auto', oninput: (ev) => { l.text = ev.target.value; update(); } })
              : h('input', { class: 'input dz-prefix', value: l.prefix || '', placeholder: 'Prefix', maxlength: 24, oninput: (ev) => { l.prefix = ev.target.value; update(); } }),
            h('button', { class: 'btn small icon-only', 'aria-label': 'Remove line', onclick: () => { e.lines.splice(i, 1); drawProps(); update(); } }, icon('x')))),
          e.lines.length < 10 && h('button', { class: 'btn small', onclick: () => { e.lines.push({ field: 'website', prefix: '' }); drawProps(); update(); } }, icon('plus'), 'Add line'),
          num('lineHeight', 'Line spacing', e, 0.05, { min: 0.8, max: 3 }));
      }
      if (e.type === 'text' || e.type === 'lines') parts.push(...typography(e));
      if (e.type === 'qr') {
        parts.push(select('Opens', e.target, [['card', 'Their card page'], ['vcard', 'Save their contact directly']], (v) => { e.target = v; update(); }),
          h('label', { class: 'field' }, h('span', {}, 'Colour'), h('input', { class: 'input dz-color', type: 'color', value: e.color || '#000000', oninput: (ev) => { e.color = ev.target.value; update(); } })),
          h('p', { class: 'small muted' }, 'Keep the QR code on a light, plain background with 2 mm of clear space around it. 18 mm or larger scans best.'));
      }
      if (e.type === 'photo') parts.push(select('Shape', e.shape, [['circle', 'Circle'], ['square', 'Rectangle']], (v) => { e.shape = v; update(); }),
        h('p', { class: 'small muted' }, 'Uses the photo on each person\'s card; left empty for people without one.'));
      if (e.type === 'logo') parts.push(h('p', { class: 'small muted' }, 'Uses the company logo from Company settings. For the sharpest print, put the logo in the artwork instead.'));
      if (e.type === 'rect') parts.push(h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, 'Colour'), h('input', { class: 'input dz-color', type: 'color', value: e.color || '#13315c', oninput: (ev) => { e.color = ev.target.value; update(); } })),
        num('radius', 'Corner (mm)', e, 0.5, { min: 0 })));
      parts.push(h('div', { class: 'grid4' }, num('x', 'X (mm)', e, 0.25), num('y', 'Y (mm)', e, 0.25), num('w', e.type === 'qr' ? 'Size (mm)' : 'Width (mm)', e),
        ['logo', 'photo', 'rect'].includes(e.type) ? num('h', 'Height (mm)', e) : null),
      h('button', { class: 'btn small', onclick: () => { e.side = e.side === 'front' ? 'back' : 'front'; setSide(e.side); update(); } }, `Move to the ${e.side === 'front' ? 'back' : 'front'}`));
      props.replaceChildren(...parts.filter(Boolean));
    };
    const update = () => { mark(); render(); };
    const setSide = (s) => {
      side = s;
      sideTabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'front' : 'back') === s)));
      render(); drawProps(); drawFiles();
    };
    const pick = (id) => { sel = id; const e = cur(); if (e && e.side !== side) setSide(e.side); drawHandles(); drawProps(); };

    const addBar = h('div', { class: 'row wrap dz-add' }, h('span', { class: 'small muted' }, 'Add to this side:'),
      ...Object.entries(PRINT_ELEMENTS).map(([k, n]) => h('button', { class: 'btn small', onclick: () => {
        const T = { font: 'sans', weight: 400, size: 8, color: '#1f2328', align: 'left', fit: true, spacing: 0 };
        const extra = { text: { ...T, field: 'name', w: 50, h: 5 }, lines: { ...T, size: 6.5, w: 50, h: 10, lineHeight: 1.4, lines: [{ field: 'mobile', prefix: 'M  ' }, { field: 'email', prefix: 'E  ' }] },
          qr: { w: 20, h: 20, color: '#000000', target: 'card' }, logo: { w: 28, h: 11 }, photo: { w: 16, h: 16, shape: 'circle' }, rect: { w: 30, h: 4, color: '#13315c', radius: 0 } }[k];
        const el = { id: pid(), side, type: k, x: 8, y: 8, ...extra };
        L.elements.push(el); pick(el.id); update();
      } }, icon('plus'), n)));

    // ----- card size -----
    const sizeKey = () => (CARD_SIZES.find(([k]) => k !== 'custom' && k === `${Math.round(L.size.w)}x${Math.round(L.size.h)}`) || ['custom'])[0];
    const wIn = h('input', { class: 'input', type: 'number', step: 0.1, value: L.size.w, onchange: (ev) => { L.size.w = Math.min(220, Math.max(30, +ev.target.value || 85)); syncSize(); update(); } });
    const hIn = h('input', { class: 'input', type: 'number', step: 0.1, value: L.size.h, onchange: (ev) => { L.size.h = Math.min(220, Math.max(30, +ev.target.value || 55)); syncSize(); update(); } });
    const sizeSel = h('select', { class: 'input', onchange: (ev) => { const v = ev.target.value; if (v === 'custom') return; const [w, hh] = v === '89x51' ? [88.9, 50.8] : v.split('x').map(Number); L.size = { w, h: hh }; syncSize(); update(); } },
      ...CARD_SIZES.map(([k, n]) => h('option', { value: k, selected: k === sizeKey() }, n)));
    const syncSize = () => { wIn.value = L.size.w; hIn.value = L.size.h; sizeSel.value = sizeKey(); artSize.textContent = artSizeText(); };
    const artSizeText = () => `${+(L.size.w + 2 * L.bleed).toFixed(1)} × ${+(L.size.h + 2 * L.bleed).toFixed(1)} mm (${Math.round(((L.size.w + 2 * L.bleed) / 25.4) * 300)} × ${Math.round(((L.size.h + 2 * L.bleed) / 25.4) * 300)} px at 300 dpi)`;
    const artSize = h('strong', {}, '');

    // ----- artwork and fonts -----
    const files = h('div', { class: 'stack' });
    const fonts = h('div', { class: 'stack' });
    const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    const fileRow = (key, title, accept, onfile) => {
      const meta = P.files[key];
      const input = h('input', { type: 'file', accept, hidden: true, onchange: (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) onfile(f); } });
      return h('div', { class: 'row dz-file' }, input,
        h('span', { class: 'grow' }, h('strong', {}, title), h('small', { class: 'muted block' }, meta ? `${meta.name} · ${kb(meta.bytes)}` : 'Not uploaded')),
        h('button', { class: 'btn small', onclick: () => input.click() }, icon('upload'), meta ? 'Replace' : 'Upload'),
        meta ? h('button', { class: 'btn small danger icon-only', 'aria-label': `Remove ${title}`, onclick: async () => {
          try {
            P.files = (await api(`/print/${key === 'regular' || key === 'bold' ? 'font' : 'art'}/${key}`, { method: 'DELETE' })).files;
            if (key === 'front' || key === 'back') delete P.art[key]; else await reloadFonts();
            drawFiles(); render(); toast('Removed');
          } catch (err) { toast(err.message); }
        } }, icon('trash')) : null);
    };
    const reloadFonts = async () => {
      const map = {};
      for (const [slot, weight] of [['regular', 400], ['bold', 700]]) if (P.files[slot]) {
        const r = await fetch(`/api/print/font/${slot}?v=${P.files[slot].v}`, { credentials: 'same-origin' });
        if (r.ok) map[weight] = await r.arrayBuffer();
      }
      await E.setBrandFonts(map);
    };
    const drawFiles = () => {
      files.replaceChildren(...['front', 'back'].map((s) => fileRow(s, s === 'front' ? 'Front artwork' : 'Back artwork', '.svg,image/svg+xml,image/png,image/jpeg', async (f) => {
        if (!/^image\/(svg\+xml|png|jpeg)$/.test(f.type)) return toast('Use an SVG, PNG or JPG file.');
        if (f.size > 2e6) return toast('That file is over 2 MB. Save pictures as JPG at 300 dpi, or compress the images inside the SVG.');
        try {
          const data = await E.blobToDataUrl(f);
          const prepared = await E.prepareArt({ mime: f.type, data: f.type === 'image/svg+xml' ? await f.text() : data });
          toast('Uploading artwork…');
          P.files = (await api(`/print/art/${s}`, { method: 'PUT', body: { data, name: f.name } })).files;
          P.art[s] = prepared;
          drawFiles(); setSide(s); toast('Artwork uploaded');
        } catch (err) { toast(err.message); }
      })));
      fonts.replaceChildren(...[['regular', 'Regular'], ['bold', 'Bold']].map(([k, n]) => fileRow(k, `${n} weight`, '.ttf,.otf,font/ttf,font/otf', async (f) => {
        if (!/\.(ttf|otf)$/i.test(f.name)) return toast('Use a .ttf or .otf font file.');
        if (f.size > 1.5e6) return toast('That font file is over 1.5 MB.');
        try {
          toast('Uploading font…');
          P.files = (await api(`/print/font/${k}`, { method: 'PUT', body: { data: await E.blobToDataUrl(f), name: f.name } })).files;
          await reloadFonts();
          drawFiles(); drawProps(); render(); toast('Brand font uploaded. Choose "Brand font" on a field to use it.');
        } catch (err) { toast(err.message); }
      })));
    };

    // ----- drag, resize, nudge -----
    let drag = null;
    stage.addEventListener('pointerdown', (ev) => {
      const hd = ev.target.closest('[data-h]');
      if (!hd) { if (sel) { sel = null; drawHandles(); drawProps(); } return; }
      const e = L.elements.find((x) => x.id === hd.dataset.h);
      if (!e) return;
      if (sel !== e.id) pick(e.id);
      ev.preventDefault();
      stage.focus({ preventScroll: true });
      const r = stage.getBoundingClientRect();
      drag = { e, grip: Boolean(ev.target.closest('[data-grip]')), x0: ev.clientX, y0: ev.clientY, ex: e.x, ey: e.y, ew: e.w, eh: e.h, mm: (L.size.w + 2 * L.bleed) / r.width, moved: false };
      stage.setPointerCapture(ev.pointerId);
    });
    const snap = (v, free) => (free ? Math.round(v * 100) / 100 : Math.round(v * 4) / 4);
    stage.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const dx = (ev.clientX - drag.x0) * drag.mm, dy = (ev.clientY - drag.y0) * drag.mm, e = drag.e;
      if (Math.abs(dx) + Math.abs(dy) > 0.1) drag.moved = true;
      if (drag.grip) {
        e.w = Math.max(2, snap(drag.ew + dx, ev.altKey));
        if (e.type === 'qr') e.h = e.w;
        else if (!['text', 'lines'].includes(e.type)) e.h = Math.max(1, snap(drag.eh + dy, ev.altKey));
      } else { e.x = snap(drag.ex + dx, ev.altKey); e.y = snap(drag.ey + dy, ev.altKey); }
      drawHandles(); render();
    });
    const endDrag = () => { if (drag && drag.moved) { mark(); drawProps(); } drag = null; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('keydown', (ev) => {
      const e = cur();
      if (!e) return;
      const d = ev.shiftKey ? 1 : 0.25;
      const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[ev.key];
      if (k) { ev.preventDefault(); e.x = Math.round((e.x + k[0]) * 100) / 100; e.y = Math.round((e.y + k[1]) * 100) / 100; drawProps(); update(); }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); L.elements = L.elements.filter((x) => x !== e); sel = null; drawProps(); update(); }
    });

    const save = async () => {
      saveBtn.disabled = true;
      try {
        const res = await api('/print/layout', { method: 'PUT', body: { layout: L, allowStaff } });
        L.size = res.layout.size;
        dirty = false; saveBtn.classList.remove('pulse'); toast('Design saved. Every card in the company now uses it.');
      } catch (err) { toast(err.message); }
      saveBtn.disabled = false;
    };

    root.replaceChildren(...[
      h('header', { class: 'page-head' },
        h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, h('a', { href: '/admin' }, 'Admin'), ` · ${P.org.name}`), h('h1', {}, 'Card design'),
          h('p', { class: 'muted' }, `One fixed design for every ${P.org.name} card. Upload the artwork, then place the fields: each person's details are filled in automatically.`)),
        h('div', { class: 'head-actions' }, h('a', { class: 'btn', href: '/admin/print' }, icon('download'), 'Print cards'), saveBtn)),
      P.fresh && h('p', { class: 'notice' }, 'This is a starting layout. Upload your artwork, move the fields to match it, then save.'),
      h('div', { class: 'dz' },
        h('div', { class: 'stack dz-main' },
          h('section', { class: 'glass panel stack' },
            h('div', { class: 'row wrap' }, sideTabs, h('span', { class: 'grow' }), whoSel),
            h('div', { class: 'dz-stage-wrap' }, stage),
            h('p', { class: 'small muted dz-legend' }, h('span', { class: 'lg trim' }), ' Trim (cut line)  ', h('span', { class: 'lg safe' }), ' Safe area: keep text inside  ', h('span', { class: 'lg bleed' }), ' Bleed: artwork should fill to the edge'),
            warnBox, addBar)),
        h('aside', { class: 'stack dz-side' },
          props,
          h('section', { class: 'glass panel stack' }, h('h2', {}, 'Card'),
            h('label', { class: 'field' }, h('span', {}, 'Size'), sizeSel),
            h('div', { class: 'grid3' }, h('label', { class: 'field' }, h('span', {}, 'Width (mm)'), wIn), h('label', { class: 'field' }, h('span', {}, 'Height (mm)'), hIn),
              h('label', { class: 'field' }, h('span', {}, 'Bleed (mm)'), h('input', { class: 'input', type: 'number', step: 0.5, min: 0, max: 6, value: L.bleed, onchange: (ev) => { L.bleed = Math.min(6, Math.max(0, +ev.target.value || 0)); syncSize(); update(); } }))),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: allowStaff, onchange: (ev) => { allowStaff = ev.target.checked; mark(); } }),
              h('span', {}, h('strong', {}, 'Staff can download their own print card'), h('small', { class: 'muted block' }, 'From the card menu in their account.')))),
          h('section', { class: 'glass panel stack' }, h('h2', {}, 'Artwork'),
            h('p', { class: 'small muted' }, 'SVG is best (it stays sharp); PNG or JPG at 300 dpi also work. Make it at full bleed size: ', artSize, '. Turn any text in the artwork into outlines.'), files),
          h('section', { class: 'glass panel stack' }, h('h2', {}, 'Brand font'),
            h('p', { class: 'small muted' }, 'Optional. Upload your company typeface (.ttf or .otf) and choose "Brand font" on any field. Arabic text uses the brand font if it has Arabic letters, otherwise Noto Kufi. Make sure the font licence allows printing.'), fonts))),
    ].filter(Boolean));
    syncSize(); drawFiles(); drawProps(); render();
  })();
  return root;
}

// The print page: everyone's cards, filled in, ready to download.
function printScreen() {
  if (!me.user.org || me.user.org.role === 'member') return missingScreen('Only company administrators can print everyone\'s cards.', 'Print cards');
  const root = h('div', { class: 'stack wide-stack' }, h('section', { class: 'glass panel' }, h('p', { class: 'muted' }, 'Loading…')));
  (async () => {
    let E, P;
    try { ({ E, P } = await loadPrintSetup()); } catch (err) { root.replaceChildren(h('section', { class: 'glass panel' }, h('p', { class: 'error' }, err.message))); return; }
    const entries = P.staff.flatMap((s) => s.cards.filter((c) => c.active).map((c) => ({ s, c })));
    const chosen = new Set(entries.filter((x) => x.c.slug === '').map((x) => x.c.id));
    let crop = true;
    const count = h('span', { class: 'muted small' });
    const showCount = () => { count.textContent = `${chosen.size} of ${entries.length} cards selected`; };
    const progress = h('p', { class: 'muted small', hidden: true });
    const list = h('div', { class: 'member-list' }, ...entries.map(({ s, c }) => h('div', { class: 'row print-row' },
      h('input', { type: 'checkbox', checked: chosen.has(c.id), 'aria-label': `Include ${s.name}`, onchange: (ev) => { if (ev.target.checked) chosen.add(c.id); else chosen.delete(c.id); showCount(); } }),
      h('span', { class: 'grow' }, h('strong', { dir: 'auto' }, c.card.name || s.username), h('small', { class: 'muted block' }, [c.card.title, c.label].filter(Boolean).join(' · '))),
      h('button', { class: 'btn small', onclick: async () => { try { printPreviewSheet(`Print card — ${c.card.name}`, await renderPrintCard(E, P, c, crop)); } catch (err) { toast(err.message); } } }, icon('qr'), 'Preview'))));
    const downloadAll = h('button', { class: 'btn primary', onclick: async () => {
      if (!chosen.size) return toast('Choose at least one card.');
      downloadAll.disabled = true; progress.hidden = false;
      try {
        const files = {};
        let i = 0;
        for (const { c } of entries.filter((x) => chosen.has(x.c.id))) {
          progress.textContent = `Preparing ${++i} of ${chosen.size}…`;
          const r = await renderPrintCard(E, P, c, crop);
          files[`front/${r.base}-front.svg`] = r.front.svg;
          files[`back/${r.base}-back.svg`] = r.back.svg;
        }
        saveBlob(E.zip(files), `${E.fileSafe(P.org.name)}-print-cards.zip`);
        progress.textContent = `Done: ${chosen.size} card${chosen.size === 1 ? '' : 's'}, front and back.`;
      } catch (err) { toast(err.message); progress.hidden = true; }
      downloadAll.disabled = false;
    } }, icon('download'), 'Download selected (SVG, ZIP)');
    showCount();
    root.replaceChildren(...[
      h('header', { class: 'page-head' },
        h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, h('a', { href: '/admin' }, 'Admin'), ` · ${P.org.name}`), h('h1', {}, 'Print cards'),
          h('p', { class: 'muted' }, `Each person's details are filled into the ${P.org.name} design: ${P.layout.size.w} × ${P.layout.size.h} mm with ${P.layout.bleed} mm bleed. Text is turned into outlines, so the printer needs no fonts.`)),
        h('div', { class: 'head-actions' }, h('a', { class: 'btn', href: '/admin/design' }, icon('edit'), 'Edit design'), downloadAll)),
      P.fresh && h('p', { class: 'notice' }, h('span', {}, 'No design has been saved yet, so MK Cards\' starting design is used. '), h('a', { href: '/admin/design' }, 'Set up your design')),
      h('section', { class: 'glass panel stack' },
        h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => { entries.forEach((x) => chosen.add(x.c.id)); list.querySelectorAll('input').forEach((i) => { i.checked = true; }); showCount(); } }, 'Select all'),
          h('button', { class: 'btn small', onclick: () => { chosen.clear(); list.querySelectorAll('input').forEach((i) => { i.checked = false; }); showCount(); } }, 'Select none'),
          h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: crop, onchange: (ev) => { crop = ev.target.checked; } }), h('span', {}, 'Crop marks')),
          h('span', { class: 'grow' }), count),
        progress, list),
    ].filter(Boolean));
  })();
  return root;
}

// ---------- router ----------

// ---------- personal passes (student IDs, travel passes, tickets, memberships…) ----------

let passTemplates = null;
const loadPassTemplates = () => passTemplates || (passTemplates = fetch('/pass-templates.json').then((r) => r.json()));
let bwipLoading = null;
const loadBarcodes = () => bwipLoading || (bwipLoading = loadScript('/vendor/bwip-js.min.js'));
const MAX_PASSES = 50;

const PASS_KINDS = [['generic', 'Card or ID'], ['event', 'Event ticket'], ['transit', 'Travel ticket (from → to)'], ['store', 'Store or membership card'], ['coupon', 'Coupon']];
const TRANSIT_TYPES = [['train', 'Train'], ['air', 'Flight'], ['bus', 'Bus or coach'], ['boat', 'Ferry'], ['generic', 'Other']];
const BARCODES = [['qr', 'QR code'], ['pdf417', 'PDF417'], ['aztec', 'Aztec'], ['code128', 'Code 128'], ['ean13', 'EAN-13'], ['code39', 'Code 39'], ['none', 'No barcode']];
const BWIP_ID = { qr: 'qrcode', pdf417: 'pdf417', aztec: 'azteccode', code128: 'code128', ean13: 'ean13', code39: 'code39' };
const PASS_GLYPHS = {
  school: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  backpack: '<path d="M6 9a6 6 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z"/><path d="M9 4V3h6v1M9 14h6v4H9z"/>',
  badge: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 7-2 8 0"/>',
  visitor: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M7 21v-3M17 21v-3M8 14.5h.01M16 14.5h.01"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M9 21l1.5-4M15 21l-1.5-4M9 13.5h.01M15 13.5h.01"/>',
  plane: '<path d="M10.5 21l1.5-6 7 2v-2l-7-5V4a1.5 1.5 0 0 0-3 0v6l-7 5v2l7-2 1.5 6"/>',
  ferry: '<path d="M3 17l2 3h14l2-3H3zM6 17V9h12v8M10 9V5h4v4"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 13h.01M17 13h.01"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3v4z"/><path d="M14 4v12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  dumbbell: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
  users: ICONS.users,
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  hotel: '<path d="M3 20V5M21 20v-6a3 3 0 0 0-3-3H10v6M3 17h18M6.5 11a1.5 1.5 0 1 0 0-.01"/>',
  medical: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/>',
  pass: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h6M7 14h10"/>',
};
function passGlyph(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PASS_GLYPHS[name] || PASS_GLYPHS.pass}</svg>`;
  return span.firstChild;
}

const findPass = (id) => (me.passes || []).find((p) => p.id === id) || null;
const keepPassesOffline = () => { try { localStorage.setItem('mk.passes', JSON.stringify(me.passes || [])); } catch {} };

/** A new pass from a template: labels filled in, values left for the person (the samples show as hints). */
function passFromTemplate(t) {
  const pair = (x) => ({ label: (x && x.label) || '', value: '' });
  return {
    template: t.id, kind: t.kind, transit: t.transit || 'generic', org: '', title: t.title,
    header: pair(t.header), primary: pair(t.primary), to: pair(t.to),
    front: (t.front || []).map(pair), back: (t.back || []).map(pair), notes: '',
    barcode: { format: t.barcode, value: '', text: '' }, colors: { ...t.colors }, date: '', expires: '',
    logo: '', photo: '', banner: '',
  };
}

/** The barcode as SVG markup (bwip-js), or a short message when the value does not fit that kind of code. */
async function barcodeSvg(format, value) {
  if (format === 'none' || !value) return '';
  await loadBarcodes();
  const square = ['qr', 'aztec'].includes(format);
  return window.bwipjs.toSVG({
    bcid: BWIP_ID[format], text: value, scale: 3,
    ...(square ? {} : { height: format === 'pdf417' ? 12 : 16 }),
    ...(['ean13', 'code39', 'code128'].includes(format) ? { includetext: false } : {}),
  });
}

function barcodeBox(pass, big = false) {
  const b = pass.barcode || {};
  if (b.format === 'none') return null;
  const holder = h('div', { class: `pass-code ${['qr', 'aztec'].includes(b.format) ? 'square' : 'wide'}${big ? ' big' : ''}` });
  const art = h('div', { class: 'pass-code-art' });
  holder.append(art);
  const under = b.text || (!['qr', 'aztec'].includes(b.format) && b.value);
  if (under) holder.append(h('small', {}, under));
  if (!b.value) art.append(h('span', { class: 'muted small' }, 'Barcode appears here'));
  else {
    barcodeSvg(b.format, b.value).then((svg) => { art.innerHTML = svg; })
      .catch((err) => { art.replaceChildren(h('span', { class: 'error small' }, String(err.message || err).replace(/^bwipp\.\w+#?\d*:\s*/, ''))); });
  }
  return holder;
}

/** A look-alike of the pass as it will appear in the wallet. */
function renderPass(pass, { samples = null, big = false } = {}) {
  const c = pass.colors || {};
  const hint = (i, key) => (samples && samples[key] && (i == null ? samples[key].sample : samples[key][i] && samples[key][i].sample)) || '';
  const field = (x, i, key, cls = '') => {
    if (!x || !(x.value || hint(i, key))) return null; // empty fields are hidden, as in the wallet
    return h('div', { class: `pf ${cls}` },
      h('span', { class: 'pf-label', style: `color:${c.label}` }, (x.label || '').toUpperCase()),
      h('span', { class: `pf-value${x.value ? '' : ' hint'}`, dir: 'auto' }, x.value || hint(i, key)));
  };
  const strip = ['event', 'store', 'coupon'].includes(pass.kind) && pass.banner;
  const showPhoto = !strip && ['generic', 'event'].includes(pass.kind) && pass.photo;
  const front = pass.front || [];
  let main;
  if (pass.kind === 'transit') {
    main = h('div', { class: 'pass-route' },
      field(pass.primary, null, 'primary', 'big'),
      h('span', { class: 'pass-route-icon', style: `color:${c.label}` }, passGlyph({ air: 'plane', train: 'train', bus: 'bus', boat: 'ferry' }[pass.transit] || 'pass')),
      field(pass.to, null, 'to', 'big end'));
  } else {
    main = h('div', { class: `pass-main${strip ? ' on-strip' : ''}`, style: strip ? `background-image:url("${pass.banner}")` : null },
      h('div', { class: 'grow' }, field(pass.primary, null, 'primary', 'big')),
      showPhoto && h('img', { class: 'pass-photo', src: pass.photo, alt: '' }));
  }
  return h('div', { class: `pass-face${big ? ' big' : ''}`, style: `background:${c.bg};color:${c.fg}` },
    h('div', { class: 'pass-top' },
      pass.logo ? h('img', { class: 'pass-logo', src: pass.logo, alt: '' }) : null,
      h('span', { class: 'pass-org grow', dir: 'auto' }, pass.org || pass.title || ''),
      field(pass.header, null, 'header', 'end')),
    main,
    front.length ? h('div', { class: 'pass-row' }, ...front.slice(0, 2).map((x, i) => field(x, i, 'front', i ? 'end' : ''))) : null,
    front.length > 2 ? h('div', { class: 'pass-row' }, ...front.slice(2, 4).map((x, i) => field(x, i + 2, 'front', i ? 'end' : ''))) : null,
    barcodeBox(pass, big));
}

function passesScreen() {
  keepPassesOffline();
  const list = me.passes || [];
  const head = h('header', { class: 'page-head' },
    h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Wallet'), h('h1', {}, 'My passes'),
      h('p', { class: 'muted' }, 'Student and staff IDs, travel passes, tickets, memberships and loyalty cards, all in one place and in your phone’s wallet.')),
    h('div', { class: 'head-actions' }, list.length < MAX_PASSES && h('a', { class: 'btn primary', href: '/passes/new' }, icon('plus'), 'Add pass')));
  const grid = h('div', { class: 'pass-grid' }, ...list.map((p) => h('a', { class: 'pass-tile', href: `/passes/${p.id}`, 'aria-label': p.title }, renderPass({ ...p, barcode: { format: 'none' } }))));
  grid.append(h('a', { class: 'tile tile-new pass-new', href: '/passes/new' },
    h('span', { class: 'tile-plus' }, icon('plus')), h('strong', {}, list.length ? 'Add a pass' : 'Add your first pass'),
    h('span', { class: 'muted small' }, 'Pick a template or design your own')));
  return h('div', { class: 'stack wide-stack' }, head, grid);
}

function passTemplatesScreen() {
  if ((me.passes || []).length >= MAX_PASSES) return missingScreen(`You can have up to ${MAX_PASSES} passes. Delete one to add another.`, 'Pass limit reached');
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading templates…'));
  loadPassTemplates().then((data) => {
    body.replaceChildren(...data.groups.map((group) => {
      const items = data.templates.filter((t) => t.group === group);
      return items.length && h('section', { class: 'stack' }, h('h2', { class: 'section-title' }, group),
        h('div', { class: 'template-grid' }, ...items.map((t) => h('a', { class: 'template-tile', href: `/passes/new/${t.id}` },
          h('span', { class: 'template-swatch', style: `background:${t.colors.bg};color:${t.colors.fg}` }, passGlyph(t.icon)),
          h('span', { class: 'stack tight' }, h('strong', {}, t.name),
            h('span', { class: 'muted small' }, PASS_KINDS.find(([k]) => k === t.kind)[1]))))));
    }).filter(Boolean));
  }).catch(() => body.replaceChildren(h('p', { class: 'error' }, 'Templates could not be loaded. Check your connection.')));
  return h('div', { class: 'stack wide-stack' },
    h('header', { class: 'page-head' }, h('a', { class: 'btn icon', href: '/passes', 'aria-label': 'Back' }, icon('back')),
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'New pass'), h('h1', {}, 'Choose a template'),
        h('p', { class: 'muted' }, 'Every template can be changed completely: colours, fields, pictures and barcode.'))),
    body);
}

// Pictures for a pass are PNG (Apple Wallet needs it), sized for the wallet at @3x.
async function passPicture(file, kind) {
  const img = await loadImage(URL.createObjectURL(file));
  const [w, hgt, cover] = { logo: [480, 150, false], photo: [270, 330, true], banner: [750, 246, true] }[kind];
  let cw = w, ch = hgt;
  const scale = cover ? Math.max(w / img.naturalWidth, hgt / img.naturalHeight) : Math.min(w / img.naturalWidth, hgt / img.naturalHeight, 1);
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  if (!cover) { cw = Math.round(dw); ch = Math.round(dh); }
  const canvas = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  canvas.getContext('2d').drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/png');
}

// Reads a barcode from the camera or a photo, where the browser can (Chrome on Android, Safari 17+ …).
async function scanBarcodeSheet(onFound) {
  if (!('BarcodeDetector' in window)) {
    toast('This browser cannot read barcodes. Type the number printed under the barcode instead, or use the MK Cards app.');
    return;
  }
  const detector = new window.BarcodeDetector();
  const formatOf = { qr_code: 'qr', pdf417: 'pdf417', aztec: 'aztec', code_128: 'code128', ean_13: 'ean13', code_39: 'code39' };
  let stream = null, timer = null;
  sheet((close) => {
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
    const finish = (code) => { clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); close(); onFound(code); };
    const fromFile = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const found = await detector.detect(await createImageBitmap(file)).catch(() => []);
      if (found[0]) finish({ value: found[0].rawValue, format: formatOf[found[0].format] || 'code128' });
      else toast('No barcode found in that picture.');
    } });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s; video.srcObject = s;
      timer = setInterval(async () => {
        const found = await detector.detect(video).catch(() => []);
        if (found[0]) finish({ value: found[0].rawValue, format: formatOf[found[0].format] || 'code128' });
      }, 350);
    }).catch(() => toast('The camera is not available. Choose a photo of the barcode instead.'));
    return [h('h1', {}, 'Scan the barcode'), h('p', { class: 'muted' }, 'Point the camera at the barcode on your card or ticket.'), video, fromFile,
      h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => fromFile.click() }, icon('upload'), 'Choose a photo'),
        h('button', { class: 'btn grow', onclick: () => { clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); close(); } }, 'Cancel'))];
  });
}

function passEditorScreen(id, templateId) {
  const existing = id && id !== 'new' ? findPass(id) : null;
  if (id && id !== 'new' && !existing) return missingScreen('That pass is not in your account.', 'Pass not found');
  const holder = h('div', { class: 'stack wide-stack' }, h('p', { class: 'muted' }, 'Loading…'));
  loadPassTemplates().then((data) => {
    const t = data.templates.find((x) => x.id === (existing ? existing.template : templateId)) || data.templates.find((x) => x.id === 'custom');
    if (!existing && !data.templates.some((x) => x.id === templateId)) { go('/passes/new'); return; }
    holder.replaceChildren(...passEditor(existing ? JSON.parse(JSON.stringify(existing)) : passFromTemplate(t), t, data.palettes, existing));
  }).catch(() => holder.replaceChildren(h('p', { class: 'error' }, 'Could not load the pass editor. Check your connection.')));
  return holder;
}

function passEditor(pass, t, palettes, existing) {
  let dirty = false;
  window.onbeforeunload = () => (dirty ? true : undefined);
  const preview = h('div', { class: 'pass-preview' });
  const samples = { header: t.header, primary: t.primary, to: t.to, front: t.front };
  const refresh = () => { dirty = true; preview.replaceChildren(renderPass(pass, { samples })); };
  const sample = (x) => (x && x.sample) || '';
  const textField = (label, get, set, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
    h(attrs.rows ? 'textarea' : 'input', { class: 'input', value: get(), dir: 'auto', ...attrs, oninput: (e) => { set(e.target.value); refresh(); } }));
  const pairRow = (obj, hint, { labelText = 'Label', valueText = 'Value', remove } = {}) => h('div', { class: 'pair-row' },
    h('input', { class: 'input', value: obj.label, maxlength: 30, placeholder: labelText, 'aria-label': labelText, oninput: (e) => { obj.label = e.target.value; refresh(); } }),
    h('input', { class: 'input grow', value: obj.value, maxlength: 80, dir: 'auto', placeholder: sample(hint) || valueText, 'aria-label': valueText, oninput: (e) => { obj.value = e.target.value; refresh(); } }),
    remove && h('button', { class: 'btn small icon-only', type: 'button', 'aria-label': 'Remove', onclick: remove }, icon('x')));

  const select = (label, options, get, set) => h('label', { class: 'field' }, h('span', {}, label),
    h('select', { class: 'input', onchange: (e) => { set(e.target.value); refresh(); draw(); } },
      ...options.map(([v, l]) => h('option', { value: v, selected: get() === v }, l))));

  const pictureRow = (kind, label, hint) => {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { pass[kind] = await passPicture(file, kind); refresh(); draw(); } catch (err) { toast(err.message); }
    } });
    return h('div', { class: 'picture-row' }, input,
      pass[kind] ? h('img', { class: `pic-thumb ${kind}`, src: pass[kind], alt: '' }) : h('span', { class: `pic-thumb empty ${kind}` }, icon('upload')),
      h('div', { class: 'grow stack tight' }, h('strong', {}, label), h('span', { class: 'muted small' }, hint)),
      h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, pass[kind] ? 'Change' : 'Add'),
      pass[kind] && h('button', { class: 'btn small danger', type: 'button', onclick: () => { pass[kind] = ''; refresh(); draw(); } }, 'Remove'));
  };

  const form = h('div', { class: 'stack' });
  const errorLine = h('p', { class: 'error', role: 'alert', hidden: true });
  const draw = () => {
    const isTransit = pass.kind === 'transit';
    const front = h('div', { class: 'stack tight' }, ...pass.front.map((f, i) => pairRow(f, t.front[i], { remove: () => { pass.front.splice(i, 1); refresh(); draw(); } })),
      pass.front.length < 4 && h('button', { class: 'btn small', type: 'button', onclick: () => { pass.front.push({ label: '', value: '' }); refresh(); draw(); } }, icon('plus'), 'Add a field'));
    const back = h('div', { class: 'stack tight' }, ...pass.back.map((f, i) => pairRow(f, t.back[i], { remove: () => { pass.back.splice(i, 1); refresh(); draw(); } })),
      pass.back.length < 12 && h('button', { class: 'btn small', type: 'button', onclick: () => { pass.back.push({ label: '', value: '' }); refresh(); draw(); } }, icon('plus'), 'Add a detail'));
    const swatches = h('div', { class: 'pass-palettes' }, ...palettes.map((p) => h('button', {
      type: 'button', class: 'pass-palette', title: p.name, 'aria-label': p.name, 'aria-pressed': String(pass.colors.bg === p.bg),
      style: `background:${p.bg};color:${p.label}`, onclick: () => { pass.colors = { bg: p.bg, fg: p.fg, label: p.label }; refresh(); draw(); },
    }, 'Aa')));
    const colour = (label, key) => h('label', { class: 'field colour-field' }, h('span', {}, label),
      h('input', { type: 'color', value: pass.colors[key], oninput: (e) => { pass.colors[key] = e.target.value; refresh(); } }));
    form.replaceChildren(
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'Type and name'),
        h('div', { class: 'grid2' }, select('Layout', PASS_KINDS, () => pass.kind, (v) => { pass.kind = v; }),
          isTransit ? select('Travelling by', TRANSIT_TYPES, () => pass.transit, (v) => { pass.transit = v; }) : h('span')),
        h('div', { class: 'grid2' },
          textField('Organisation (top of the pass)', () => pass.org, (v) => { pass.org = v; }, { maxlength: 40, placeholder: t.org || 'e.g. City University' }),
          textField('Pass name', () => pass.title, (v) => { pass.title = v; }, { maxlength: 40, placeholder: 'e.g. Student ID' }))),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'On the front'),
        h('p', { class: 'muted small' }, 'Labels are in grey; your details go on the right. Leave any field empty to hide it.'),
        h('span', { class: 'small strong' }, 'Top corner'), pairRow(pass.header, t.header),
        h('span', { class: 'small strong' }, isTransit ? 'From' : 'Main line'), pairRow(pass.primary, t.primary, isTransit ? { labelText: 'City', valueText: 'Code' } : {}),
        isTransit && h('span', { class: 'small strong' }, 'To'), isTransit && pairRow(pass.to, t.to, { labelText: 'City', valueText: 'Code' }),
        h('span', { class: 'small strong' }, 'More fields (up to 4)'), front),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'Barcode'),
        h('div', { class: 'grid2' }, select('Kind', BARCODES, () => pass.barcode.format, (v) => { pass.barcode.format = v; }),
          textField('Text under the code (optional)', () => pass.barcode.text, (v) => { pass.barcode.text = v; }, { maxlength: 40 })),
        pass.barcode.format !== 'none' && h('div', { class: 'row wrap' },
          h('label', { class: 'field grow' }, h('span', {}, 'What the code holds'),
            h('input', { class: 'input', value: pass.barcode.value, maxlength: 500, placeholder: pass.barcode.format === 'ean13' ? '12 or 13 digits' : 'e.g. your card or ticket number',
              oninput: (e) => { pass.barcode.value = e.target.value; refresh(); } })),
          h('button', { class: 'btn', type: 'button', onclick: () => scanBarcodeSheet((code) => { pass.barcode.value = code.value; pass.barcode.format = code.format; refresh(); draw(); }) }, icon('scan'), 'Scan from my card')),
        ['ean13', 'code39'].includes(pass.barcode.format) && h('p', { class: 'muted small' }, 'Apple Wallet shows this number as a Code 128 barcode, which shop scanners also read.')),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'Colours'), swatches,
        h('div', { class: 'grid3' }, colour('Background', 'bg'), colour('Text', 'fg'), colour('Labels', 'label'))),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'Pictures'),
        pictureRow('logo', 'Logo', 'Shown at the top left. A wide logo on a clear background works best.'),
        ['generic', 'event'].includes(pass.kind) && pictureRow('photo', 'Photo', 'e.g. your ID photo, shown beside your name.'),
        ['event', 'store', 'coupon'].includes(pass.kind) && pictureRow('banner', 'Banner', 'A wide picture across the pass, behind the main line.')),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'Dates'),
        h('div', { class: 'grid2' },
          textField('Date and time (shown on the lock screen near the time)', () => (pass.date ? new Date(new Date(pass.date).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''),
            (v) => { pass.date = v ? new Date(v).toISOString() : ''; }, { type: 'datetime-local' }),
          textField('Valid until (greyed out after this day)', () => pass.expires, (v) => { pass.expires = v; }, { type: 'date' }))),
      h('section', { class: 'glass panel stack' }, h('h2', {}, 'On the back'), back,
        textField('Notes', () => pass.notes, (v) => { pass.notes = v; }, { rows: 3, maxlength: 600 })),
      h('p', { class: 'muted small' }, 'Passes you make are personal copies for convenience. They are not official documents; carry the original where one is required.'),
      errorLine,
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: existing ? `/passes/${existing.id}` : '/passes' }, 'Cancel'),
        h('button', { class: 'btn primary grow', onclick: save }, icon('check'), existing ? 'Save changes' : 'Create pass')));
  };
  async function save(e) {
    const button = e.currentTarget;
    errorLine.hidden = true;
    button.disabled = true;
    try {
      const body = { pass };
      const res = existing ? await api(`/passes/${existing.id}`, { method: 'PUT', body }) : await api('/passes', { method: 'POST', body });
      me.passes = [...(me.passes || []).filter((p) => p.id !== res.pass.id), res.pass];
      keepPassesOffline();
      dirty = false;
      go(`/passes/${res.pass.id}`);
      toast(existing ? 'Pass saved' : 'Pass created');
    } catch (err) {
      errorLine.textContent = err.message;
      errorLine.hidden = false;
    } finally { button.disabled = false; }
  }
  draw();
  preview.replaceChildren(renderPass(pass, { samples }));
  return [
    h('header', { class: 'page-head' }, h('a', { class: 'btn icon', href: existing ? `/passes/${existing.id}` : '/passes/new', 'aria-label': 'Back' }, icon('back')),
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, existing ? 'Edit pass' : `New pass · ${t.name}`), h('h1', {}, existing ? pass.title : t.name))),
    h('div', { class: 'pass-editor' }, form, h('aside', { class: 'pass-aside' }, h('div', { class: 'sticky stack' }, h('p', { class: 'eyebrow' }, 'Preview'), preview,
      h('p', { class: 'muted small' }, 'Grey text shows examples until you fill in your own.')))),
  ];
}

function passWalletButtons(p) {
  const ready = me.wallet || {};
  const inAndroidApp = Boolean(native) && isAndroid;
  const inIPhoneApp = Boolean(native) && !isAndroid;
  const apple = ready.apple && !inAndroidApp && walletButton(`/api/passes/${p.id}/wallet/apple.pkpass`, 'Apple Wallet', 'apple');
  const google = ready.google && !inIPhoneApp && walletButton(`/api/passes/${p.id}/wallet/google`, 'Google Wallet', 'google');
  const list = (isApple ? [apple, google] : [google, apple]).filter(Boolean);
  return list.length ? h('div', { class: 'wallet-row' }, ...list) : null;
}

function passScreen(id) {
  const p = findPass(id);
  if (!p) return missingScreen('That pass is not in your account.', 'Pass not found');
  const back = [...p.back.filter((f) => f.value), ...(p.notes ? [{ label: 'Notes', value: p.notes }] : [])];
  const remove = () => sheet((close) => [
    h('h1', {}, 'Delete this pass?'),
    h('p', { class: 'muted' }, 'It is removed from MK Cards. A copy already added to Apple Wallet or Google Wallet stays there until you remove it in the wallet.'),
    h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: close }, 'Keep'),
      h('button', { class: 'btn danger grow', onclick: async () => {
        try {
          await api(`/passes/${p.id}`, { method: 'DELETE' });
          me.passes = me.passes.filter((x) => x.id !== p.id);
          keepPassesOffline();
          close(); go('/passes'); toast('Pass deleted');
        } catch (err) { toast(err.message); }
      } }, icon('trash'), 'Delete')),
  ]);
  return h('div', { class: 'stack pass-show' },
    h('header', { class: 'page-head' }, h('a', { class: 'btn icon', href: '/passes', 'aria-label': 'Back' }, icon('back')),
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, p.org || 'Pass'), h('h1', {}, p.title))),
    renderPass(p, { big: true }),
    passWalletButtons(p),
    back.length ? h('section', { class: 'glass panel stack' }, h('h2', {}, 'Details'),
      h('dl', { class: 'pass-back' }, ...back.flatMap((f) => [h('dt', {}, f.label), h('dd', { dir: 'auto' }, f.value)]))) : null,
    h('div', { class: 'row' },
      h('a', { class: 'btn grow', href: `/passes/${p.id}/edit` }, icon('edit'), 'Edit'),
      h('button', { class: 'btn danger grow', onclick: remove }, icon('trash'), 'Delete')));
}

const safePath = (p) => (typeof p === 'string' && /^\/(?!\/)/.test(p) ? p : '/');

// [pattern, screen, tab, who]: who is 'user' (must be logged in), 'guest' (logged out only) or null (anyone).
const routes = [
  [/^\/$/, homeScreen, 'home', null],
  [/^\/login$/, loginScreen, null, 'guest'],
  [/^\/register$/, registerScreen, null, 'guest'],
  [/^\/new$/, () => editorScreen(null), 'new', 'user'],
  [/^\/edit\/([a-z0-9]+)$/, editorScreen, 'home', 'user'],
  [/^\/share\/([a-z0-9]+)$/, shareScreen, 'home', 'user'],
  [/^\/inbox\/([a-z0-9]+)$/, inboxScreen, 'home', 'user'],
  [/^\/account$/, settingsScreen, 'account', 'user'],
  [/^\/settings$/, settingsScreen, 'account', 'user'],
  [/^\/admin$/, adminScreen, 'admin', 'user'],
  [/^\/admin\/design$/, designScreen, 'admin', 'user'],
  [/^\/admin\/print$/, printScreen, 'admin', 'user'],
  [/^\/passes$/, passesScreen, 'passes', 'user'],
  [/^\/passes\/new$/, passTemplatesScreen, 'passes', 'user'],
  [/^\/passes\/new\/([a-z0-9-]+)$/, (t) => passEditorScreen('new', t), 'passes', 'user'],
  [/^\/passes\/([a-z0-9]{12})\/edit$/, (id) => passEditorScreen(id), 'passes', 'user'],
  [/^\/passes\/([a-z0-9]{12})$/, passScreen, 'passes', 'user'],
  [/^\/contacts$/, contactsScreen, 'contacts', 'user'],
  [/^\/scan$/, scanScreen, 'contacts', 'user'],
  [/^\/signature\/([a-z0-9]+)$/, signatureScreen, 'home', 'user'],
  [/^\/background\/([a-z0-9]+)$/, backgroundScreen, 'home', 'user'],
  [/^\/tools\/signature$/, () => publicToolScreen('signature'), null, null],
  [/^\/tools\/background$/, () => publicToolScreen('background'), null, null],
  [/^\/welcome-password$/, setPasswordScreen, null, 'user'],
  [/^\/([a-z0-9][a-z0-9_-]{2,29})(?:\/([a-z0-9][a-z0-9-]{0,29}))?$/, publicScreen, null, null],
];

function render() {
  window.onbeforeunload = null;
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
    // People invited by their company choose their own password before anything else.
    if (me.user && me.user.mustChange && view !== setPasswordScreen && view !== publicScreen) { history.replaceState(null, '', '/welcome-password'); return render(); }
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
  // The top navigation is for people who are logged in; card pages and visitors get a clean page.
  document.body.classList.toggle('landing', !me.user && path === '/');
  document.body.classList.toggle('wide', tab === 'home' || tab === 'admin' || tab === 'contacts' || tab === 'passes');
  document.body.classList.toggle('in-app', inAppTabs);
  tabbar.hidden = !me.user || tab === null || inAppTabs;
  flashFromUrl();
  if (me.user) {
    const main = me.cards.find((c) => c.slug === '') || me.cards[0];
    const adminLabel = me.user.org && me.user.org.role !== 'member' ? 'Admin' : 'Company';
    tabbar.replaceChildren(h('nav', { class: 'topnav-inner glass', 'aria-label': 'Main' },
      h('a', { class: 'brand', href: '/' }, logo(), h('span', {}, 'MK Cards')),
      h('div', { class: 'topnav-links' },
        ...[['home', '/', 'My cards'], ['passes', '/passes', 'Passes'], ['contacts', '/contacts', 'Contacts'], ['account', '/account', 'Account'], ['admin', '/admin', adminLabel]]
          .map(([name, href, label]) => h('a', { href, 'aria-current': tab === name || (name === 'home' && tab === 'new') ? 'page' : null }, label))),
      h('a', { class: 'topnav-avatar', href: '/account', title: me.user.username, 'aria-label': 'Account' }, initials(main ? main.card.name : me.user.username))));
  }
  window.scrollTo(0, 0);
}

function go(path) {
  if (window.onbeforeunload && window.onbeforeunload() && !confirm('Leave without saving your card design?')) return;
  history.pushState(null, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || ['/privacy', '/support', '/delete-account'].includes(url.pathname)) return;
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
Object.assign(window.MKCards, {
  nativeUpdate(state) {
    if (state === 'available') offerUpdate('An update for MK Cards is available.', 'Update', () => native.startUpdate());
    else if (state === 'downloaded') offerUpdate('The update is downloaded.', 'Restart', () => native.completeUpdate());
    else if (state === 'current') toast('MK Cards is up to date.');
    else if (state === 'unknown') toast('Could not check for updates right now.');
  },
  // The iPhone app's tab bar moves between pages without reloading.
  open(path) { go(safePath(path)); },
  reload: () => boot(),
});

boot();
watchServiceWorker();
if (native && native.ready) native.ready();
