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

### Apple Wallet setup

The private key is already stored in the Worker (secret `APPLE_PASS_KEY`). What is left:

1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → **+** → **Pass Type IDs**.
   Description "MK Cards", identifier for example `pass.app.mkcards.card`.
2. Open that Pass Type ID → **Create Certificate** → upload `MKCards-PassTypeID.certSigningRequest`
   (sent with this project) → download `pass.cer`.
3. Store it in the Worker as the secret `APPLE_PASS_CERT` (PEM). The certificate is public, so it can be
   handed over freely; to do it yourself:
   ```bash
   openssl x509 -inform DER -in pass.cer -out pass.pem
   npx wrangler secret put APPLE_PASS_CERT < pass.pem
   ```

The pass type ID and team ID are read from the certificate. Apple's intermediate certificate (WWDR G4,
valid to 2030) is bundled in `web/src/apple-wwdr.js`.

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
