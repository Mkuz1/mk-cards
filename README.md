# MK Cards

A digital business card service: register, make a card at `mkcards.pages.dev/username`, share it with a
link or QR code, and let people save your contact and send theirs back.

- `web/` — the site, API and database, running as a Cloudflare Worker behind `mkcards.pages.dev`.
- `android/` — the Android app. It shows the site full-screen and adds Google Play in-app updates,
  the system share sheet, saving contacts and QR codes, and photo picking.
- `ios/` — the iPhone app (same idea: the site plus share sheet, saving contacts and files, Add to Apple Wallet).
  Built on GitHub's Macs by `.github/workflows/ios.yml`.

All code, design and wording here is original to MK Cards.

## How it is hosted

- **Worker `mkcards`** (`web/`): the API, the site's files (bundled into the Worker at build time) and the
  database. The database is a SQLite-backed Durable Object named `Store` that lives inside the Worker,
  so all user data stays on Cloudflare. Direct address: `https://mkcards.mk-uz02.workers.dev`.
- **Pages project `mkcards`** (`web/pages-proxy/`): a one-line worker that hands every request to the
  Worker, so the public address is `https://mkcards.pages.dev`.

## Run the site locally

```bash
cd web
npm install
npm run dev
```

Then open http://127.0.0.1:8787. Local data is kept in `web/.wrangler`.

## Publish a change

```bash
cd web
npm run deploy
```

That rebuilds the bundled files and updates the Worker; `mkcards.pages.dev` follows automatically.
The Pages proxy only needs redeploying if `pages-proxy/_worker.js` changes.

Before going live:

- Edit `web/public/privacy.html` (it is a draft with a placeholder contact address).
- Sign-up and log-in attempts are throttled per address inside the API. For the public
  `POST /api/public/contacts` form, add a Cloudflare WAF rate-limiting rule; it only has a honeypot
  and a per-card cap.

### Releasing a new web version

Change the version in **both** `web/public/app.js` (`APP_VERSION`) and `web/public/sw.js` (`VERSION`),
then deploy. People with the site open see a "new version is ready — Update" notice.

## Build the Android app

1. `android/gradle.properties` points the app at `https://mkcards.pages.dev`; change `MK_SITE_URL` if you
   attach your own domain. Choose
   `MK_APPLICATION_ID` (it can never change after the first Play upload).
2. Create a signing key once and keep it safe:
   ```bash
   keytool -genkeypair -v -keystore mk-cards.jks -alias mkcards -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Build the bundle Google Play wants:
   ```bash
   cd android
   MK_KEYSTORE=/path/to/mk-cards.jks MK_KEYSTORE_PASSWORD=... MK_KEY_ALIAS=mkcards MK_KEY_PASSWORD=... ./gradlew bundleRelease
   ```
   The file is `app/build/outputs/bundle/release/app-release.aab`.

For a quick test build: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.

### Card links opening in the app

Publish `web/public/.well-known/assetlinks.json` with your package name and the SHA-256 fingerprint
of the Play signing key (Play Console → Setup → App signing shows the exact file to use). Until then,
card links open in the browser, which also works.

Google Play's data-safety form: the app collects name, email and contact details, and offers in-app
account deletion (Settings → Delete my account).

### In-app update notice

The app asks Google Play on every launch whether a newer release exists. If so, the page shows
"An update for MK Cards is available — Update"; the download runs in the background and then
"The update is downloaded — Restart" appears. This only works for copies installed from Google Play
(use an internal testing track to try it); side-loaded builds report "Could not check for updates".

To ship an update, raise `versionCode` and `versionName` in `android/app/build.gradle.kts`.

## Accounts and data

- People register with a username, email and password, then log in from any browser or the Android app.
- Everything is stored on Cloudflare, in the Worker's built-in SQLite database: accounts, cards, photos
  and received contacts.
  Nothing about a user is kept only on their device; the browser holds just a login cookie.
- A user's first card is their main card at `https://mkcards.pages.dev/username`. Extra cards (up to 10)
  are added with "Add another card"; each takes its link from the card's name, for example a card named
  "Work" lives at `/username/work`.
- A card can hold up to 6 phone numbers and 6 email addresses, each marked Mobile/Work/Home/Personal/Other.
- The QR code is generated from the card's address, so it never changes and can be downloaded as PNG
  or SVG as often as wanted.
- Passwords are stored as salted PBKDF2-SHA256 hashes. Sessions last 30 days in an HttpOnly cookie.
- Users can delete their account in Settings; that removes their cards and received contacts too.

- QR files are made by the Worker (`/api/cards/<id>/qr.png` or `.svg`) and only the card's owner can download them.
- Wrong passwords are limited per address (20 per 15 minutes) and per account (10 per 15 minutes).
- Every response carries browser security headers (content security policy, no framing, HSTS).
- Passwords are changed from Settings → Change password, using the current password. There is
  deliberately no reset by email, so a forgotten password cannot be recovered.
- Email addresses are accepted as typed (not verified).
- Each public page (`/username`) shows the contact details and a Download vCard button. It does not show
  the QR code: only the owner can download a card's QR code, from the Cards screen or the Share screen.
- "Share your details" on a public page opens the visitor's own email app with a ready message to the
  owner's account email (so that address is visible to visitors who use it). A copy also lands in the
  owner's Contacts list.
- A card can carry a WhatsApp number; its page then shows a "Chat on WhatsApp" button (`wa.me` link).
- When adding a photo, the owner drags and zooms it inside the frame; "Adjust position" reopens that step.

## Photos and pictures

- Card photos are stored in their own table (`media`), apart from the card records, and served at
  `/media/<id>.jpg` with long caching (the address changes whenever the photo does).
- When a card is saved, the browser also draws three pictures from it (`public/card-art.js`):
  the link-preview image (1200×630), the Apple Wallet photo tile and the Google Wallet banner.
  Pages carry `og:image` / `twitter:image` tags pointing at the preview. Cards saved before this are
  redrawn automatically the next time their owner opens the Cards screen.

## Apple Wallet and Google Wallet

Each card can be added to Apple Wallet and Google Wallet from the Cards and Share screens. The pass
QR code holds the contact itself (a vCard), so scanning it with any phone camera offers "Add contact".
The buttons appear once each wallet is set up. Mockups: `docs/wallet-mockups/`.

### Apple Wallet setup (done)

Set up with the Pass Type ID `pass.app.mkcards.card`. The Worker holds the private key (`APPLE_PASS_KEY`)
and the certificate (`APPLE_PASS_CERT`); the pass type ID and team ID are read from the certificate.
Apple's intermediate certificate (WWDR G4, valid to 2030) is bundled in `web/src/apple-wwdr.js`.

**The pass certificate expires on 16 December 2027.** To renew: on developer.apple.com open the Pass Type ID,
create a new certificate from a new certificate request, and replace `APPLE_PASS_CERT` (and `APPLE_PASS_KEY`
if a new key was made) with `npx wrangler secret put`.

### Google Wallet setup

1. pay.google.com/business/console → **Google Wallet API** → note the **Issuer ID**.
2. console.cloud.google.com → create a project → enable **Google Wallet API** → IAM → **Service accounts**
   → create one → **Keys** → add a JSON key (downloads a .json file).
3. Back in the Wallet console → **Users** → invite the service account's email as a Developer.
4. Cloudflare dashboard → Workers → `mkcards` → Settings → Variables and secrets:
   - secret `GOOGLE_WALLET_KEY` = the whole contents of the JSON key file
   - variable `GOOGLE_WALLET_ISSUER_ID` = the Issuer ID
5. Until Google approves the issuer account for publishing, only test users added in the Wallet console
   can save passes. Request publishing access from the console when ready.

## iPhone app (IPA)

`.github/workflows/ios.yml` builds an unsigned IPA on every push to `main` that touches `ios/`
(or by hand from the Actions tab). Download it from the run's Artifacts or the `ios-build` branch, then
install it with Sideloadly or AltStore, which sign it with your Apple ID (a paid developer account keeps
it installed for a year). To build on a Mac instead: `brew install xcodegen`, then in `ios/` run
`xcodegen generate` and open `MKCards.xcodeproj`.

## Analytics

Every card counts views, contact saves ("Save contact" on the card page), and taps on WhatsApp, call,
email, website, QR code and share, per day (`events` table). The owner sees them on each card tile and in
the statistics window, and downloads them as **Activity CSV**. Owners' own visits are not counted. Scans of a
printed or wallet QR code save the contact without visiting the page, so they cannot be counted.

## Company workspaces

- **Admin → Set up your company** creates a workspace; its creator is the owner, who can make others admins.
- **Import people** reads a CSV (columns: `email, name, title, department, mobile, office, whatsapp, role,
  name_ar, title_ar, department_ar, company_ar`; download the template from the Admin page). New people get an
  account, a card in the company colour and a temporary password; the admin downloads the sign-in details once.
  People must choose their own password when they first sign in. Importing someone already in the company
  updates their main card.
- **Deactivate** stops a person signing in and switches off all their cards: visitors see the company's
  "no longer with us" message (Company settings; `{name}` and `{company}` are filled in) and the company's
  contact details. **Reactivate** restores everything. Single cards can be switched off and on too, by their
  owner or an admin.
- **Export people** and **Activity CSV** download the member list and the company's activity.
- Not built yet: billing and seat limits (plans show "Trial"), admins editing members' card text directly
  (re-importing a CSV updates cards), single sign-on.

## Selling the app (notes)

- Company plans can be sold and invoiced on the website: Apple's rules allow business-to-business services
  sold outside the App Store (guideline 3.1.3(c)), and the same applies on Google Play. Members simply sign in
  to the free apps.
- Paid plans bought by individuals inside the iPhone or Android app must use Apple's or Google's billing.
- Payments need a provider account (for example Stripe for the website) before they can be built.
- Apple can reject apps that are "just a website" (guideline 4.2). The iPhone app's native parts (Wallet,
  Contacts, share sheet) help; native extras such as NFC tag writing or a home-screen widget would help more.
- Store listings need: the final privacy policy, a demo account for Apple's reviewers, and Google Play's
  data-safety form (the app has in-app account deletion).

## Sales tools (v2.3)

- **Contacts** (`/contacts`): everyone who shared their details on a card page, plus scanned cards and badges.
  Export as CSV, save to the phone, or send to Salesforce.
- **Scanning** (`/scan`): photograph a business card (read by Cloudflare Workers AI, binding `AI`; the photo is not
  kept) or an event badge's QR code (vCard, MECARD or an MK Cards link). The iPhone app uses Apple's document camera.
- **Salesforce**: Admin page (companies) or Contacts page (individuals) › Salesforce. Each customer creates an External
  Client App in their Salesforce (callback `https://mkcards.pages.dev/api/crm/salesforce/callback`, scopes `api` and
  `refresh_token`, PKCE) and pastes its consumer key and secret. Contacts become Leads (Lead Source "MK Cards"),
  owned by the card holder when their email matches a Salesforce user. Tokens are encrypted with the `TOKEN_KEY` secret.
  To offer one-click connect without customers making an app, set Worker secrets `SALESFORCE_CLIENT_ID` and
  `SALESFORCE_CLIENT_SECRET` from an app in your own Salesforce org.
- **Email signatures** (`/signature/<card>`) and **video-call backgrounds** (`/background/<card>`, 1920×1080).

## Company sign-in (Microsoft and Google)

The buttons appear once these Worker secrets are set (Cloudflare dashboard › Workers › mkcards › Settings › Variables):

- Microsoft: register an app at https://entra.microsoft.com › App registrations › New registration. Account type:
  "Accounts in any organizational directory (multitenant)". Redirect URI (Web):
  `https://mkcards.pages.dev/api/auth/sso/microsoft/callback`. Create a client secret. Set `MICROSOFT_CLIENT_ID`
  (Application ID) and `MICROSOFT_CLIENT_SECRET`.
- Google: https://console.cloud.google.com › APIs & Services › Credentials › Create OAuth client ID › Web application.
  Redirect URI `https://mkcards.pages.dev/api/auth/sso/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
  Publish the consent screen (scopes: openid, email, profile).
- Apple (iPhone app): nothing to set on the server; the token's audience is the bundle ID `app.mkcards`.

A company admin connects their tenant/domain on the Admin page by signing in once with a work account, then can add
people automatically and require company sign-in. People can also connect Microsoft/Google to their own account
from the Account page.

## Company tools (v2.4)

- **Bulk import** (Admin › Import people): CSV with every card field (`Import template`). Columns `username` and
  `temporary_password` are optional: empty usernames are made from the email, empty passwords are generated.
  Everyone with a temporary password must choose their own at first sign-in. A row for someone already in the company
  updates their main card (and resets their password if it has a temporary_password).
- **Export staff cards** (Admin): one row per card with all details, `card_link`, `save_contact_link`, `qr_code_png`,
  `email_signature_link`, `video_call_background_link` plus one link per colour (`video_call_background_navy`, `_company`,
  `_black`, `_emerald`, `_burgundy`, `_sand`, `_white`; public pages `/tools/signature?u=…&s=…` and
  `/tools/background?u=…&s=…&colour=…`), the username, and the temporary password until it is changed (stored encrypted
  with `TOKEN_KEY`, deleted when the person sets their own).

## Card designer (v2.5)

One printed-card design per company; every member's card uses it.

- **Admin › Card design** (`/admin/design`): front and back on a stage in millimetres (size and bleed adjustable).
  Drag, resize and nudge elements; add text fields (name, title, mobile, email, Arabic fields…), free text, lines,
  boxes, the QR code and the logo; set font, size, weight, colour, alignment and prefix for each. Upload background
  artwork per side (SVG, PNG or JPEG, up to 2 MB; SVGs are cleaned) and the company's own fonts (regular and bold,
  TTF/OTF up to 1.5 MB). Preview with any staff member's details. "Let staff download their own card" is a switch.
- **Admin › Print cards** (`/admin/print`): pick people, preview, download front and back SVGs as a ZIP, with or
  without crop marks. Staff (when allowed) use "Print card (SVG)" in their card menu.
- Text is turned into outlines in the browser with HarfBuzz (`web/public/print/hb/`), so the printer needs no fonts and
  Arabic joins correctly. Built-in fonts are subsets of Inter, Noto Serif, Noto Kufi Arabic and Noto Naskh Arabic
  (`web/public/print/fonts/`, OFL; see `LICENSES.txt`). The QR code is vector. Code: `web/public/print-engine.js`,
  API `/api/print*` in `web/src/index.js`.
