// Pictures drawn from a card in the browser when it is saved:
//   og    1200×630 JPEG  — the image shown in link previews (WhatsApp, LinkedIn, iMessage…)
//   thumb  270×270 PNG   — the photo tile on the Apple Wallet pass
//   hero  1032×336 JPEG  — the banner at the bottom of the Google Wallet pass
// Drawing here, not on the server, means every language renders with the phone's own fonts.

const FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Helvetica Neue", Arial, sans-serif';
const MK_MARK = {
  frame: 'M19 19h26a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7h-26a7 7 0 0 1-7-7v-13a7 7 0 0 1 7-7z',
  letters: 'M19 39V27l6.5 8 6.5-8v12M38 27v12M38 33l7-6M40.5 32l5 7',
};

export const ART_VERSION = Date.UTC(2026, 10, 16, 6); // raise when the designs change, so saved cards are redrawn

export async function drawCardArt(card, link) {
  const photo = card.photo ? await loadImage(card.photo).catch(() => null) : null;
  return {
    og: drawPreview(card, link, photo).toDataURL('image/jpeg', 0.88),
    thumb: drawThumb(card, photo).toDataURL('image/png'),
    hero: drawHero(card, link, photo).toDataURL('image/jpeg', 0.9),
  };
}

// ---------- the three designs ----------

function drawPreview(card, link, photo) {
  const W = 1200, H = 630;
  const { canvas, ctx } = surface(W, H);
  backdrop(ctx, W, H, card);

  // A glass card floating on the colour field.
  const x = 64, y = 64, w = W - 128, h = H - 128;
  glass(ctx, x, y, w, h, 48);

  const size = 236;
  avatar(ctx, card, photo, x + 64, y + (h - size) / 2 - 18, size, 64);

  const tx = x + 64 + size + 56;
  const maxW = x + w - 64 - tx;
  const align = isRtl(card.name) ? 'right' : 'left'; // the whole text block follows the name
  let ty = y + 120;
  ctx.fillStyle = '#fff';
  ty = text(ctx, card.name || 'MK Cards', tx, ty, maxW, `800 64px ${FONT}`, 74, 2, '#fff', align);
  const role = [card.title, card.company].filter(Boolean).join(' · ');
  if (role) ty = text(ctx, role, tx, ty + 12, maxW, `500 34px ${FONT}`, 44, 2, 'rgba(255,255,255,.86)', align);

  // Contact hints: first phone and email.
  const hints = [card.phones && card.phones[0] && card.phones[0].value, card.emails && card.emails[0] && card.emails[0].value].filter(Boolean);
  ty += 26;
  for (const hint of hints.slice(0, 2)) ty = text(ctx, hint, tx, ty + 8, maxW, `500 28px ${FONT}`, 38, 1, 'rgba(255,255,255,.8)', align);

  // Footer: the page address on a pill, and the MK Cards mark.
  const pillY = y + h - 92;
  ctx.font = `600 26px ${FONT}`;
  const label = prettyLink(link);
  const pillW = Math.min(maxW, ctx.measureText(label).width + 56);
  const pillX = align === 'right' ? tx + maxW - pillW : tx;
  roundRect(ctx, pillX, pillY, pillW, 52, 26);
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, label, pillW - 56), pillX + 28, pillY + 27);
  ctx.textBaseline = 'alphabetic';
  mark(ctx, x + 64 + (size - 52) / 2, pillY, 52);
  return canvas;
}

function drawThumb(card, photo) {
  const S = 270;
  const { canvas, ctx } = surface(S, S);
  avatar(ctx, card, photo, 0, 0, S, 70);
  return canvas;
}

function drawHero(card, link, photo) {
  const W = 1032, H = 336;
  const { canvas, ctx } = surface(W, H);
  backdrop(ctx, W, H, card);
  glass(ctx, 28, 28, W - 56, H - 56, 36);
  const size = 184;
  avatar(ctx, card, photo, 68, (H - size) / 2, size, 52);
  const tx = 68 + size + 44;
  const maxW = W - 68 - tx;
  let ty = 118;
  const align = isRtl(card.name) ? 'right' : 'left';
  ty = text(ctx, card.name || 'MK Cards', tx, ty, maxW, `800 46px ${FONT}`, 54, 1, '#fff', align);
  const role = [card.title, card.company].filter(Boolean).join(' · ');
  if (role) ty = text(ctx, role, tx, ty + 6, maxW, `500 28px ${FONT}`, 36, 1, 'rgba(255,255,255,.86)', align);
  text(ctx, prettyLink(link), tx, H - 76, maxW, `600 24px ${FONT}`, 30, 1, 'rgba(255,255,255,.82)', align);
  return canvas;
}

// ---------- shared drawing ----------

function surface(w, h) {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  return { canvas, ctx: canvas.getContext('2d') };
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;

function backdrop(ctx, w, h, card) {
  const a = /^#[0-9a-f]{6}$/i.test(card.accent || '') ? card.accent : '#5b8cff';
  if (card.style === 'mono') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2b3145');
    g.addColorStop(1, '#0c0f1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = card.style === 'solid' ? a : mix(a, '#0b1020', 0.08);
    ctx.fillRect(0, 0, w, h);
    if (card.style !== 'solid') {
      blob(ctx, 0, 0, w * 0.75, mix(a, '#ffffff', 0.45), 0.9);
      blob(ctx, w, h * 0.15, w * 0.6, mix(a, '#ff5fb7', 0.5), 0.75);
      blob(ctx, w * 0.6, h * 1.1, w * 0.7, mix(a, '#101a4a', 0.55), 0.9);
    }
  }
  // Soft sheen from the top left, like light on glass.
  const sheen = ctx.createLinearGradient(0, 0, w * 0.6, h);
  sheen.addColorStop(0, 'rgba(255,255,255,.22)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

function blob(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = 1;
}

function glass(ctx, x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(8,12,40,.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,.11)';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = 'rgba(255,255,255,.42)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const edge = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  edge.addColorStop(0, 'rgba(255,255,255,.18)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = edge;
  ctx.fill();
}

function avatar(ctx, card, photo, x, y, size, radius) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  if (photo) {
    ctx.drawImage(photo, x, y, size, size);
  } else {
    const a = /^#[0-9a-f]{6}$/i.test(card.accent || '') ? card.accent : '#5b8cff';
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, mix(a, '#ffffff', 0.35));
    g.addColorStop(1, mix(a, '#0b1020', 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(size * 0.38)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(card.name), x + size / 2, y + size / 2 + size * 0.02);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  roundRect(ctx, x, y, size, size, radius);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = Math.max(2, size / 90);
  ctx.stroke();
}

function mark(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  roundRect(ctx, 0, 0, 64, 64, 18);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 1.5;
  const frame = new Path2D(MK_MARK.frame);
  ctx.fill(frame);
  ctx.stroke(frame);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(MK_MARK.letters));
  ctx.restore();
}

// Writes text over up to `lines` lines (the last one is shortened with … if needed), right-to-left when it
// starts in Arabic or Hebrew. Returns the y position for whatever comes next.
function text(ctx, value, x, y, maxW, font, lineHeight, lines, color = '#fff', align = isRtl(value) ? 'right' : 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.direction = isRtl(value) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  const words = String(value).split(/\s+/).filter(Boolean);
  const rows = [];
  while (words.length && rows.length < lines) {
    let row = words.shift();
    if (rows.length < lines - 1) {
      while (words.length && ctx.measureText(`${row} ${words[0]}`).width <= maxW) row += ` ${words.shift()}`;
    } else {
      row = [row, ...words.splice(0)].join(' '); // the last line takes the rest
    }
    rows.push(fit(ctx, row, maxW));
  }
  for (const row of rows) {
    ctx.fillText(row, align === 'right' ? x + maxW : x, y);
    y += lineHeight;
  }
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

const isRtl = (value) => /^[^A-Za-z]*[\u0590-\u08ff]/.test(String(value || ''));
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
