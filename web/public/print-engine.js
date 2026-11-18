// MK Cards print engine: fills a company's fixed card design with one person's details and produces print-ready
// SVG in millimetres, with bleed and optional crop marks. All text is converted to outlines (shaped by HarfBuzz,
// so Arabic letters join correctly), the QR code is vector, and the artwork and images are embedded.
// Loaded only by the design and print pages. HarfBuzz and the fonts are static files under /print/.

const HB_URL = '/print/hb/index.mjs';
const FONT_URL = (key) => `/print/fonts/${key}.ttf`;
const PT = 25.4 / 72; // 1 point in millimetres

let hbModule = null;
const loadHb = () => hbModule || (hbModule = import(HB_URL));

const fonts = new Map(); // built-in fonts by key
const brand = new Map(); // the company's uploaded fonts by weight

async function makeFont(buffer) {
  const hb = await loadHb();
  const face = new hb.Face(new hb.Blob(buffer));
  const font = new hb.Font(face);
  const ext = font.hExtents();
  const test = new hb.Buffer();
  test.addText('ب');
  test.guessSegmentProperties();
  hb.shape(font, test);
  const arabic = (test.getGlyphInfos()[0] || {}).codepoint > 0;
  return { font, upem: face.upem, asc: ext.ascender, desc: ext.descender, arabic, paths: new Map() };
}

/** The company's uploaded fonts: { 400: ArrayBuffer, 700: ArrayBuffer }. */
export async function setBrandFonts(map) {
  brand.clear();
  for (const [weight, buffer] of Object.entries(map || {})) {
    if (!buffer) continue;
    try { brand.set(Number(weight), await makeFont(buffer)); } catch { throw new Error('The brand font file could not be read. Use a .ttf or .otf file.'); }
  }
}

export const hasBrandFont = () => brand.size > 0;

async function fontFor(family, weight, arabic) {
  weight = weight >= 600 ? 700 : 400;
  if (family === 'brand' && brand.size) {
    const f = brand.get(weight) || brand.get(400) || brand.get(700);
    if (!arabic || f.arabic) return f;
  }
  const key = `${family === 'serif' ? 'serif' : 'sans'}${arabic ? 'Ar' : ''}-${weight}`;
  if (!fonts.has(key)) {
    fonts.set(key, (async () => {
      const res = await fetch(FONT_URL(key));
      if (!res.ok) throw new Error('A print font could not be loaded. Check your connection and try again.');
      return makeFont(await res.arrayBuffer());
    })());
  }
  return fonts.get(key);
}

const AR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LTR = /[A-Za-z0-9À-ɏ@]/;
export const hasArabic = (s) => AR.test(s || '');
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r3 = (n) => Math.round(n * 1000) / 1000;

// Splits a line into Arabic (right-to-left) and other runs, in the order they appear on the card.
function runs(text) {
  const out = [];
  for (const ch of text) {
    const kind = AR.test(ch) ? 'R' : LTR.test(ch) ? 'L' : null;
    const last = out[out.length - 1];
    if (!last) out.push({ kind: kind || 'N', text: ch });
    else if (!kind || last.kind === kind || last.kind === 'N') { last.text += ch; if (last.kind === 'N' && kind) last.kind = kind; }
    else out.push({ kind, text: ch });
  }
  const firstStrong = out.find((r) => r.kind !== 'N');
  const rtl = firstStrong && firstStrong.kind === 'R';
  for (const r of out) if (r.kind === 'N') r.kind = rtl ? 'R' : 'L';
  // In a right-to-left line, spaces at the end of a run belong between runs, not inside a left-to-right run.
  return { rtl, list: rtl ? out.reverse() : out };
}

async function shapeRun(run, family, weight, sizeMm, spacing) {
  const hb = await loadHb();
  const arabic = run.kind === 'R' && hasArabic(run.text);
  const F = await fontFor(family, weight, arabic);
  const buf = new hb.Buffer();
  buf.addText(run.kind === 'R' ? run.text.trim() ? run.text : run.text : run.text);
  buf.guessSegmentProperties();
  hb.shape(F.font, buf);
  const scale = sizeMm / F.upem;
  const glyphs = [];
  let x = 0;
  const infos = buf.getGlyphInfos();
  const positions = buf.getGlyphPositions();
  infos.forEach((g, i) => {
    const p = positions[i];
    glyphs.push({ F, gid: g.codepoint, x: x + p.xOffset * scale, y: p.yOffset * scale });
    x += p.xAdvance * scale + spacing * sizeMm;
  });
  return { glyphs, width: x, F, scale };
}

function glyphPath(F, gid) {
  if (!F.paths.has(gid)) F.paths.set(gid, F.font.glyphToPath(gid));
  return F.paths.get(gid);
}

// A glyph outline (font units, y up) placed at (ox, oy) on the baseline, in millimetres.
function placePath(d, ox, oy, s) {
  return d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (m, x, y) => `${r3(ox + Number(x) * s)},${r3(oy - Number(y) * s)}`);
}

/** Shapes one line of text and returns { width, height, ascent, draw(x, baseline) → path data }. */
export async function textLine(text, { family = 'sans', weight = 400, size = 8, spacing = 0 }) {
  const sizeMm = size * PT;
  const { list } = runs(text);
  const shaped = [];
  let width = 0;
  for (const run of list) {
    const r = await shapeRun(run, family, weight, sizeMm, spacing);
    shaped.push({ ...r, offset: width });
    width += r.width;
  }
  const ref = shaped[0] ? shaped[0].F : await fontFor(family, weight, false);
  const ascent = (ref.asc / ref.upem) * sizeMm;
  const height = ((ref.asc - ref.desc) / ref.upem) * sizeMm;
  return {
    width, height, ascent,
    draw(x, baseline, scale = 1) {
      let d = '';
      for (const r of shaped) {
        for (const g of r.glyphs) {
          const path = glyphPath(g.F, g.gid);
          if (path) d += placePath(path, x + (r.offset + g.x) * scale, baseline - g.y * scale, r.scale * scale);
        }
      }
      return d;
    },
  };
}

// ---------- fields ----------

export const FIELDS = {
  static: 'Fixed text', name: 'Full name', title: 'Job title', department: 'Department', company: 'Company name',
  name_ar: 'Arabic name', title_ar: 'Arabic job title', department_ar: 'Arabic department', company_ar: 'Arabic company name',
  mobile: 'Mobile', office: 'Office phone', phone1: 'Phone 1', phone2: 'Phone 2', whatsapp: 'WhatsApp',
  email: 'Email', email2: 'Second email', website: 'Website', address: 'Address', address_ar: 'Arabic address',
  linkedin: 'LinkedIn', card_url: 'Card link',
};

const pretty = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** The value one field shows for a person. */
export function fieldValue(key, ctx) {
  const c = ctx.card || {};
  const ar = c.ar || {};
  const phones = c.phones || [];
  const emails = c.emails || [];
  const byLabel = (label) => (phones.find((p) => p.label === label) || {}).value || '';
  switch (key) {
    case 'name': return c.name;
    case 'title': return c.title;
    case 'department': return c.department;
    case 'company': return c.company || (ctx.org && ctx.org.name);
    case 'name_ar': return ar.name;
    case 'title_ar': return ar.title;
    case 'department_ar': return ar.department;
    case 'company_ar': return ar.company;
    case 'address_ar': return ar.address;
    case 'mobile': return byLabel('mobile');
    case 'office': return byLabel('work');
    case 'phone1': return (phones[0] || {}).value;
    case 'phone2': return (phones[1] || {}).value;
    case 'whatsapp': return c.whatsapp;
    case 'email': return (emails[0] || {}).value;
    case 'email2': return (emails[1] || {}).value;
    case 'website': return pretty(c.website);
    case 'address': return c.address;
    case 'linkedin': return pretty(((c.links || []).find((l) => l.type === 'linkedin') || {}).url);
    case 'card_url': return pretty(ctx.link);
    default: return '';
  }
}

const elementText = (e, ctx) => {
  if (e.field === 'static') return e.text || '';
  const v = fieldValue(e.field, ctx);
  return v ? `${e.prefix || ''}${v}` : '';
};

// ---------- QR code ----------

function qrPath(value) {
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  const qr = window.qrcode(0, 'M');
  qr.addData(value, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return { n, d };
}

// ---------- artwork ----------

/** Removes anything in an SVG that could run code or load other files. */
export function cleanSvg(text) {
  let s = String(text || '').replace(/^﻿/, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<\?xml[^>]*>/gi, '');
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  s = s.replace(/\s(xlink:href|href)\s*=\s*("|')\s*(?!data:|#)[^"']*\2/gi, '');
  if (!/<svg[\s>]/i.test(s)) throw new Error('That file is not an SVG drawing.');
  return s.trim();
}

const mmOf = (v) => {
  const m = /^([\d.]+)\s*(mm|cm|in|pt|px)?$/.exec(String(v || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return { mm: n, cm: n * 10, in: n * 25.4, pt: n * PT, px: (n * 25.4) / 96 }[m[2] || 'px'];
};

/** Reads artwork (SVG text or an image data: URL) and works out its size in millimetres. */
export async function prepareArt({ mime, data }) {
  if (mime === 'image/svg+xml') {
    const svg = cleanSvg(data);
    const root = /<svg\b[^>]*>/i.exec(svg)[0];
    const attr = (n) => (new RegExp(`\\s${n}\\s*=\\s*("|')([^"']*)\\1`, 'i').exec(root) || [])[2];
    const vb = (attr('viewBox') || '').split(/[\s,]+/).map(Number);
    const w = mmOf(attr('width')) ?? (vb.length === 4 ? (vb[2] * 25.4) / 96 : null);
    const h = mmOf(attr('height')) ?? (vb.length === 4 ? (vb[3] * 25.4) / 96 : null);
    if (!w || !h) throw new Error('The SVG has no size. Export it with a width and height (in mm) or a viewBox.');
    return { kind: 'svg', svg, w, h, viewBox: vb.length === 4 ? vb : [0, 0, w, h] };
  }
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('That picture could not be read.'));
    i.src = data;
  });
  // Pictures are assumed to be made at 300 dpi.
  return { kind: 'img', url: data, w: (img.naturalWidth / 300) * 25.4, h: (img.naturalHeight / 300) * 25.4, px: [img.naturalWidth, img.naturalHeight] };
}

/** Where the artwork goes: artwork made at bleed size fills the bleed; artwork made at trim size sits on the trim. */
export function artBox(art, W, H, B) {
  const ratio = art.w / art.h;
  const near = (a, b) => Math.abs(a - b) / b < 0.03;
  if (B > 0 && near(ratio, (W + 2 * B) / (H + 2 * B)) && !near(ratio, W / H)) return { x: -B, y: -B, w: W + 2 * B, h: H + 2 * B };
  if (near(ratio, W / H)) return { x: 0, y: 0, w: W, h: H, noBleed: B > 0 };
  return { x: -B, y: -B, w: W + 2 * B, h: H + 2 * B, stretched: true };
}

let idCount = 0;
function artMarkup(art, box) {
  if (art.kind === 'img') {
    return `<image x="${r3(box.x)}" y="${r3(box.y)}" width="${r3(box.w)}" height="${r3(box.h)}" preserveAspectRatio="xMidYMid slice" href="${esc(art.url)}"/>`;
  }
  // Each embedded drawing gets its own id prefix, so its gradients and clips never clash with another's.
  const p = `a${idCount++}-`;
  let inner = art.svg.replace(/^<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  inner = inner.replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`).replace(/href="#([^"]+)"/g, `href="#${p}$1"`);
  return `<svg x="${r3(box.x)}" y="${r3(box.y)}" width="${r3(box.w)}" height="${r3(box.h)}" viewBox="${art.viewBox.join(' ')}" preserveAspectRatio="xMidYMid slice" overflow="hidden">${inner}</svg>`;
}

// ---------- the card ----------

/**
 * Draws one side. layout: { size: { w, h }, bleed, elements: [...] }.
 * ctx: { card, link, vcardLink, org, images: { logo, photo } (data: URLs), art: { front, back } (from prepareArt) }.
 * opts: { withArt = true, cropMarks = false, guides = false }.
 * Returns { svg, boxes, warnings }.
 */
export async function renderSide(layout, side, ctx, opts = {}) {
  const { withArt = true, cropMarks = false, guides = false } = opts;
  const W = layout.size.w, H = layout.size.h, B = layout.bleed || 0;
  const M = cropMarks ? 8 : 0; // room for crop marks outside the bleed
  const total = { w: W + 2 * (B + M), h: H + 2 * (B + M) };
  const ox = B + M, oy = B + M; // the trim's top-left corner
  const parts = [];
  const boxes = [];
  const warnings = [];
  const art = ctx.art && ctx.art[side];
  if (withArt && art) {
    const box = artBox(art, W, H, B);
    if (box.noBleed) warnings.push(`The ${side} artwork has no bleed, so it is placed on the trim. Ask for a ${W + 2 * B} × ${H + 2 * B} mm version so no white shows after cutting.`);
    parts.push(`<g transform="translate(${ox} ${oy})">${artMarkup(art, box)}</g>`);
  }
  for (const e of layout.elements.filter((x) => x.side === side)) {
    const x = ox + e.x, y = oy + e.y;
    if (e.type === 'rect') {
      parts.push(`<rect x="${r3(x)}" y="${r3(y)}" width="${r3(e.w)}" height="${r3(e.h)}" rx="${r3(e.radius || 0)}" fill="${esc(e.color)}"/>`);
      boxes.push({ id: e.id, h: e.h });
    } else if (e.type === 'qr') {
      const value = e.target === 'vcard' ? ctx.vcardLink : ctx.link;
      const { n, d } = qrPath(value || 'https://mkcards.pages.dev');
      parts.push(`<svg x="${r3(x)}" y="${r3(y)}" width="${r3(e.w)}" height="${r3(e.w)}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="${esc(e.color || '#000')}" d="${d}"/></svg>`);
      boxes.push({ id: e.id, h: e.w });
      if (e.w < 15) warnings.push('The QR code is smaller than 15 mm, so it may be hard to scan.');
    } else if (e.type === 'logo' || e.type === 'photo') {
      const src = e.type === 'logo' ? ctx.images && ctx.images.logo : ctx.images && ctx.images.photo;
      if (src) {
        if (e.type === 'photo' && e.shape !== 'square') {
          const id = `c${idCount++}`;
          parts.push(`<clipPath id="${id}"><ellipse cx="${r3(x + e.w / 2)}" cy="${r3(y + e.h / 2)}" rx="${r3(e.w / 2)}" ry="${r3(e.h / 2)}"/></clipPath>`
            + `<image x="${r3(x)}" y="${r3(y)}" width="${r3(e.w)}" height="${r3(e.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="${esc(src)}"/>`);
        } else {
          parts.push(`<image x="${r3(x)}" y="${r3(y)}" width="${r3(e.w)}" height="${r3(e.h)}" preserveAspectRatio="${e.type === 'photo' ? 'xMidYMid slice' : 'xMidYMid meet'}" href="${esc(src)}"/>`);
        }
      }
      boxes.push({ id: e.id, h: e.h, empty: !src });
    } else if (e.type === 'text' || e.type === 'lines') {
      const values = e.type === 'text' ? [elementText(e, ctx)]
        : (e.lines || []).map((l) => (l.field === 'static' ? l.text || '' : fieldValue(l.field, ctx) ? `${l.prefix || ''}${fieldValue(l.field, ctx)}` : '')).filter(Boolean);
      const shown = values.map((v) => (e.upper ? v.toUpperCase() : v)).filter((v) => v.trim());
      const style = { family: e.font || 'sans', weight: e.weight || 400, size: e.size || 8, spacing: e.spacing || 0 };
      const step = (e.size || 8) * PT * (e.type === 'lines' ? e.lineHeight || 1.4 : 1.25);
      let d = '';
      let height = 0;
      for (const [i, value] of shown.entries()) {
        const line = await textLine(value, style);
        let scale = 1;
        if (e.fit !== false && line.width > e.w) scale = e.w / line.width;
        if (scale < 0.999 && scale < 0.6) warnings.push(`"${value}" is much wider than its box and was shrunk a lot.`);
        const lw = line.width * scale;
        const align = e.align || (hasArabic(value) ? 'right' : 'left');
        const lx = align === 'right' ? x + e.w - lw : align === 'center' ? x + (e.w - lw) / 2 : x;
        const baseline = y + i * step + line.ascent * scale;
        d += line.draw(lx, baseline, scale);
        height = i * step + line.height;
      }
      if (d) parts.push(`<path fill="${esc(e.color || '#000')}" d="${d}"/>`);
      boxes.push({ id: e.id, h: Math.max(height, (e.size || 8) * PT * 1.25), empty: !shown.length });
      if (shown.length && (e.x < 3 || e.y < 3 || e.x + e.w > W - 3 || e.y + height > H - 3)) {
        warnings.push(`"${shown[0]}" is outside the safe area (3 mm inside the trim), so it may be cut off.`);
      }
    }
  }
  if (guides) {
    parts.push(`<rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="none" stroke="#e5484d" stroke-width="0.2" stroke-dasharray="1 0.6"/>`
      + `<rect x="${ox + 3}" y="${oy + 3}" width="${W - 6}" height="${H - 6}" fill="none" stroke="#3e7bfa" stroke-width="0.15" stroke-dasharray="0.6 0.6"/>`);
  }
  if (cropMarks) {
    const L = 5, gap = B + 1, s = 'stroke="#000" stroke-width="0.12"';
    const marks = [];
    for (const [cx, cy] of [[ox, oy], [ox + W, oy], [ox, oy + H], [ox + W, oy + H]]) {
      const dx = cx === ox ? -1 : 1, dy = cy === oy ? -1 : 1;
      marks.push(`<line x1="${cx + dx * gap}" y1="${cy}" x2="${cx + dx * (gap + L)}" y2="${cy}" ${s}/>`, `<line x1="${cx}" y1="${cy + dy * gap}" x2="${cx}" y2="${cy + dy * (gap + L)}" ${s}/>`);
    }
    parts.push(marks.join(''));
  }
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r3(total.w)}mm" height="${r3(total.h)}mm" viewBox="0 0 ${r3(total.w)} ${r3(total.h)}">`
    + `<title>${esc((ctx.card && ctx.card.name) || 'Business card')} – ${side}</title>${parts.join('')}</svg>\n`;
  return { svg, boxes, warnings: [...new Set(warnings)] };
}

// ---------- files ----------

export const fileSafe = (s) => String(s || 'card').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'card';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A ZIP (files stored, not compressed) from { name: text or bytes }. */
export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint16(12, 0x21, true); head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
    head.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(head.buffer), nameBytes, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nameBytes.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
