// Mockup of the proposed wallet card design (for review before it is built):
// Apple Wallet "store card" layout with a designed banner strip and the company logo, next to today's pass,
// and the matching Google Wallet pass. Run: node scripts/wallet-proposal-mockups.mjs <out-dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { passColours, qrVCard } from '../src/wallet.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
// Optional second argument: a banner image made by the site (card-art.js), used instead of the sketch below.
const [out, realStrip] = process.argv.slice(2);
const qrLib = readFileSync(new URL('../public/vendor/qrcode.js', import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rgb = (c) => `rgb(${c.join(',')})`;

const person = {
  slug: 'mkoussa/work', label: 'Work',
  card: { name: 'Mohamad Koussa', title: 'Group Head of Procurement & Supply Chain', department: 'Group Procurement', company: 'Bukhatir Group',
    accent: '#2a5ba8', style: 'aurora',
    phones: [{ label: 'mobile', value: '+971 52 692 9505' }, { label: 'work', value: '+971 6 512 6060' }],
    emails: [{ label: 'work', value: 'mohamad.koussa@bukhatir.ae' }], whatsapp: '+971526929505' },
};
const colours = passColours(person.card);
const qrText = qrVCard(person.card, `https://mkcards.pages.dev/${person.slug}`);

// The banner strip, as it would be drawn for each card (Apple shows it 375 × 123 points; drawn here at 3×).
const STRIP = `<div style="width:1125px;height:369px;position:relative;overflow:hidden;font-family:'New York','Iowan Old Style',Georgia,serif;
  background:radial-gradient(900px 420px at 0% 0%, rgba(156,175,187,.55), transparent 60%),
             radial-gradient(800px 500px at 100% 100%, rgba(42,91,168,.5), transparent 65%),
             linear-gradient(180deg,#1c3f75,#0f2343)">
  <div style="position:absolute;right:-30px;top:-60px;font-size:440px;font-weight:700;line-height:1;color:rgba(213,183,87,.13);letter-spacing:-.04em">MK</div>
  <div style="position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,transparent,rgba(232,208,130,.9),transparent)"></div>
  <div style="position:absolute;left:60px;right:60px;bottom:44px;height:3px;border-radius:2px;background:linear-gradient(90deg,#e8d082,#b08a2e 55%,rgba(176,138,46,0))"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,0) 40%)"></div>
</div>`;

// A stand-in company logo (the real one would be uploaded by the company).
const LOGO = `<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="url(#lg)"/><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8d082"/><stop offset="1" stop-color="#b08a2e"/></linearGradient></defs><text x="20" y="27" text-anchor="middle" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#0f2343">B</text></svg>`;

const CSS = `
* { box-sizing: border-box; margin: 0; }
body { font-family: -apple-system, "SF Pro Text", Inter, "Segoe UI", Roboto, Arial, sans-serif; background: #e9ecf3; }
.sheet { display: flex; gap: 44px; padding: 48px; align-items: flex-start; width: max-content; }
.col { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.caption { font-weight: 650; font-size: 18px; color: #1d2540; text-align: center; max-width: 393px; }
.caption small { display: block; font-weight: 500; font-size: 14px; color: #69708a; margin-top: 5px; line-height: 1.35; }
.tag { font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; padding: 5px 12px; border-radius: 999px; background: #dfe4ee; color: #4a5672; }
.tag.new { background: #0f2343; color: #e8d082; }
.phone { width: 393px; height: 852px; border-radius: 56px; padding: 0 16px; overflow: hidden; position: relative;
  box-shadow: 0 0 0 10px #111, 0 0 0 12px #3a3d45, 0 40px 80px -30px rgba(0,0,0,.6); }
.phone.dark { background: #000; color: #fff; } .phone.light { background: #f2f2f6; color: #111; }
.status { display: flex; justify-content: space-between; align-items: center; height: 54px; padding: 0 22px; font-weight: 600; font-size: 16px; }
.island { width: 120px; height: 34px; border-radius: 20px; background: #000; }
.app-title { font-size: 32px; font-weight: 800; margin: 8px 6px 16px; }
.stack-behind { height: 10px; margin: 0 8px; border-radius: 12px 12px 0 0; background: #2c2c2e; }
.pass { border-radius: 14px; overflow: hidden; color: #fff; position: relative; }
.p-top { display: flex; align-items: center; gap: 9px; height: 52px; padding: 0 14px; }
.p-top .t { font-size: 17px; font-weight: 600; flex: 1; }
.lab { font-size: 10.5px; font-weight: 600; letter-spacing: .05em; color: var(--label); }
.hv { font-size: 17px; text-align: right; }
.strip { position: relative; height: 141px; background-size: cover; background-position: center; }
.strip .prim { position: absolute; left: 14px; bottom: 22px; right: 14px; }
.strip .name { font-size: 30px; line-height: 1.1; font-weight: 400; }
.rows { padding: 12px 14px 0; }
.row { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
.row > div:last-child:not(:first-child) { text-align: right; }
.val { font-size: 16px; margin-top: 2px; white-space: nowrap; }
.code { background: #fff; color: #000; border-radius: 8px; width: 176px; margin: 22px auto 16px; padding: 12px 12px 8px; text-align: center; }
.code svg { width: 152px; height: 152px; display: block; }
.alt { font-size: 10px; letter-spacing: .06em; color: #555; margin-top: 5px; }
.info { position: absolute; right: 12px; bottom: 12px; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.85); font: italic 600 13px/19px Georgia, serif; text-align: center; }
.old .prim2 { padding: 22px 14px 18px; } .old .name { font-size: 30px; line-height: 1.12; }
.g-pass { border-radius: 24px; overflow: hidden; color: #fff; }
.g-top { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; font-size: 16px; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,.18); }
.g-body { padding: 14px 18px 20px; }
.g-sub { font-size: 14px; opacity: .85; } .g-head { font-size: 26px; font-weight: 500; margin-top: 2px; }
.g-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; } .g-row > div:last-child:not(:first-child) { text-align: right; }
.g-label { font-size: 12px; opacity: .8; } .g-val { font-size: 15px; margin-top: 2px; }
.g-code { background: #fff; color: #333; border-radius: 16px; width: 188px; margin: 20px auto 2px; padding: 14px 14px 8px; text-align: center; }
.g-code svg { width: 160px; height: 160px; display: block; }
.g-hero { height: 112px; background-size: cover; background-position: center; }
`;

const { card } = person;
const qr = `<div class="qr" data-text="${encodeURIComponent(qrText)}"></div>`;
const status = (dark) => `<div class="status"><span>9:41</span><span class="island"></span><span>●●●</span></div>`;

const current = `<div class="phone dark">${status(true)}<div class="app-title">Wallet</div><div class="stack-behind"></div>
  <div class="pass old" style="background:${rgb(colours.background)};--label:${rgb(colours.label)}">
    <div class="p-top"><span class="t">${esc(card.company)}</span><div><div class="lab" style="text-align:right">CARD</div><div class="hv">${person.label}</div></div></div>
    <div class="prim2"><div class="lab">${esc(card.title.toUpperCase())}</div><div class="name">${esc(card.name)}</div></div>
    <div class="rows" style="padding-top:0"><div class="row" style="margin-top:0"><div><div class="lab">MOBILE</div><div class="val">${card.phones[0].value}</div></div><div><div class="lab">OFFICE</div><div class="val">${card.phones[1].value}</div></div></div>
      <div class="row"><div><div class="lab">EMAIL</div><div class="val">${card.emails[0].value}</div></div></div></div>
    <div class="code">${qr}<div class="alt">MK Cards</div></div><div class="info">i</div></div></div>`;

const proposed = (strip) => `<div class="phone dark">${status(true)}<div class="app-title">Wallet</div><div class="stack-behind"></div>
  <div class="pass" style="background:#10264a;--label:#d5b757">
    <div class="p-top">${LOGO}<span class="t">${esc(card.company)}</span><div><div class="lab" style="text-align:right">CARD</div><div class="hv">${person.label}</div></div></div>
    <div class="strip" style="background-image:url(${strip})"><div class="prim"><div class="lab" style="color:#e8d082">${esc(card.title.toUpperCase())}</div><div class="name">${esc(card.name)}</div></div></div>
    <div class="rows"><div class="row"><div><div class="lab">MOBILE</div><div class="val">${card.phones[0].value}</div></div><div><div class="lab">OFFICE</div><div class="val">${card.phones[1].value}</div></div></div>
      <div class="row"><div><div class="lab">EMAIL</div><div class="val">${card.emails[0].value}</div></div></div></div>
    <div class="code">${qr}<div class="alt">MK Cards</div></div><div class="info">i</div></div></div>`;

const google = (strip) => `<div class="phone light">${status(false)}
  <div class="g-pass" style="background:#10264a">
    <div class="g-top">${LOGO}<span>${esc(card.company)}</span></div>
    <div class="g-body"><div class="g-sub">${esc(card.title)}</div><div class="g-head">${esc(card.name)}</div>
      <div class="g-row"><div><div class="g-label">Mobile</div><div class="g-val">${card.phones[0].value}</div></div><div><div class="g-label">Office</div><div class="g-val">${card.phones[1].value}</div></div></div>
      <div class="g-row" style="margin-top:12px"><div><div class="g-label">Email</div><div class="g-val">${card.emails[0].value}</div></div></div>
      <div class="g-code">${qr}<div class="alt">MK Cards</div></div></div>
    <div class="g-hero" style="background-image:url(${strip})"></div></div></div>`;

const qrScript = `${qrLib}
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
for (const el of document.querySelectorAll('.qr')) {
  const q = qrcode(0, 'M'); q.addData(decodeURIComponent(el.dataset.text)); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += 'M' + x + ' ' + y + 'h1v1h-1z';
  el.innerHTML = '<svg viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><path d="' + d + '"/></svg>';
}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setViewportSize({ width: 1125, height: 369 });
await page.setContent(`<body style="margin:0">${STRIP}</body>`);
const strip = realStrip ? `data:image/png;base64,${readFileSync(realStrip).toString('base64')}`
  : `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
writeFileSync(`${out}/proposed-strip.png`, Buffer.from(strip.split(',')[1], 'base64'));

const col = (tag, html, title, note) => `<div class="col"><span class="tag${tag === 'Proposed' ? ' new' : ''}">${tag}</span>${html}<div class="caption">${title}<small>${note}</small></div></div>`;
const screens = [
  ['apple-now', col('Today', current, 'Apple Wallet — today', 'Plain colour, text only')],
  ['apple-proposed', col('Proposed', proposed(strip), 'Apple Wallet — proposed', 'Company logo, a designed banner with the name over it, gold labels throughout')],
  ['google-proposed', col('Proposed', google(strip), 'Google Wallet — proposed', 'Company logo instead of the letter, and the same banner at the bottom')],
];
await page.setViewportSize({ width: 1600, height: 1000 });
for (const [file, html] of screens) {
  await page.setContent(`<style>${CSS}</style><div class="sheet">${html}</div>`);
  await page.addScriptTag({ content: qrScript });
  await page.locator('.col').screenshot({ path: `${out}/${file}.png` });
}
await page.setContent(`<style>${CSS}</style><div class="sheet">${screens.map(([, html]) => html).join('')}</div>`);
await page.addScriptTag({ content: qrScript });
await page.locator('.sheet').screenshot({ path: `${out}/wallet-proposal-overview.png` });
await browser.close();
console.log('proposal mockups written');
