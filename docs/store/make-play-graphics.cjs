const { chromium } = require('playwright');
const fs = require('fs');
const raw = process.argv[2], out = process.argv[3];
const img = (n) => 'data:image/png;base64,' + fs.readFileSync(`${raw}/${n}.png`).toString('base64');
const icon = 'data:image/png;base64,' + fs.readFileSync(process.argv[4]).toString('base64');

const css = `*{box-sizing:border-box;margin:0}
body{font-family:Roboto,"Helvetica Neue",Arial,sans-serif;overflow:hidden;color:#fff;
 background:radial-gradient(700px 520px at 0% 0%,rgba(120,160,230,.38),transparent 70%),radial-gradient(640px 560px at 100% 100%,rgba(213,183,87,.28),transparent 70%),linear-gradient(160deg,#1d3a6b,#0b1a33 55%,#060f22)}
.serif{font-family:"Playfair Display","Georgia",serif}
.gold{color:#e1c46a}
.phone{position:absolute;border-radius:64px;padding:16px;background:#05070c;box-shadow:0 0 0 2px rgba(213,183,87,.55),0 50px 100px -30px rgba(0,0,0,.8)}
.phone img{display:block;width:100%;border-radius:50px}
.phone:after{content:"";position:absolute;top:34px;left:50%;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#000;box-shadow:0 0 0 3px #111}
.chip{position:absolute;display:flex;align-items:center;gap:12px;padding:16px 24px;border-radius:999px;background:rgba(255,255,255,.96);color:#0d1b33;font-weight:700;font-size:30px;box-shadow:0 20px 40px -12px rgba(0,0,0,.5)}
.chip i{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#18794e;color:#fff;font-style:normal;font-size:24px}`;

const shots = [
  ['01-share', 'SHARE IN ONE TAP', 'Your card in <span class="gold">one scan</span>', 'QR code · NFC tag · Google Wallet', ['✓', 'No app needed to receive it']],
  ['02-cards', 'MAKE AN IMPRESSION', 'A card for <span class="gold">every audience</span>', 'Work, events, clients, all in your colours', null],
  ['04-scan', 'SCAN', 'Scan any <span class="gold">business card</span>', 'Details read for you, even offline', ['✓', 'Layla Haddad saved']],
  ['05-contacts', 'NEVER LOSE A LEAD', 'Every contact in <span class="gold">one place</span>', 'Search, save to your phone, send to Salesforce', null],
  ['03-card-detail', 'KNOW WHAT WORKS', 'See who\'s <span class="gold">interested</span>', 'Views, contact saves and calls, day by day', ['↑', '248 views this month']],
  ['06-contact', 'FOLLOW UP FAST', 'Reply in <span class="gold">seconds</span>', 'Call, WhatsApp or email from the contact', null],
  ['07-account', 'FOR TEAMS', 'Ready for your <span class="gold">whole company</span>', 'Microsoft & Google sign-in, company workspaces', null],
  ['08-welcome', 'MK CARDS', 'Your business card, <span class="gold">always with you</span>', 'Free to start. English and Arabic.', null],
];

function screen([file, eyebrow, title, sub, chip], i) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body{width:1080px;height:1920px}
  .cap{position:absolute;top:110px;left:70px;right:70px;text-align:center}
  .eb{font-size:28px;letter-spacing:.34em;color:#e1c46a;font-weight:700}
  h1{font-size:84px;line-height:1.06;margin-top:22px;font-weight:700}
  .rule{width:70px;height:4px;background:#d5b757;margin:28px auto 0;border-radius:2px}
  .sub{margin-top:24px;font-size:36px;color:rgba(255,255,255,.82)}
  </style></head><body>
  <div class="cap"><div class="eb">${eyebrow}</div><h1 class="serif">${title}</h1><div class="rule"></div><div class="sub">${sub}</div></div>
  <div class="phone" style="left:240px;top:560px;width:600px"><img src="${img(file)}"></div>
  ${chip ? `<div class="chip" style="${i % 2 ? 'left:60px' : 'right:60px'};top:${i % 2 ? 1500 : 1330}px"><i>${chip[0]}</i>${chip[1]}</div>` : ''}
  </body></html>`;
}

const feature = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
 body{width:1024px;height:500px}
 .left{position:absolute;left:64px;top:84px;width:520px}
 .brand{display:flex;align-items:center;gap:20px}
 .brand img{width:88px;height:88px;border-radius:22px;box-shadow:0 14px 30px -10px rgba(0,0,0,.6)}
 .brand b{font-size:64px;font-weight:700}
 .rule{width:60px;height:3px;background:#d5b757;margin:22px 0 18px;border-radius:2px}
 .tag{font-size:34px;line-height:1.2;font-weight:600}
 .pills{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap}
 .pills span{padding:9px 16px;border-radius:999px;border:1.5px solid rgba(225,196,106,.7);color:#f3e6b8;font-size:19px;font-weight:600;background:rgba(255,255,255,.06)}
 .phone{padding:8px;border-radius:34px}.phone img{border-radius:27px}.phone:after{top:17px;width:11px;height:11px;margin-left:-5px}
 </style></head><body>
 <div class="left"><div class="brand"><img src="${icon}"><b class="serif">MK Cards</b></div><div class="rule"></div>
 <div class="tag">Your business card,<br><span class="gold">always with you.</span></div>
 <div class="pills"><span>QR code</span><span>NFC</span><span>Google Wallet</span><span>Card scanner</span></div></div>
 <div class="phone" style="left:640px;top:70px;width:230px;transform:rotate(-8deg)"><img src="${img('02-cards')}"></div>
 <div class="phone" style="left:780px;top:40px;width:240px;transform:rotate(6deg)"><img src="${img('01-share')}"></div>
 </body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  fs.mkdirSync(out, { recursive: true });
  for (const [i, s] of shots.entries()) {
    await p.setContent(screen(s, i)); await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/phone-${i + 1}-${s[0].slice(3)}.png` });
  }
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.setContent(feature); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/feature-graphic-1024x500.png` });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
