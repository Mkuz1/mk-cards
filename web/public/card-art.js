// Pictures drawn from a card in the browser when it is saved:
//   og    1200×630 JPEG  — the image shown in link previews (WhatsApp, LinkedIn, iMessage…)
//   strip  750×288 PNG   — the banner across the top of the Apple Wallet pass (store-card layout)
//   hero  1032×336 JPEG  — the same banner at the bottom of the Google Wallet pass
// Drawing here, not on the server, means every language renders with the phone's own fonts.
// The look follows the card page: a deep shade of the card's colour, a round photo with a fine gold ring,
// the name in a serif face and the company as a small spaced heading.

const SANS = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Helvetica Neue", Arial, sans-serif';
const SERIF = '"New York", "Iowan Old Style", "Palatino Linotype", Georgia, "Noto Naskh Arabic", "Times New Roman", serif';

export const ART_VERSION = Date.UTC(2026, 10, 17, 10); // raise when the designs change, so saved cards are redrawn

// ---------- card colours (shared with the page) ----------

export const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const mixHex = (a, b, t) => '#' + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const rgba = (c, alpha) => `rgba(${hexRgb(c).join(',')},${alpha})`;

function hueOf(c) {
  const [r, g, b] = hexRgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The card's colours, tuned so the Midnight colour reproduces the reference design: a deep navy page, glass
 * panels that are lighter at the top with a misty glow in the top-left corner, and gold details (silver when the
 * chosen colour is itself warm). The server uses the same rules for the wallet passes. */
export function cardTheme(card) {
  const a = /^#[0-9a-f]{6}$/i.test(card.accent || '') ? card.accent : '#2a5ba8';
  const mono = card.style === 'mono';
  const deep = mono ? '#10141c' : mixHex(a, '#050d1c', card.style === 'solid' ? 0.6 : 0.72);
  const hue = hueOf(a);
  return {
    a,
    deep,
    page: mixHex(deep, '#000000', 0.12),
    glassTop: mixHex(deep, mono ? '#5a6478' : a, 0.58),
    glassBottom: mixHex(deep, mono ? '#3a4254' : a, 0.33),
    haze: mono ? '#b9c0cc' : mixHex(a, '#b9c4c0', 0.8),
    glow: mono ? '#465066' : mixHex(a, '#b9c4c0', 0.55),
    hi: hue >= 18 && hue <= 70 ? '#efeae0' : '#d5b757',
  };
}

// ---------- the pictures ----------

export async function drawCardArt(card, link) {
  const photo = card.photo ? await loadImage(card.photo).catch(() => null) : null;
  return {
    og: drawPreview(card, link, photo).toDataURL('image/jpeg', 0.9),
    strip: drawBanner(card, 750, 288).toDataURL('image/png'),
    hero: drawBanner(card, 1032, 336).toDataURL('image/jpeg', 0.9),
  };
}

function drawPreview(card, link, photo) {
  const W = 1200, H = 630;
  const { canvas, ctx } = surface(W, H);
  const t = cardTheme(card);
  backdrop(ctx, W, H, t, card.style);
  glass(ctx, 48, 48, W - 96, H - 96, 44, t);

  const size = 236;
  const cx = 48 + 70 + size / 2, cy = H / 2 - 6;
  avatar(ctx, card, photo, cx, cy, size, t);

  const x = 48 + 70 + size + 64;
  const maxW = W - 48 - 64 - x;
  const align = isRtl(card.name) ? 'right' : 'left';
  let y = 168;
  if (card.company) {
    y = text(ctx, card.company.toUpperCase(), x, y, maxW, `650 22px ${SANS}`, 34, 1, t.hi, align, 6);
    y += 14;
  } else {
    y += 20;
  }
  y = text(ctx, card.name || 'MK Cards', x, y + 30, maxW, `700 66px ${SERIF}`, 74, 2, '#fff', align);
  if (card.title) y = text(ctx, card.title, x, y + 2, maxW, `500 30px ${SANS}`, 40, 2, 'rgba(255,255,255,.92)', align);
  const org = card.department ? [card.department, card.company].filter(Boolean).join(' · ') : '';
  if (org) y = text(ctx, org, x, y, maxW, `500 25px ${SANS}`, 34, 1, 'rgba(255,255,255,.7)', align);
  rule(ctx, align === 'right' ? x + maxW - 56 : x, y + 6, t.hi);

  // Footer: the card's address, and MK Cards in small spaced letters.
  ctx.font = `600 24px ${SANS}`;
  const label = prettyLink(link);
  const pillW = Math.min(maxW, ctx.measureText(label).width + 52);
  const pillX = align === 'right' ? x + maxW - pillW : x;
  const pillY = H - 48 - 92;
  roundRect(ctx, pillX, pillY, pillW, 50, 25);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, label, pillW - 52), pillX + 26, pillY + 26);
  ctx.textBaseline = 'alphabetic';
  text(ctx, 'MK CARDS', 48 + 70, H - 48 - 58, size, `600 17px ${SANS}`, 20, 1, 'rgba(255,255,255,.5)', 'left', 5, true);
  return canvas;
}

// The wallet banner: frosted glass in the card's colours, a fine gold edge and a gold rule, and the holder's
// initials as a large, faint gold watermark on the right. The wallet writes the name over it.
function drawBanner(card, W, H) {
  const { canvas, ctx } = surface(W, H);
  const t = cardTheme(card);
  ctx.fillStyle = mixHex(t.deep, t.a, 0.3);
  ctx.fillRect(0, 0, W, H);
  if (card.style !== 'solid') {
    glowAt(ctx, 0, 0, W * 0.8, rgba(t.haze, 0.55));
    glowAt(ctx, W, H, W * 0.75, rgba(t.a, 0.45));
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,.08)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  // Watermark initials.
  ctx.save();
  ctx.font = `700 ${Math.round(H * 0.82)}px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(t.hi, 0.1);
  ctx.fillText(initials(card.name), W + H * 0.1, H * 0.8);
  ctx.restore();
  // Gold edge along the top and a gold rule near the bottom, fading out to the right.
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.5, rgba(mixHex(t.hi, '#ffffff', 0.3), 0.9));
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, Math.max(2, H / 120));
  const rule = ctx.createLinearGradient(W * 0.05, 0, W * 0.9, 0);
  rule.addColorStop(0, mixHex(t.hi, '#ffffff', 0.25));
  rule.addColorStop(0.55, t.hi);
  rule.addColorStop(1, rgba(t.hi, 0));
  ctx.fillStyle = rule;
  ctx.fillRect(W * 0.05, H - H * 0.12, W * 0.85, Math.max(2, H / 110));
  return canvas;
}

// ---------- video-call background ----------

/**
 * A 1920×1080 background for Zoom, Teams, Meet and Webex. The person sits in the middle, so the name and title go
 * in a top corner and the QR code (opening the card) in the other. theme: 'dark' (the card's colours) or 'light'.
 * qr: { n, isDark(y, x) } from the page's QR maker, or null. logo: a loaded image or null.
 */
export async function drawCallBackground(card, link, { theme = 'dark', side = 'left', qr = null, logo = null, details = true, paper = '#f5f3ee' } = {}) {
  const W = 1920, H = 1080;
  const { canvas, ctx } = surface(W, H);
  const t = cardTheme(card);
  const dark = theme !== 'light';
  const ink = dark ? '#ffffff' : t.deep;
  const soft = dark ? 'rgba(255,255,255,.78)' : rgba(t.deep, 0.72);
  const accent = dark ? t.hi : mixHex(t.a, '#8a6a16', 0.35);
  if (dark) {
    backdrop(ctx, W, H, t, card.style);
    glowAt(ctx, W * 0.5, H * 1.05, W * 0.55, rgba(t.a, 0.22));
  } else {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    glowAt(ctx, 0, 0, W * 0.7, rgba(mixHex(t.a, '#ffffff', 0.7), 0.55));
    glowAt(ctx, W, H, W * 0.6, rgba(mixHex(t.a, '#ffffff', 0.55), 0.35));
  }
  // A fine gold line along the top edge.
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.5, accent);
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, 4);

  const margin = 96;
  const blockW = 760;
  const left = side !== 'right';
  const x = left ? margin : W - margin - blockW;
  const align = left ? 'left' : 'right';
  let y = 150;
  if (logo) {
    const lh = 84, lw = Math.min(260, (logo.naturalWidth / logo.naturalHeight) * lh);
    ctx.drawImage(logo, left ? x : x + blockW - lw, y - 40, lw, lh);
    y += 90;
  }
  if (card.company) y = text(ctx, card.company.toUpperCase(), x, y, blockW, `650 26px ${SANS}`, 40, 1, accent, align, 7) + 18;
  y = text(ctx, card.name || 'MK Cards', x, y + 40, blockW, `700 78px ${SERIF}`, 88, 2, ink, align);
  if (card.title) y = text(ctx, card.title, x, y + 4, blockW, `500 36px ${SANS}`, 46, 2, soft, align);
  rule(ctx, left ? x : x + blockW - 72, y + 8, accent, 72);
  if (details) {
    const lines = [(card.emails || [])[0], (card.phones || [])[0]].filter(Boolean).map((e) => e.value);
    y += 66;
    for (const line of lines) y = text(ctx, line, x, y, blockW, `500 28px ${SANS}`, 42, 1, soft, align);
  }

  if (qr) {
    const box = 300, pad = 22;
    const qx = left ? W - margin - box : margin;
    const qy = 110;
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0,0,0,.45)' : 'rgba(20,30,60,.18)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    roundRect(ctx, qx, qy, box, box, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    const cell = (box - pad * 2) / qr.n;
    ctx.fillStyle = '#0d1326';
    for (let r = 0; r < qr.n; r++) {
      for (let c = 0; c < qr.n; c++) if (qr.isDark(r, c)) ctx.fillRect(qx + pad + c * cell, qy + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
    text(ctx, 'SCAN TO SAVE MY CONTACT', qx - 80, qy + box + 50, box + 160, `650 20px ${SANS}`, 28, 1, soft, 'center', 3);
    ctx.textAlign = 'left';
  }
  text(ctx, prettyLink(link), left ? margin : W - margin - blockW, H - 70, blockW, `500 24px ${SANS}`, 30, 1, dark ? 'rgba(255,255,255,.55)' : rgba(t.deep, 0.5), align);
  return canvas;
}

// ---------- shared drawing ----------

function surface(w, h) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  return { canvas, ctx: canvas.getContext('2d') };
}

function backdrop(ctx, w, h, t, style) {
  ctx.fillStyle = t.deep;
  ctx.fillRect(0, 0, w, h);
  if (style !== 'solid') {
    glowAt(ctx, 0, 0, w * 0.8, rgba(t.glow, 0.55));
    glowAt(ctx, w, h, w * 0.7, rgba(t.a, 0.28));
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, 'rgba(255,255,255,.06)');
  sheen.addColorStop(1, 'rgba(0,0,0,.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

function glowAt(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function glass(ctx, x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fill();
  ctx.restore();
  const top = ctx.createLinearGradient(0, y, 0, y + h);
  top.addColorStop(0, 'rgba(255,255,255,.10)');
  top.addColorStop(0.5, 'rgba(255,255,255,0)');
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function avatar(ctx, card, photo, cx, cy, size, t) {
  const r = size / 2;
  // Soft halo and a fine highlight ring, like the card page.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    ctx.drawImage(photo, cx - r, cy - r, size, size);
  } else {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, 0, cx, cy, r);
    g.addColorStop(0, mixHex(t.deep, '#ffffff', 0.18));
    g.addColorStop(1, t.deep);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(size * 0.38)}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(card.name), cx, cy + size * 0.03);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = t.hi;
  ctx.lineWidth = Math.max(3, size / 50);
  ctx.stroke();
}

function rule(ctx, x, y, color, width = 56) {
  roundRect(ctx, x, y, width, 3, 1.5);
  ctx.fillStyle = color;
  ctx.fill();
}

// Writes text over up to `lines` lines (the last one is shortened with … if needed). Direction follows the
// text; `align` places the block. Returns the y position for whatever comes next.
function text(ctx, value, x, y, maxW, font, lineHeight, lines, color = '#fff', align = isRtl(value) ? 'right' : 'left', spacing = 0) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.direction = isRtl(value) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const words = String(value).split(/\s+/).filter(Boolean);
  const rows = [];
  while (words.length && rows.length < lines) {
    let row = words.shift();
    if (rows.length < lines - 1) {
      while (words.length && ctx.measureText(`${row} ${words[0]}`).width <= maxW) row += ` ${words.shift()}`;
    } else {
      row = [row, ...words.splice(0)].join(' ');
    }
    rows.push(fit(ctx, row, maxW));
  }
  for (const row of rows) {
    ctx.fillText(row, align === 'right' ? x + maxW : align === 'center' ? x + maxW / 2 : x, y);
    y += lineHeight;
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  return y;
}

function fit(ctx, value, maxW) {
  if (ctx.measureText(value).width <= maxW) return value;
  let s = value;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const isRtl = (value) => /^[^A-Za-z]*[֐-ࣿ]/.test(String(value || ''));
const initials = (name) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map((p) => Array.from(p)[0] || '').join('').toUpperCase() || 'MK';
const prettyLink = (link) => link.replace(/^https?:\/\//, '');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
