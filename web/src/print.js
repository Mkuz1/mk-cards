// Print card designs for company workspaces. An administrator uploads a front and a back design as SVG
// (from Illustrator, Figma, Affinity…) with placeholders such as {{name}} or {{mobile}} in its text, and a
// rectangle with id="qr" where the QR code goes. MK Cards fills them in for each person, ready for print.
import { qrPath } from './qr.js';

export const PLACEHOLDERS = [
  'name', 'title', 'department', 'company', 'mobile', 'office', 'phone', 'whatsapp', 'email', 'website', 'website_url',
  'address', 'linkedin', 'link', 'card_url', 'username', 'initials',
  'name_ar', 'title_ar', 'department_ar', 'company_ar', 'address_ar',
];

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Keeps the drawing, removes anything that could run code or load other files. */
export function sanitizeSvg(text) {
  let s = String(text || '').replace(/^﻿/, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // Images and fonts must be embedded (data:); links to other files and scripts are dropped.
  s = s.replace(/\s(xlink:href|href)\s*=\s*("|')\s*(?!data:|#)[^"']*\2/gi, '');
  if (!/<svg[\s>]/i.test(s)) throw new Error('That file is not an SVG drawing.');
  return s;
}

/** The person's details in the form the placeholders use. */
export function printFields(card, { link, username }) {
  const phone = (label) => ((card.phones || []).find((p) => p.label === label) || {}).value || '';
  const linkedin = ((card.links || []).find((l) => l.type === 'linkedin') || {}).url || '';
  const ar = card.ar || {};
  return {
    name: card.name, title: card.title, department: card.department, company: card.company,
    mobile: phone('mobile'), office: phone('work'), phone: ((card.phones || [])[0] || {}).value || '',
    whatsapp: card.whatsapp, email: ((card.emails || [])[0] || {}).value || '',
    website: (card.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), website_url: card.website,
    address: card.address, linkedin: linkedin.replace(/^https?:\/\/(www\.)?/, ''),
    link: link.replace(/^https?:\/\//, ''), card_url: link, username,
    initials: (card.name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase(),
    name_ar: ar.name, title_ar: ar.title, department_ar: ar.department, company_ar: ar.company, address_ar: ar.address,
  };
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("|')([^"']*)\\1`, 'i').exec(tag);
  return m ? m[2] : null;
};

/** Fills a design for one person: placeholders in the text, and the QR code (pointing at their card) in id="qr". */
export function fillDesign(svg, fields, qrLink) {
  // In a group marked data-stack="<line spacing>", lines whose fields are all empty are left out and the rest
  // move up, so a card without an office number has no gap and no stray "T".
  svg = svg.replace(/<g\b([^>]*\bdata-stack\s*=\s*("|')([\d.]+)\2[^>]*)>([\s\S]*?)<\/g>/gi, (all, attrs, q, step, inner) => {
    const lines = inner.match(/<text\b[\s\S]*?<\/text>/gi) || [];
    const kept = lines.filter((line) => {
      const keys = [...line.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
      return !keys.length || keys.some((k) => String(fields[k] ?? '').trim());
    });
    const firstY = Number(attr(lines[0] || '', 'y') || 0);
    const moved = kept.map((line, i) => line.replace(/(\sy\s*=\s*)("|')[^"']*\2/i, `$1"${+(firstY + i * Number(step)).toFixed(3)}"`));
    return `<g${attrs}>${moved.join('')}</g>`;
  });
  let out = svg.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (all, key) => (key.toLowerCase() in fields ? xml(fields[key.toLowerCase()]) : all));
  out = out.replace(/<(rect|image|g)\b[^>]*\bid\s*=\s*("|')qr\2[^>]*?(\/>|>[\s\S]*?<\/\1>)/i, (tag) => {
    const x = Number(attr(tag, 'x') || 0), y = Number(attr(tag, 'y') || 0);
    const w = Number(attr(tag, 'width') || 0), h = Number(attr(tag, 'height') || w);
    if (!w) return tag;
    const color = attr(tag, 'data-color') || '#000000';
    const background = attr(tag, 'data-background');
    const { n, d } = qrPath(qrLink);
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
      + (background ? `<rect width="${n}" height="${n}" fill="${xml(background)}"/>` : '')
      + `<path fill="${xml(color)}" d="${d}"/></svg>`;
  });
  return out;
}

/**
 * MK Cards' own design, used until a company uploads its own and as a starting point for designers.
 * 85 × 55 mm business card with 3 mm bleed on every side (91 × 61 mm); keep text inside the 5 mm safe area.
 */
export function sampleDesign(side, { accent = '#2a5ba8', logo = '' } = {}) {
  const navy = '#0f2343';
  const gold = '#b0892f';
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!-- MK Cards print template. Size: 85 x 55 mm card + 3 mm bleed (91 x 61 mm). Keep text 5 mm inside the trim.\n'
    + '     Placeholders: ' + PLACEHOLDERS.map((p) => `{{${p}}}`).join(' ') + '\n'
    + '     The QR code replaces the rectangle with id="qr" (data-color sets its colour).\n     Lines inside a group with data-stack="spacing" are left out when their fields are empty, and the rest move up. -->\n'
    + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="91mm" height="61mm" viewBox="0 0 91 61">\n';
  const font = 'font-family="Georgia, \'Times New Roman\', serif"';
  const sans = 'font-family="Helvetica, Arial, sans-serif"';
  if (side === 'front') {
    return head
      + `  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${navy}"/></linearGradient></defs>\n`
      + '  <rect width="91" height="61" fill="url(#bg)"/>\n'
      + `  <rect x="0" y="0" width="91" height="0.8" fill="${gold}"/>\n`
      + (logo ? `  <image x="9" y="9" width="12" height="12" preserveAspectRatio="xMinYMin meet" xlink:href="${logo}"/>\n` : '')
      + `  <text x="9" y="${logo ? 31 : 27}" ${sans} font-size="2.6" letter-spacing="0.6" fill="#d5b757" font-weight="bold">{{company}}</text>\n`
      + `  <text x="9" y="${logo ? 38.5 : 35}" ${font} font-size="6" font-weight="bold" fill="#ffffff">{{name}}</text>\n`
      + `  <text x="9" y="${logo ? 43.5 : 40}" ${sans} font-size="2.9" fill="#ffffff" fill-opacity="0.85">{{title}}</text>\n`
      + `  <rect x="9" y="${logo ? 46.5 : 43}" width="10" height="0.5" fill="${gold}"/>\n`
      + `  <text x="82" y="52" text-anchor="end" ${font} font-size="3.2" direction="rtl" fill="#ffffff" fill-opacity="0.9">{{name_ar}}</text>\n`
      + '</svg>\n';
  }
  return head
    + '  <rect width="91" height="61" fill="#ffffff"/>\n'
    + `  <rect x="0" y="60.2" width="91" height="0.8" fill="${gold}"/>\n`
    + `  <text x="9" y="15" ${font} font-size="4.2" font-weight="bold" fill="${navy}">{{name}}</text>\n`
    + `  <text x="9" y="19.5" ${sans} font-size="2.4" fill="#4a5672">{{title}}</text>\n`
    + '  <g data-stack="4.5">'
    + `<text x="9" y="30" ${sans} font-size="2.5" fill="${navy}">M  {{mobile}}</text>`
    + `<text x="9" y="34.5" ${sans} font-size="2.5" fill="${navy}">T  {{office}}</text>`
    + `<text x="9" y="39" ${sans} font-size="2.5" fill="${navy}">E  {{email}}</text>`
    + `<text x="9" y="43.5" ${sans} font-size="2.5" fill="${navy}">W  {{website}}</text>`
    + '</g>\n'
    + `  <text x="9" y="51" ${sans} font-size="2.2" fill="${gold}" font-weight="bold">{{link}}</text>\n`
    + '  <rect id="qr" x="60" y="17" width="22" height="22" fill="#0f2343" data-color="#0f2343"/>\n'
    + `  <text x="71" y="44" text-anchor="middle" ${sans} font-size="1.9" fill="#4a5672">Scan to save my contact</text>\n`
    + '</svg>\n';
}
