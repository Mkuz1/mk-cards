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
  if (card.company) lines.push(`ORG:${esc(card.company)}`);
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

/** The pass colours: a deep shade of the card's accent, so white text always reads well. */
export function passColours(card) {
  const accent = /^#[0-9a-f]{6}$/i.test(card.accent || '') ? card.accent : '#5b8cff';
  const bg = card.style === 'mono' ? [28, 32, 46] : mixRgb(accent, '#0b1020', card.style === 'solid' ? 0.25 : 0.4);
  const label = mixRgb(`#${bg.map((v) => v.toString(16).padStart(2, '0')).join('')}`, '#ffffff', 0.68);
  return {
    background: bg,
    label,
    hex: `#${bg.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  };
}

const rgb = (c) => `rgb(${c.join(',')})`;
const roleOf = (card) => [card.title, card.company].filter(Boolean).join(' · ');
const asset = (path) => Uint8Array.from(atob(ASSETS[path].base64), (ch) => ch.charCodeAt(0));

// ---------- Apple Wallet ----------

/** Builds a signed .pkpass file. `thumb` is the card's 270×270 photo tile (PNG bytes) or null. */
export async function applePass(env, { cardId, card, link, thumb }) {
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
  // Front: company and phone side by side, then the email on a row of its own so it is not cut short.
  const secondary = [
    card.company && field('company', 'COMPANY', card.company),
    phones[0] && field('phone', 'PHONE', phones[0].value),
  ].filter(Boolean);
  const auxiliary = emails[0] ? [field('email', 'EMAIL', emails[0].value)] : [];

  const back = [
    ...phones.map((p, i) => field(`phone${i}`, `${p.label === 'other' ? '' : p.label.toUpperCase() + ' '}PHONE`.trim(), p.value)),
    ...emails.map((e, i) => field(`email${i}`, `${e.label === 'other' ? '' : e.label.toUpperCase() + ' '}EMAIL`.trim(), e.value)),
    card.whatsapp && field('whatsapp', 'WHATSAPP', `https://wa.me/${card.whatsapp.replace(/\D/g, '')}`,
      { attributedValue: `<a href="https://wa.me/${card.whatsapp.replace(/\D/g, '')}">${card.whatsapp}</a>` }),
    card.website && field('web', 'WEBSITE', card.website),
    ...(card.links || []).map((l, i) => field(`link${i}`, (l.label || l.type).toUpperCase(), l.url)),
    card.address && field('address', 'ADDRESS', card.address),
    card.bio && field('bio', 'ABOUT', card.bio),
    field('page', 'MY MK CARD', link, { attributedValue: `<a href="${link}">${link.replace(/^https?:\/\//, '')}</a>` }),
    field('scan', 'SAVE THIS CONTACT', 'Scan the QR code on the front with any phone camera to add this contact.'),
  ].filter(Boolean);

  const vcard = qrVCard(card, link);
  const pass = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: `mkcards-${cardId}`,
    organizationName: 'MK Cards',
    description: `${card.name} — business card`,
    logoText: 'MK Cards',
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
    barcodes: [{ format: 'PKBarcodeFormatQR', message: vcard, messageEncoding: 'utf-8', altText: 'Scan to save contact' }],
    barcode: { format: 'PKBarcodeFormatQR', message: vcard, messageEncoding: 'utf-8', altText: 'Scan to save contact' },
  };

  const enc = new TextEncoder();
  const files = {
    'pass.json': enc.encode(JSON.stringify(pass)),
    'icon.png': asset('/wallet/icon.png'),
    'icon@2x.png': asset('/wallet/icon@2x.png'),
    'icon@3x.png': asset('/wallet/icon@3x.png'),
    'logo.png': asset('/wallet/logo.png'),
    'logo@2x.png': asset('/wallet/logo@2x.png'),
    'logo@3x.png': asset('/wallet/logo@3x.png'),
  };
  if (thumb) {
    files['thumbnail.png'] = thumb;
    files['thumbnail@2x.png'] = thumb;
    files['thumbnail@3x.png'] = thumb;
  }

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

function googleClass(issuer) {
  return {
    id: `${issuer}.mkcards_business_card`,
    // Show the phone and the email on the front of the pass, each on its own row so neither is squeezed.
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: ['phone', 'email'].map((id) => ({
          oneItem: { item: { firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } } },
        })),
      },
    },
  };
}

function googleObject(issuer, { cardId, card, link, origin, hero }) {
  const phones = card.phones || [];
  const emails = card.emails || [];
  const uris = [
    ...phones.map((p, i) => ({ id: `tel${i}`, uri: `tel:${p.value.replace(/[^\d+]/g, '')}`, description: `Call ${p.value}` })),
    ...emails.map((e, i) => ({ id: `mail${i}`, uri: `mailto:${e.value}`, description: `Email ${e.value}` })),
    card.whatsapp && { id: 'whatsapp', uri: `https://wa.me/${card.whatsapp.replace(/\D/g, '')}`, description: 'Chat on WhatsApp' },
    card.website && { id: 'web', uri: card.website, description: 'Website' },
    { id: 'page', uri: link, description: 'My MK card' },
  ].filter(Boolean);
  return {
    id: `${issuer}.mk_${cardId}`,
    classId: `${issuer}.mkcards_business_card`,
    state: 'ACTIVE',
    cardTitle: text('MK Cards'),
    header: text(card.name),
    subheader: text(roleOf(card) || 'Business card'),
    hexBackgroundColor: passColours(card).hex,
    logo: { sourceUri: { uri: `${origin}/wallet/google-logo.png` }, contentDescription: text('MK Cards') },
    ...(hero ? { heroImage: { sourceUri: { uri: origin + hero }, contentDescription: text(`${card.name}'s card`) } } : {}),
    textModulesData: [
      phones[0] && { id: 'phone', header: 'Phone', body: phones[0].value },
      emails[0] && { id: 'email', header: 'Email', body: emails[0].value },
      card.company && { id: 'company', header: 'Company', body: card.company },
      card.address && { id: 'address', header: 'Address', body: card.address },
      card.bio && { id: 'about', header: 'About', body: card.bio },
    ].filter(Boolean),
    linksModuleData: { uris },
    barcode: { type: 'QR_CODE', value: qrVCard(card, link), alternateText: 'Scan to save contact' },
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
