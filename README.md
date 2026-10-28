# Fulhadhoo Beach Cottage Booking Manager

A SvelteKit booking manager with a Cloudflare Workers backend, Cloudflare D1 (SQLite-compatible) persistence, secure owner sessions, and optional Resend transactional email. D1 is the central production database; guest records are not stored in browser local storage and are available across signed-in devices.

The app retains the original four room names, booking sources, booking states, payment fields, and cottage color palette from the standalone `Home.html` edition. The old browser-only edition has been replaced with a link to this server-backed application; do not enter live guest records in old backups or untrusted copies.

## Features

- One-time owner account setup followed by sign-in/sign-out.
- Opaque, random, server-validated sessions in HttpOnly cookies.
- Responsive room calendar, booking list/search, room status, occupancy and arrival statistics.
- Create, edit, cancel, and delete bookings, including guest contact and payment details.
- Server-side date, room, status, email, amount, and field validation.
- SQLite triggers prevent overlapping active bookings, including concurrent writes.
- Calendar “today” and new-booking defaults use the property timezone, `Indian/Maldives` (UTC+05:00); stored booking dates remain timezone-independent date values.
- JSON backup/export, CSV export with spreadsheet formula injection protection, and validated restore (maximum 500 bookings).
- Resend confirmation, update, and cancellation messages with a retry queue.
- Versioned D1 schema migrations and Cloudflare Worker deployment configuration.

## Requirements

- Node.js 22.12 or later (Node 24 recommended).
- npm.
- A Cloudflare account with Workers and D1 enabled for production.
- A Resend account and verified sending domain for email notifications.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local secret file from the template and replace the example bootstrap key with at least 24 random characters:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   `.dev.vars` is ignored by Git. Do not copy production credentials into a tracked file. Add your Resend key and sender only if testing email; Resend credentials must remain server-side.

3. Generate a local D1 database and apply its migration:

   ```bash
   npx wrangler d1 migrations apply booking-manager --local
   ```

   Wrangler's local D1 database is an emulator, not the production database. After changing a migration, reset local test data only if it is safe to do so; never reset production as a development shortcut.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite. Choose **First-time owner setup**, enter the bootstrap key from `.dev.vars`, and create an owner password of at least 12 characters. The setup route accepts only one owner account. Do not expose the setup key publicly; remove the `BOOTSTRAP_SECRET` secret after creating the production owner account.

## Database and migrations

`migrations/0001_initial_schema.sql` creates the user, session, authentication rate-limit, booking, and email-outbox tables and indexes. It also adds database-level overlap triggers; the check-in date is inclusive and the check-out date is exclusive.

Production data is held in the Cloudflare D1 database binding named `DB`. Do not mount, upload, or synchronize a SQLite file between browsers/devices. Apply schema changes as reviewed migrations, back up production data before high-risk schema changes, and use fictional records in local/test environments.

## Cloudflare setup and deployment

1. Create a D1 database in the correct Cloudflare account:

   ```bash
   npx wrangler d1 create booking-manager
   ```

2. Replace `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` in `wrangler.toml` with the returned database ID. Confirm the Worker name, account, database, and custom domain before any remote operation.

3. Apply the migration to the intended production database:

   ```bash
   npm run db:remote
   ```

4. Set the private bootstrap secret and Resend credentials through Wrangler's secret interface:

   ```bash
   npx wrangler secret put BOOTSTRAP_SECRET
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put RESEND_FROM
   ```

   `RESEND_FROM` may be a normal Worker variable instead of a secret if the sender address is not confidential; keep the API key secret. Never put actual secret values in `wrangler.toml`, source, shell history, screenshots, issue reports, or Git.

   If a Resend API key has been shared in chat, email, or another untrusted place, revoke it in Resend and create a replacement before using this application. Then authenticate Wrangler with `npx wrangler login` and enter the replacement directly at the `wrangler secret put RESEND_API_KEY` prompt. Do not paste the key into project files or command arguments.

5. Install, check, build, and deploy:

   ```bash
   npm install
   npm run check
   npm test
   npm run build
   npx wrangler deploy
   ```

   The build uses SvelteKit's Cloudflare adapter. `wrangler.toml` enables Node.js compatibility for Worker-supported Node APIs and binds D1. Validate the generated Worker entry and static asset directory against the installed adapter/Wrangler versions before the first deployment.

6. Connect the custom domain in Cloudflare, enforce HTTPS, and verify that the Worker route is bound to the intended host. Cloudflare serves HTTPS; the app marks HTTPS sessions as Secure and adds HSTS on HTTPS responses.

7. Open the production site and create the owner account using the private bootstrap secret. Afterward, remove `BOOTSTRAP_SECRET` from the production Worker secrets and keep the account password in a password manager.

   Remove the setup key once the account is confirmed:

   ```bash
   npx wrangler secret delete BOOTSTRAP_SECRET
   ```

8. For continuous deployment, connect the GitHub repository through **Cloudflare Workers & Pages → Create application → Import a repository**. Select the production branch (`main`), configure `npm run deploy` as the build/deploy command, and set Node.js to 22.12 or later. Each push to the configured branch then runs the checks/build and deploys through Wrangler. Keep D1 bindings and runtime secrets in Cloudflare Worker settings; do not add them as repository files or expose them to pull-request builds.

The `preview` script runs `wrangler dev`. Verify the development and remote D1 environment explicitly; do not treat local preview as a production deployment.

## Configuration

| Name | Location | Purpose |
|---|---|---|
| `DB` | Cloudflare D1 binding | Canonical booking, user, session, and email-outbox storage |
| `BOOTSTRAP_SECRET` | Wrangler secret / local `.dev.vars` | One-time owner account creation; remove after setup |
| `RESEND_API_KEY` | Wrangler secret / local `.dev.vars` | Server-side Resend authorization |
| `RESEND_FROM` | Worker variable or secret / local `.dev.vars` | Verified sender address |

If Resend is not configured, bookings are still saved, while the UI reports that email is waiting for configuration. Provider failures are recorded in the outbox and can be retried from **Backups**. Repeated sends use the outbox event ID as the Resend idempotency key.

## API overview

All booking endpoints require the owner session. Cookie-authenticated writes require a matching `Origin` header; cross-origin API access is not enabled.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/setup` | One-time owner setup (`X-Bootstrap-Secret`) |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Revoke session |
| `GET` | `/api/auth/session` | Current session |
| `GET` | `/api/bookings` | List bookings (up to 1,000 per request; supports `limit` and `offset`) |
| `POST` | `/api/bookings` | Create booking |
| `GET` | `/api/bookings/:id` | Read a booking |
| `PATCH` | `/api/bookings/:id` | Update a booking |
| `DELETE` | `/api/bookings/:id` | Permanently delete a booking |
| `POST` | `/api/bookings/import` | Validate and replace bookings from a JSON backup (up to 500 records) |
| `POST` | `/api/emails/retry` | Retry up to 20 queued or failed emails |

## Security and privacy

- Passwords use PBKDF2-HMAC-SHA-256 with 600,000 iterations and a unique random salt. Sessions are 256-bit random tokens; only SHA-256 token hashes are persisted.
- Session cookies are HttpOnly, SameSite=Lax, scoped to `/`, and Secure on HTTPS.
- Login and setup attempts are rate-limited per Cloudflare client IP. Booking writes are validated and parameterized; overlap prevention is enforced in SQLite, not just in the UI.
- Response security headers include a nonce-based Content Security Policy, frame denial, MIME-sniffing protection, a referrer policy, and a restrictive Permissions Policy.
- Guest text is rendered through Svelte escaping and email HTML escaping. CSV output neutralizes formula-leading cells.
- Guest contact and stay details are personal data. Limit account access, protect exported files, set an appropriate business retention policy, and avoid putting guest information in logs or support requests.

## Checks and maintenance

```bash
npm run check
npm test
npm run build
```

Before deploying schema or dependency changes, review the migration and lockfile, take a production backup where appropriate, apply migrations to the correct environment, run the focused checks, and confirm Worker logs do not include guest data or credentials. Create and test a D1 backup/restore runbook in the Cloudflare account; do not rely on browser exports as the sole production backup.

The production dependency audit (`npm audit --omit=dev`) should be run before releases. The current development toolchain may report low-severity advisories in its transitive `deepmerge` build-time dependency; the registry does not currently list a patched `deepmerge` release. It is not part of the production dependency tree or runtime request path.

## Known scope and operational notes

- This is a single-property, single-owner starter; it does not include staff invitations, public guest booking, payment processing, channel synchronization, or live multi-user presence.
- D1 is the central online store. Devices need network access and a valid session to read or change bookings.
- Booking value uses USD and all room capacities are limited to 10 guests, matching the original interface's assumptions. Confirm these business rules before production if they differ.
- Calendar and dashboard requests currently load the first 1,000 bookings. For larger datasets, add a paginated UI before reaching that limit.
- Email notifications are sent after the booking transaction commits. A provider problem does not roll back a saved reservation; the outbox retains failed events for retry.
