// Apple Wallet and Google Wallet passes for a card.
// Both passes carry a QR code that holds the contact itself (a vCard), so any phone camera that scans it
// offers "Add contact" straight away, even without internet.
//
// Settings (Cloudflare Worker secrets / variables):
//   APPLE_PASS_CERT         the Pass Type ID certificate, PEM (from developer.apple.com)
//   APPLE_PASS_KEY          the private key that certificate was made from, PEM
//   GOOGLE_WALLET_KEY       the Google Cloud service account key, the whole JSON file
//   GOOGLE_WALLET_ISSUER_ID the issuer ID from the Google Pay & Wallet Console
import forge from 'node-forge';
import { APPLE_WWDR_G4 } from './apple-wwdr.js';
import { ASSETS } from './assets.generated.js';
import { zip } from './zip.js';

const pem = (value) => String(value || '').replace(/\\n/g, '\n').trim();

export function walletStatus(env) {
  return {
    apple: Boolean(env.APPLE_PASS_CERT && env.APPLE_PASS_KEY),
    google: Boolean(env.GOOGLE_WALLET_KEY && env.GOOGLE_WALLET_ISSUER_ID),
  };
}

// ---------- shared ----------

/** A compact vCard for the QR code: small enough to scan easily from a phone screen. */
export function qrVCard(card, link) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const parts = (card.name || '').trim().split(/\s+/);
  const family = parts.length > 1 ? parts.pop() : '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(parts.join(' '))};;;`, `FN:${esc(card.name)}`];
  if (card.company || card.department) lines.push(`ORG:${esc(card.company)}${card.department ? ';' + esc(card.department) : ''}`);
  if (card.title) lines.push(`TITLE:${esc(card.title)}`);
  const tel = { mobile: 'CELL', work: 'WORK', home: 'HOME' };
  for (const p of (card.phones || []).slice(0, 3)) lines.push(`TEL;TYPE=${tel[p.label] || 'VOICE'}:${esc(p.value)}`);
  for (const e of (card.emails || []).slice(0, 2)) lines.push(`EMAIL:${esc(e.value)}`);
  lines.push(`URL:${esc(link)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixRgb = (a, b, t) => hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t));
const toHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function hueOf(c) {
  const [r, g, b] = hex(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The pass colours, the same rules as the card page: a deep shade of the card's colour, white text, and a fine
 * highlight (gold, or silver when the card's colour is itself warm) for the small labels. */
export function passColours(card) {
  const accent = /^#[0-9a-f]{6}$/i.test(card.accent || '') ? card.accent : '#2a5ba8';
  // The pass background is the card's mid-tone glass colour, so it reads as the same object as the card page.
  const deep = card.style === 'mono' ? hex('#10141c') : mixRgb(accent, '#050d1c', card.style === 'solid' ? 0.6 : 0.72);
  const bg = card.style === 'mono' ? mixRgb(toHex(deep), '#5a6478', 0.4) : mixRgb(toHex(deep), accent, 0.4);
  const hue = hueOf(accent);
  const label = hue >= 18 && hue <= 70 ? hex('#efeae0') : hex('#d5b757');
  return { background: bg, label, hex: toHex(bg) };
}

const rgb = (c) => `rgb(${c.join(',')})`;
const asset = (path) => Uint8Array.from(atob(ASSETS[path].base64), (ch) => ch.charCodeAt(0));

// ---------- Apple Wallet ----------

/** Builds a signed .pkpass file: a clean business card with no photo, the company at the top and
 * "MK Cards" in small print under the QR code. */
export async function applePass(env, { cardId, card, link }) {
  const cert = forge.pki.certificateFromPem(pem(env.APPLE_PASS_CERT));
  const key = forge.pki.privateKeyFromPem(pem(env.APPLE_PASS_KEY));
  // The certificate itself names the pass type (UID) and the developer team (OU).
  const attr = (oid) => cert.subject.attributes.find((x) => x.type === oid)?.value;
  const passTypeIdentifier = attr('0.9.2342.19200300.100.1.1'); // UID
  const teamIdentifier = attr('2.5.4.11'); // OU
  if (!passTypeIdentifier || !teamIdentifier) throw new Error('The Apple certificate is not a Pass Type ID certificate.');

  const colours = passColours(card);
  const phones = card.phones || [];
  const emails = card.emails || [];
  const field = (key, label, value, extra = {}) => ({ key, label, value, ...extra });
  const phoneLabel = (p) => ({ mobile: 'MOBILE', work: 'OFFICE', home: 'HOME' })[p.label] || 'PHONE';

  // Front: the name (with the role above it), two phone numbers or phone + WhatsApp, then the email in full.
  const secondary = [
    phones[0] && field('phone', phoneLabel(phones[0]), phones[0].value),
    phones[1] ? field('phone2', phoneLabel(phones[1]), phones[1].value)
      : card.whatsapp ? field('wa', 'WHATSAPP', card.whatsapp) : null,
  ].filter(Boolean);
  const auxiliary = emails[0] ? [field('email', 'EMAIL', emails[0].value)]
    : card.website ? [field('website', 'WEBSITE', card.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))] : [];

  const back = [
    card.company && field('company', 'COMPANY', [card.company, card.department].filter(Boolean).join(' · ')),
    ...phones.map((p, i) => field(`phone${i}`, phoneLabel(p), p.value)),
    ...emails.map((e, i) => field(`email${i}`, e.label === 'personal' ? 'PERSONAL EMAIL' : 'EMAIL', e.value)),
    card.whatsapp && field('whatsapp', 'WHATSAPP', `https://wa.me/${card.whatsapp.replace(/\D/g, '')}`,
      { attributedValue: `<a href="https://wa.me/${card.whatsapp.replace(/\D/g, '')}">${card.whatsapp}</a>` }),
    card.website && field('web', 'WEBSITE', card.website),
    ...(card.links || []).map((l, i) => field(`link${i}`, (l.label || l.type).toUpperCase(), l.url)),
    card.address && field('address', 'ADDRESS', card.address),
    card.bio && field('bio', 'ABOUT', card.bio),
    field('page', 'MY CARD', link, { attributedValue: `<a href="${link}">${link.replace(/^https?:\/\//, '')}</a>` }),
    field('scan', 'SAVE THIS CONTACT', 'Scan the QR code on the front with any phone camera to add this contact.'),
  ].filter(Boolean);

  const vcard = qrVCard(card, link);
  const barcode = { format: 'PKBarcodeFormatQR', message: vcard, messageEncoding: 'utf-8', altText: 'MK Cards' };
  const pass = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: `mkcards-${cardId}`,
    organizationName: card.company || 'MK Cards',
    description: `${card.name} — business card`,
    logoText: card.company || card.name,
    foregroundColor: 'rgb(255,255,255)',
    backgroundColor: rgb(colours.background),
    labelColor: rgb(colours.label),
    generic: {
      headerFields: card.label ? [field('label', 'CARD', card.label)] : [],
      primaryFields: [field('name', (card.title || 'Business card').toUpperCase(), card.name)],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: back,
    },
    barcodes: [barcode],
    barcode,
  };

  const enc = new TextEncoder();
  const files = {
    'pass.json': enc.encode(JSON.stringify(pass)),
    'icon.png': asset('/wallet/icon.png'),
    'icon@2x.png': asset('/wallet/icon@2x.png'),
    'icon@3x.png': asset('/wallet/icon@3x.png'),
  };

  const manifest = {};
  for (const [name, data] of Object.entries(files)) {
    manifest[name] = [...new Uint8Array(await crypto.subtle.digest('SHA-1', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const manifestText = JSON.stringify(manifest);
  files['manifest.json'] = enc.encode(manifestText);
  files.signature = sign(manifestText, cert, key);
  return zip(files);
}

// A detached PKCS #7 signature of the manifest, carrying the pass certificate and Apple's intermediate.
function sign(manifestText, cert, key) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestText, 'utf8');
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(APPLE_WWDR_G4));
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Uint8Array.from(der, (c) => c.charCodeAt(0));
}

// ---------- Google Wallet ----------

const text = (value) => ({ defaultValue: { language: 'en', value } });

// Google Wallet mirrors the Apple pass: company at the top, title over the name, two phone numbers side by side,
// then the email; no pictures; "MK Cards" in small print under the QR code. (Google picks the text colours itself
// and has no logo, so it shows the company's first letter in the top corner.)
function googleClass(issuer) {
  const value = (id) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } });
  return {
    id: `${issuer}.mkcards_business_card`,
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          { twoItems: { startItem: value('phone'), endItem: value('phone2') } },
          { oneItem: { item: value('email') } },
        ],
      },
    },
  };
}

function googleObject(issuer, { cardId, card, link }) {
  const phones = card.phones || [];
  const emails = card.emails || [];
  const phoneLabel = (p) => ({ mobile: 'Mobile', work: 'Office', home: 'Home' })[p.label] || 'Phone';
  const uris = [
    ...phones.map((p, i) => ({ id: `tel${i}`, uri: `tel:${p.value.replace(/[^\d+]/g, '')}`, description: `Call ${p.value}` })),
    ...emails.map((e, i) => ({ id: `mail${i}`, uri: `mailto:${e.value}`, description: `Email ${e.value}` })),
    card.whatsapp && { id: 'whatsapp', uri: `https://wa.me/${card.whatsapp.replace(/\D/g, '')}`, description: 'Chat on WhatsApp' },
    card.website && { id: 'web', uri: card.website, description: 'Website' },
    { id: 'page', uri: link, description: 'My card' },
  ].filter(Boolean);
  const second = phones[1] ? { id: 'phone2', header: phoneLabel(phones[1]), body: phones[1].value }
    : card.whatsapp ? { id: 'phone2', header: 'WhatsApp', body: card.whatsapp } : null;
  return {
    id: `${issuer}.mk_${cardId}`,
    classId: `${issuer}.mkcards_business_card`,
    state: 'ACTIVE',
    cardTitle: text(card.company || card.name),
    subheader: text(card.title || 'Business card'),
    header: text(card.name),
    hexBackgroundColor: passColours(card).hex,
    textModulesData: [
      phones[0] && { id: 'phone', header: phoneLabel(phones[0]), body: phones[0].value },
      second,
      emails[0] && { id: 'email', header: 'Email', body: emails[0].value },
      card.department && { id: 'department', header: 'Department', body: card.department },
      card.address && { id: 'address', header: 'Address', body: card.address },
      card.bio && { id: 'about', header: 'About', body: card.bio },
    ].filter(Boolean),
    linksModuleData: { uris },
    barcode: { type: 'QR_CODE', value: qrVCard(card, link), alternateText: 'MK Cards' },
  };
}

/**
 * Returns the "Save to Google Wallet" address. If the pass was saved before, it is updated first through the
 * Google Wallet API so the saved copy shows the card's latest details.
 */
export async function googleSaveUrl(env, details) {
  const keyFile = JSON.parse(env.GOOGLE_WALLET_KEY);
  const issuer = String(env.GOOGLE_WALLET_ISSUER_ID).trim();
  const walletClass = googleClass(issuer);
  const object = googleObject(issuer, details);
  let stored = false;
  try {
    await upsert(keyFile, walletClass, object);
    stored = true;
  } catch (err) {
    console.warn('Google Wallet update failed; the link carries the whole pass instead.', err);
  }
  // When Google already has the pass, the link only needs to name it; that keeps the link short.
  const jwt = await signJwt(keyFile, {
    iss: keyFile.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [details.origin],
    payload: stored
      ? { genericObjects: [{ id: object.id, classId: object.classId }] }
      : { genericClasses: [walletClass], genericObjects: [object] },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

async function upsert(keyFile, walletClass, object) {
  const token = await accessToken(keyFile);
  const api = 'https://walletobjects.googleapis.com/walletobjects/v1';
  const call = (method, path, body) => fetch(`${api}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await call('PUT', `/genericClass/${encodeURIComponent(walletClass.id)}`, walletClass);
  if (res.status === 404) res = await call('POST', '/genericClass', walletClass);
  if (!res.ok) throw new Error(`class: ${res.status} ${await res.text()}`);
  res = await call('PUT', `/genericObject/${encodeURIComponent(object.id)}`, object);
  if (res.status === 404) res = await call('POST', '/genericObject', object);
  if (!res.ok) throw new Error(`object: ${res.status} ${await res.text()}`);
}

async function accessToken(keyFile) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(keyFile, {
    iss: keyFile.client_email,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function signJwt(keyFile, claims) {
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyFile.private_key_id })));
  const body = b64url(enc.encode(JSON.stringify({ iat: Math.floor(Date.now() / 1000), ...claims })));
  const der = Uint8Array.from(atob(pem(keyFile.private_key).replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)));
  let sigText = '';
  for (const b of signature) sigText += String.fromCharCode(b);
  return `${head}.${body}.${btoa(sigText).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
