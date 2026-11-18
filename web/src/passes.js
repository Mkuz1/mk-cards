// Personal passes: student IDs, travel cards, tickets, memberships… that people make themselves from a template.
// The pass is kept as plain data; Apple Wallet and Google Wallet versions are built from it on request.

export const PASS_KINDS = ['generic', 'event', 'transit', 'store', 'coupon'];
export const TRANSIT_TYPES = ['air', 'train', 'bus', 'boat', 'generic'];
export const BARCODE_FORMATS = ['qr', 'pdf417', 'aztec', 'code128', 'ean13', 'code39', 'none'];
export const MAX_PASSES = 50;

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const colour = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : fallback);
const pair = (v) => ({ label: text(v && v.label, 30), value: text(v && v.value, 80) });
const pairs = (list, max) => (Array.isArray(list) ? list : []).map(pair).filter((f) => f.label || f.value).slice(0, max);

/** Checks what the editor sent. Pictures are handled by the caller (they arrive as data: URLs or kept addresses). */
export function cleanPass(input = {}) {
  const kind = PASS_KINDS.includes(input.kind) ? input.kind : 'generic';
  const b = input.barcode || {};
  const format = BARCODE_FORMATS.includes(b.format) ? b.format : 'qr';
  let value = text(b.value, 500);
  if (format === 'ean13' && !/^\d{12,13}$/.test(value)) throw Object.assign(new Error('An EAN-13 barcode needs 12 or 13 digits.'), { status: 400 });
  if (format === 'code39') value = value.toUpperCase();
  if (format === 'code39' && !/^[0-9A-Z \-.$/+%]*$/.test(value)) throw Object.assign(new Error('Code 39 allows only letters, digits and - . $ / + %.'), { status: 400 });
  const date = text(input.date, 40);
  const expires = text(input.expires, 10);
  return {
    template: text(input.template, 40) || 'custom',
    kind,
    transit: TRANSIT_TYPES.includes(input.transit) ? input.transit : 'generic',
    org: text(input.org, 40),
    title: text(input.title, 40) || 'Pass',
    header: pair(input.header),
    primary: pair(input.primary),
    to: pair(input.to),
    front: pairs(input.front, 4),
    back: pairs(input.back, 12).map((f) => ({ ...f, value: text(f.value, 80) })),
    notes: text(input.notes, 600),
    barcode: { format, value: format === 'none' ? '' : value, text: text(b.text, 40) },
    colors: {
      bg: colour(input.colors && input.colors.bg, '#1f3b73'),
      fg: colour(input.colors && input.colors.fg, '#ffffff'),
      label: colour(input.colors && input.colors.label, '#c9d6f2'),
    },
    date: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : '',
    expires: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : '',
  };
}

const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')})`;
const APPLE_BARCODE = { qr: 'PKBarcodeFormatQR', pdf417: 'PKBarcodeFormatPDF417', aztec: 'PKBarcodeFormatAztec', code128: 'PKBarcodeFormatCode128' };
const APPLE_TRANSIT = { air: 'PKTransitTypeAir', train: 'PKTransitTypeTrain', bus: 'PKTransitTypeBus', boat: 'PKTransitTypeBoat', generic: 'PKTransitTypeGeneric' };
const APPLE_STYLE = { generic: 'generic', event: 'eventTicket', transit: 'boardingPass', store: 'storeCard', coupon: 'coupon' };

/** pass.json for Apple Wallet, and which pictures go with it. */
export function applePassJson(id, p, { hasPhoto, hasBanner }) {
  const f = (key, x) => ({ key, label: x.label.toUpperCase(), value: x.value });
  const filled = (list) => list.filter((x) => x.value);
  const front = filled(p.front).map((x, i) => f(`f${i}`, x));
  const style = {
    headerFields: p.header.value ? [f('h', p.header)] : [],
    primaryFields: [],
    secondaryFields: front.slice(0, 2),
    auxiliaryFields: front.slice(2, 4),
    backFields: [
      ...filled(p.back).map((x, i) => f(`b${i}`, x)),
      ...(p.notes ? [{ key: 'notes', label: 'NOTES', value: p.notes }] : []),
      { key: 'made', label: 'ABOUT THIS PASS', value: 'Made by its holder with MK Cards. It is a personal copy, not an official document.' },
    ],
  };
  if (p.primary.value) style.primaryFields.push(f('p', p.primary));
  if (p.kind === 'transit') {
    style.transitType = APPLE_TRANSIT[p.transit];
    style.primaryFields = [f('from', p.primary), f('to', p.to)];
  }
  const pass = {
    formatVersion: 1,
    serialNumber: `mkpass-${id}`,
    organizationName: p.org || 'MK Cards',
    description: p.title,
    logoText: p.org || p.title,
    foregroundColor: rgb(p.colors.fg),
    backgroundColor: rgb(p.colors.bg),
    labelColor: rgb(p.colors.label),
    [APPLE_STYLE[p.kind]]: style,
  };
  if (p.barcode.format !== 'none' && p.barcode.value) {
    // Apple Wallet has no EAN-13 or Code 39; Code 128 carries the same number and every till scanner reads it.
    const code = { format: APPLE_BARCODE[p.barcode.format] || 'PKBarcodeFormatCode128', message: p.barcode.value, messageEncoding: 'utf-8' };
    if (p.barcode.text) code.altText = p.barcode.text;
    pass.barcodes = [code];
    pass.barcode = code;
  }
  if (p.date) pass.relevantDate = p.date;
  if (p.expires) pass.expirationDate = `${p.expires}T23:59:59Z`;
  // Which pictures each layout can show: a banner (strip) on tickets, store cards and coupons, a photo elsewhere.
  const images = { logo: true };
  if (['event', 'store', 'coupon'].includes(p.kind) && hasBanner) images.strip = true;
  else if (['generic', 'event'].includes(p.kind) && hasPhoto) images.thumbnail = true;
  return { pass, images };
}

const GOOGLE_BARCODE = { qr: 'QR_CODE', pdf417: 'PDF_417', aztec: 'AZTEC', code128: 'CODE_128', ean13: 'EAN_13', code39: 'CODE_39' };
const g = (value) => ({ defaultValue: { language: 'en', value } });

export function googlePassClass(issuer) {
  const v = (id) => ({ firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } });
  return {
    id: `${issuer}.mkcards_personal_pass`,
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          { twoItems: { startItem: v('f0'), endItem: v('f1') } },
          { twoItems: { startItem: v('f2'), endItem: v('f3') } },
        ],
      },
    },
  };
}

export function googlePassObject(issuer, id, p, { origin, logo, photo, banner }) {
  const header = p.kind === 'transit'
    ? `${p.primary.value || '—'} → ${p.to.value || '—'}`
    : p.primary.value || p.title;
  const modules = [
    ...p.front.filter((x) => x.value).map((x, i) => ({ id: `f${i}`, header: x.label || ' ', body: x.value })),
    p.header.value && { id: 'h', header: p.header.label || ' ', body: p.header.value },
    ...p.back.filter((x) => x.value).map((x, i) => ({ id: `b${i}`, header: x.label || ' ', body: x.value })),
    p.notes && { id: 'notes', header: 'Notes', body: p.notes },
    { id: 'made', header: 'About this pass', body: 'Made by its holder with MK Cards. It is a personal copy, not an official document.' },
  ].filter(Boolean);
  const object = {
    id: `${issuer}.pass_${id}`,
    classId: `${issuer}.mkcards_personal_pass`,
    state: 'ACTIVE',
    cardTitle: g(p.org || p.title),
    subheader: g(p.kind === 'transit' ? p.title : p.primary.label || p.title),
    header: g(header),
    hexBackgroundColor: p.colors.bg,
    logo: { sourceUri: { uri: origin + (logo || '/icons/icon-192.png') }, contentDescription: g(p.org || 'Logo') },
    textModulesData: modules,
  };
  if (banner) object.heroImage = { sourceUri: { uri: origin + banner }, contentDescription: g(p.title) };
  if (photo) object.imageModulesData = [{ id: 'photo', mainImage: { sourceUri: { uri: origin + photo }, contentDescription: g('Photo') } }];
  if (p.barcode.format !== 'none' && p.barcode.value) {
    object.barcode = { type: GOOGLE_BARCODE[p.barcode.format], value: p.barcode.value, ...(p.barcode.text ? { alternateText: p.barcode.text } : {}) };
  }
  if (p.expires) object.validTimeInterval = { end: { date: `${p.expires}T23:59:59Z` } };
  return object;
}
