// Renders preview images of the Apple Wallet and Google Wallet passes, using the same colours, fields and QR
// contents the server puts in real passes. Run: node scripts/wallet-mockups.mjs <pictures-dir> <out-dir>
// <pictures-dir> holds art-<n>-thumb.png and art-<n>-hero.jpg drawn by card-art.js for each sample.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { passColours, qrVCard } from '../src/wallet.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [art, out] = process.argv.slice(2);
const qrLib = readFileSync(new URL('../public/vendor/qrcode.js', import.meta.url), 'utf8');

const samples = [
  {
    slug: 'mkoussa/work', label: 'Work',
    card: { name: 'Mohamad Koussa', title: 'Group Head of Procurement & Supply Chain', department: 'Group Procurement', company: 'Bukhatir Group',
      accent: '#2a5ba8', style: 'aurora',
      phones: [{ label: 'mobile', value: '+971 52 692 9505' }, { label: 'work', value: '+971 6 512 6060' }],
      emails: [{ label: 'work', value: 'mohamad.koussa@bukhatir.ae' }], website: 'https://bukhatirgroup.com', whatsapp: '+971526929505' },
  },
  {
    slug: 'sara', label: '',
    card: { name: 'Sara Haddad', title: 'Senior Architect', company: 'Atelier Nour', accent: '#e0559a', style: 'aurora',
      phones: [{ label: 'mobile', value: '+961 3 555 120' }], emails: [{ label: 'work', value: 'sara@ateliernour.example' }],
      website: 'https://ateliernour.example', whatsapp: '+9613555120' },
  },
  {
    slug: 'omar', label: '',
    card: { name: 'Omar Said', title: 'Head of Sales', company: 'Said & Co', accent: '#1fa97a', style: 'solid',
      phones: [{ label: 'mobile', value: '+966 55 010 2030' }], emails: [{ label: 'work', value: 'omar@saidco.example' }] },
  },
];
export { samples };

const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const googleLogo = dataUri(new URL('../public/wallet/google-logo.png', import.meta.url), 'image/png');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rgb = (c) => `rgb(${c.join(',')})`;

function applePass(s) {
  const { card } = s;
  const c = passColours(card);
  const phoneLabel = (p) => ({ mobile: 'MOBILE', work: 'OFFICE', home: 'HOME' })[p.label] || 'PHONE';
  const secondary = [
    card.phones[0] && [phoneLabel(card.phones[0]), card.phones[0].value],
    card.phones[1] ? [phoneLabel(card.phones[1]), card.phones[1].value] : card.whatsapp ? ['WHATSAPP', card.whatsapp] : null,
  ].filter(Boolean);
  const auxiliary = card.emails[0] ? [['EMAIL', card.emails[0].value]] : [];
  const row = (fields) => `<div class="a-row">${fields.map(([l, v]) => `<div class="a-field"><div class="a-label">${l}</div><div class="a-value" dir="auto">${esc(v)}</div></div>`).join('')}</div>`;
  return `<div class="apple-pass" style="background:${rgb(c.background)};--label:${rgb(c.label)}">
    <div class="a-top"><span class="a-logotext">${esc(card.company || card.name)}</span>
      ${s.label ? `<div class="a-header"><div class="a-label">CARD</div><div class="a-hvalue">${esc(s.label)}</div></div>` : ''}</div>
    <div class="a-primary"><div><div class="a-label">${esc((card.title || 'Business card').toUpperCase())}</div>
      <div class="a-name" dir="auto">${esc(card.name)}</div></div></div>
    ${row(secondary)}${auxiliary.length ? row(auxiliary) : ''}
    <div class="a-barcode"><div class="qr" data-text="${encodeURIComponent(qrVCard(card, `https://mkcards.pages.dev/${s.slug}`))}"></div>
      <div class="a-alt">MK Cards</div></div>
    <div class="a-info">i</div>
  </div>`;
}

function appleBack(s) {
  const { card } = s;
  const link = `https://mkcards.pages.dev/${s.slug}`;
  const rows = [
    card.company && ['COMPANY', esc([card.company, card.department].filter(Boolean).join(' · '))],
    ...card.phones.map((p) => [({ mobile: 'MOBILE', work: 'OFFICE', home: 'HOME' })[p.label] || 'PHONE', `<a>${esc(p.value)}</a>`]),
    ...card.emails.map((e) => ['EMAIL', `<a>${esc(e.value)}</a>`]),
    card.whatsapp && ['WHATSAPP', `<a>${esc(card.whatsapp)}</a>`],
    card.website && ['WEBSITE', `<a>${esc(card.website)}</a>`],
    ['MY CARD', `<a>${link.replace('https://', '')}</a>`],
    ['SAVE THIS CONTACT', 'Scan the QR code on the front with any phone camera to add this contact.'],
  ].filter(Boolean);
  return `<div class="apple-back"><div class="ab-title">Pass Details</div>
    <div class="ab-group"><div class="ab-row"><span>Automatic Updates</span><span class="toggle"></span></div>
    <div class="ab-row"><span>Show On Lock Screen</span><span class="toggle"></span></div></div>
    <div class="ab-group">${rows.map(([l, v]) => `<div class="ab-field"><div class="ab-label">${l}</div><div class="ab-value">${v}</div></div>`).join('')}</div>
    <div class="ab-remove">Remove Pass</div></div>`;
}

function googlePass(s) {
  const { card } = s;
  const c = passColours(card);
  const phoneLabel = (p) => ({ mobile: 'Mobile', work: 'Office', home: 'Home' })[p.label] || 'Phone';
  const second = card.phones[1] ? [phoneLabel(card.phones[1]), card.phones[1].value] : card.whatsapp ? ['WhatsApp', card.whatsapp] : null;
  const title = card.company || card.name;
  return `<div class="g-pass" style="background:${c.hex}">
    <div class="g-top"><span class="g-initial">${esc(Array.from(title)[0].toUpperCase())}</span><span>${esc(title)}</span></div>
    <div class="g-body">
      <div class="g-sub" dir="auto">${esc(card.title || 'Business card')}</div>
      <div class="g-head" dir="auto">${esc(card.name)}</div>
      <div class="g-row">
        ${card.phones[0] ? `<div><div class="g-label">${phoneLabel(card.phones[0])}</div><div class="g-val">${esc(card.phones[0].value)}</div></div>` : '<div></div>'}
        ${second ? `<div style="text-align:right"><div class="g-label">${second[0]}</div><div class="g-val">${esc(second[1])}</div></div>` : ''}
      </div>
      ${card.emails[0] ? `<div class="g-row g-row-tight"><div><div class="g-label">Email</div><div class="g-val">${esc(card.emails[0].value)}</div></div></div>` : ''}
      <div class="g-barcode"><div class="qr" data-text="${encodeURIComponent(qrVCard(card, `https://mkcards.pages.dev/${s.slug}`))}"></div>
        <div class="g-alt">MK Cards</div></div>
    </div>
  </div>`;
}

const phone = (title, body, dark = true) => `<div class="phone ${dark ? 'dark' : 'light'}">
  <div class="status"><span>9:41</span><span class="island"></span><span class="sys"><i></i><i></i><i></i><i></i><b></b></span></div>
  <div class="app-title">${title}</div>${body}</div>`;

const CSS = `
* { box-sizing: border-box; margin: 0; }
body { font-family: -apple-system, "SF Pro Text", Inter, "Segoe UI", Roboto, "Noto Sans Arabic", Arial, sans-serif; background: #e9ecf3; }
.sheet { display: flex; gap: 40px; padding: 48px; align-items: flex-start; flex-wrap: wrap; width: max-content; }
.col { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.caption { font: 600 17px/1.3 inherit; color: #2a3044; text-align: center; max-width: 393px; }
.caption small { display: block; font-weight: 500; color: #69708a; margin-top: 4px; }
.phone { width: 393px; height: 852px; border-radius: 56px; padding: 0 16px; overflow: hidden; position: relative;
  box-shadow: 0 0 0 10px #111, 0 0 0 12px #3a3d45, 0 40px 80px -30px rgba(0,0,0,.6); }
.phone.dark { background: #000; color: #fff; }
.phone.light { background: #f2f2f6; color: #111; }
.status { display: flex; justify-content: space-between; align-items: center; height: 54px; padding: 0 20px; font-weight: 600; font-size: 16px; }
.sys { display: flex; align-items: flex-end; gap: 2px; }
.sys i { display: block; width: 3px; background: currentColor; border-radius: 1px; }
.sys i:nth-child(1) { height: 5px; } .sys i:nth-child(2) { height: 7px; } .sys i:nth-child(3) { height: 9px; } .sys i:nth-child(4) { height: 11px; }
.sys b { display: block; width: 24px; height: 12px; border: 1.5px solid currentColor; border-radius: 4px; margin-left: 6px; box-shadow: inset 0 0 0 2px transparent; background: linear-gradient(90deg, currentColor 80%, transparent 80%) content-box; padding: 1px; }
.island { width: 120px; height: 34px; border-radius: 20px; background: #000; }
.light .island { background: #000; }
.app-title { font-size: 32px; font-weight: 800; margin: 8px 6px 16px; letter-spacing: -.01em; }

/* Apple Wallet generic pass */
.apple-pass { position: relative; border-radius: 14px; padding: 12px 14px 16px; color: #fff; box-shadow: 0 1px 0 rgba(255,255,255,.12) inset; }
.a-top { display: flex; align-items: center; gap: 8px; height: 40px; }
.a-logo { height: 30px; }
.a-logotext { font-size: 17px; font-weight: 600; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.a-header { text-align: right; }
.a-hvalue { font-size: 17px; }
.a-label { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--label); }
.a-primary { margin: 26px 0 22px; }
.a-name { font-size: 30px; font-weight: 400; line-height: 1.15; margin-top: 4px; }
.a-thumb { width: 90px; height: 90px; flex: none; }
.a-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
.a-field:last-child:not(:first-child) { text-align: right; }
.a-value { font-size: 16px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.a-barcode { background: #fff; color: #000; border-radius: 8px; width: 180px; margin: 26px auto 0; padding: 12px 12px 8px; text-align: center; }
.a-barcode .qr svg { width: 156px; height: 156px; display: block; }
.a-alt { font-size: 10px; margin-top: 6px; letter-spacing: .06em; color: #555; }
.a-info { position: absolute; right: 12px; bottom: 12px; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.85);
  font: 600 13px/19px Georgia, serif; text-align: center; font-style: italic; }
.stack-behind { height: 10px; margin: 0 8px; border-radius: 12px 12px 0 0; }

/* Apple Wallet pass details */
.apple-back { font-size: 15px; }
.ab-title { font-size: 17px; font-weight: 600; text-align: center; margin-bottom: 14px; }
.ab-group { background: #1c1c1e; border-radius: 12px; padding: 0 14px; margin-bottom: 18px; }
.ab-row { display: flex; justify-content: space-between; align-items: center; height: 46px; border-bottom: .5px solid #38383a; }
.ab-row:last-child { border: 0; }
.toggle { width: 50px; height: 30px; border-radius: 15px; background: #34c759; position: relative; }
.toggle::after { content: ""; position: absolute; right: 2px; top: 2px; width: 26px; height: 26px; border-radius: 50%; background: #fff; }
.ab-field { padding: 9px 0; border-bottom: .5px solid #38383a; }
.ab-field:last-child { border: 0; }
.ab-label { font-size: 11px; color: #8e8e93; font-weight: 600; letter-spacing: .03em; }
.ab-value { margin-top: 2px; line-height: 1.3; }
.ab-value a { color: #0a84ff; }
.ab-remove { text-align: center; color: #ff453a; background: #1c1c1e; border-radius: 12px; padding: 13px; }

/* Google Wallet generic pass */
.g-pass { border-radius: 24px; overflow: hidden; color: #fff; }
.g-top { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; font-size: 16px; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,.18); }
.g-initial { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.18); font-weight: 600; font-size: 15px; }
.g-body { padding: 14px 18px 22px; }
.g-sub { font-size: 14px; opacity: .85; }
.g-head { font-size: 26px; font-weight: 500; margin-top: 2px; }
.g-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 18px; }
.g-row-tight { margin-top: 12px; }
.g-label { font-size: 12px; opacity: .8; }
.g-val { font-size: 15px; margin-top: 2px; }
.g-barcode { background: #fff; color: #333; border-radius: 16px; width: 196px; margin: 22px auto 4px; padding: 14px 14px 8px; text-align: center; }
.g-barcode .qr svg { width: 168px; height: 168px; display: block; }
.g-alt { font-size: 10px; margin-top: 6px; letter-spacing: .06em; color: #666; }
.g-hero { display: block; width: 100%; }
`;

const qrScript = `${qrLib}
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
for (const el of document.querySelectorAll('.qr')) {
  const qr = qrcode(0, 'M'); qr.addData(decodeURIComponent(el.dataset.text)); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + x + ' ' + y + 'h1v1h-1z';
  el.innerHTML = '<svg viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><path d="' + d + '"/></svg>';
}`;

const screens = [
  { file: 'apple-wallet-front', caption: 'Apple Wallet — front', note: 'Company at the top, title and name, phones and email; QR saves the contact; MK Cards in small print',
    html: phone('Wallet', `<div class="stack-behind" style="background:#2c2c2e"></div>${applePass(samples[0])}`) },
  { file: 'apple-wallet-details', caption: 'Apple Wallet — pass details', note: 'Every phone, email and link, all tappable',
    html: phone('', appleBack(samples[0])) },
  { file: 'google-wallet-front', caption: 'Google Wallet — front', note: 'Same layout as the Apple pass: company, title and name, phones, email; MK Cards under the QR',
    html: phone('', googlePass(samples[0], 0), false) },
  { file: 'apple-wallet-sara', caption: 'Apple Wallet — another colour', note: 'The pass colour follows the card; orange and yellow cards get silver labels instead of gold',
    html: phone('Wallet', `<div class="stack-behind" style="background:#2c2c2e"></div>${applePass(samples[1])}`) },
  { file: 'google-wallet-omar', caption: 'Google Wallet — another colour', note: 'The pass colour follows the card',
    html: phone('', googlePass(samples[2], 2), false) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const s of screens) {
  await page.setContent(`<style>${CSS}</style><div class="sheet"><div class="col">${s.html}<div class="caption">${s.caption}<small>${s.note}</small></div></div></div>`);
  await page.addScriptTag({ content: qrScript });
  await page.locator('.col').screenshot({ path: `${out}/${s.file}.png` });
}
await page.setContent(`<style>${CSS}</style><div class="sheet">${screens.map((s) => `<div class="col">${s.html}<div class="caption">${s.caption}<small>${s.note}</small></div></div>`).join('')}</div>`);
await page.addScriptTag({ content: qrScript });
await page.locator('.sheet').screenshot({ path: `${out}/wallet-cards-overview.png` });
// The QR codes as they will appear, for a scan check.
writeFileSync(`${out}/qr-texts.json`, JSON.stringify(samples.map((s) => qrVCard(s.card, `https://mkcards.pages.dev/${s.slug}`))));
await browser.close();
console.log('mockups written');
