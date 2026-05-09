# Changelog

All notable changes to Finwise are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.8.0-beta] — 2026-05-09

### Fixed

- **Transfer deletion left envelopes over-charged.** When deleting either leg of a transfer pair, the envelope reversal only checked the single transaction clicked — not both legs. Deleting the "Transfer in" side skipped the reversal entirely because only the "Transfer out" side carries `envelope_id`. Both legs are now fetched before the delete and any envelope charges are reversed regardless of which side triggered the deletion.
- **Deleting an account left envelopes over-charged.** `deleteAccount` bulk-deleted all transactions for the account without reversing their envelope contributions first. Expense and outgoing-transfer transactions with a category assigned would leave the envelope `spent` counter permanently inflated. The delete now fetches and reverses all such charges before removing the transactions.

### Added

- **Category dropdown in Debt page — Make Payment dialog.** Debt payments can now be tagged with a budget category so the payment is tracked against the correct envelope (e.g. "Car Loan EMI", "Credit Card Payment").
- **Category dropdown in Investments page — Linked Account transfer tab.** Transfers to/from investment and savings accounts can now be assigned a budget category, charged against the outgoing (budget-account) side of the transfer.
- **Bi-directional transfer toggle in Budget account sheets.** Every account's transaction sheet now has a "Send from / Deposit into" direction toggle on the Transfer tab, matching what the Investments sheet already had. This lets you record an incoming payment directly from a debt account's own sheet instead of having to navigate to the source account.

---

## [0.7.8-beta] — 2026-05-08

### Fixed

- **AI chat streaming: words concatenated with no spaces.** The SSE data parser used `.trim()` on the `data:` field value. The SSE spec says to strip exactly one leading space (the separator after `data:`), not all whitespace. When a token is a single space character, `.trim()` collapsed it to an empty string and it was dropped — causing every word to run together in the streamed output. Fixed by using `raw.startsWith(" ") ? raw.slice(1) : raw` instead.

---

## [0.7.7-beta] — 2026-05-08

### Changed

- **Currency support trimmed to 7.** Removed AUD, CAD, HKD, and TWD. Supported currencies are now: **INR, USD, SGD, GBP, EUR, JPY, NTD**. Updated across the Zod schema, DB type annotations, all UI currency selectors (Settings, Budget, Investments), the AI prompt, and FAQ text.
- **Correct locale per currency.** Each currency now uses its proper `Intl.NumberFormat` locale: `en-IN` (INR), `en-US` (USD), `en-SG` (SGD), `en-GB` (GBP), `en-IE` (EUR — western comma grouping), `ja-JP` (JPY), `zh-TW` (NTD). Applied consistently in the AI tool formatter, context builder, and the shared `currency.ts` utility.

---

## [0.7.6-beta] — 2026-05-08

### Fixed

- **AI mixing currency symbols and labels** (e.g. "$26,028,884 (in INR)"). Tool results were returned as raw JSON objects full of bare INR numbers; the model was left to format and convert them itself, which it did incorrectly. Tool outputs are now formatted server-side — every monetary amount is converted to the user's display currency and formatted with the correct locale before being sent to the model. The model receives plain text like `Net Worth: $26,028` and has nothing to reinterpret.

---

## [0.7.5-beta] — 2026-05-08

### Changed

- **AI chat now uses tool calling instead of pre-loaded context.** The model no longer receives a static dump of all financial data in the system prompt. Instead it is given tools it can call on demand — `get_net_worth`, `get_envelope_summary`, `get_monthly_summary`, `get_transactions`, `get_investment_summary`, `get_policy_timeline`, `get_exchange_rates`, `refresh_investment_price`, `refresh_exchange_rates`. For each message the model decides which tools it needs, fetches only that data, and then generates its answer. General knowledge questions (investment principles, tax strategy, etc.) are answered from the model's own training without any tool call.
- **Ollama context window raised to 16 384 tokens** (`num_ctx`) on all chat and tool-calling requests. The previous default of 2 048 tokens caused the system prompt and financial snapshot to be silently truncated, which is why the model was saying amounts were "not explicitly stated."

---

## [0.7.4-beta] — 2026-05-08

### Changed

- **AI model switched to `gemma4:e2b`.** Default Ollama model changed from `gemma4:e4b` to `gemma4:e2b` across the server config, client store, and all UI references. The e2b variant is smaller and faster while maintaining the same instruction-following quality for financial queries.

### Fixed

- **AI reporting garbage budget totals.** The model was receiving individual envelope amounts with no pre-computed total and attempting to add them itself, producing a stream of raw arithmetic instead of a summary. The financial context now includes a `SUMMARY` line with pre-computed total budgeted, total spent, and total remaining before the per-envelope detail rows — the model reads the answer directly instead of calculating it.
- **AI formatting non-INR amounts with Indian number grouping.** `Intl.NumberFormat` was using the `en-IN` locale for all currencies, formatting `$275,867` as `$2,75,867`. The formatter now selects `en-IN` for INR and `en-US` for all other currencies so commas appear in the correct positions.
- **Chat streaming text rendering glitches.** Incomplete markdown syntax during token streaming (e.g. a half-written `**bold**` or fenced code block) caused the rendered output to flicker and reformat unpredictably as tokens arrived. Streaming text now renders as plain `whitespace-pre-wrap` text; ReactMarkdown is only applied to completed messages already saved to the database.
- **Chat auto-scrolling interrupting reading.** The message list was scrolling to the bottom on every streaming token, jumping the user away from content they were reading above. Scroll-on-token now only fires when the user is already within 80 px of the bottom. Scrolling to the bottom on a newly completed message is unconditional (the user just sent something).

---

## [0.7.3-beta] — 2026-05-08

### Added

- **AI chat auto-clears on currency change.** Switching the display currency in Settings now immediately clears the AI conversation history. Old responses formatted in the previous currency would have confused the model context — clearing ensures every reply after a currency switch is consistent.

### Fixed

- **AI chat reporting wrong currency.** Three bugs in the financial context passed to the model:
  - Transaction amounts were raw numbers with no currency label (e.g. `5000` instead of `₹5,000`) — the model could not tell which currency an amount was in.
  - Envelope `budgeted` value was taken from the raw budget_currency field rather than the INR-normalised `budgeted_inr`, causing mismatched units when `spent` and `available` (both in INR) were compared alongside it.
  - The system prompt hardcoded "Use ₹ for INR amounts" regardless of the user's display currency setting, conflicting with USD/SGD/etc. context data.
- **AI currency directive now prominent.** The model's display currency is now stated as the very first line of the system prompt (`IMPORTANT: The user's display currency is …`) and repeated at the top of the financial data snapshot. Small models previously ignored the currency setting buried deep in context.
- **PWA top overlap (Dynamic Island).** Replaced `pt-[env(safe-area-inset-top)]` Tailwind arbitrary value — which iOS Safari does not reliably resolve — with an inline `style={{ paddingTop: "env(safe-area-inset-top)" }}` that is guaranteed to apply at runtime.
- **PWA input zoom.** iOS Safari auto-zooms whenever a focused input has `font-size < 16 px`. With the 14 px mobile root, all inputs were at ~12 px, triggering a viewport zoom and horizontal shift on every login field tap. Added `font-size: max(16px, 1em)` globally so inputs are never below the zoom threshold.

---

## [0.7.2-beta] — 2026-05-08

### Added

- **PWA support.** Added `manifest.json` and iOS-specific meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`). The app can now be installed from Safari via "Add to Home Screen" and runs in standalone mode — all navigation stays inside the app shell instead of breaking out to Safari.

### Fixed

- **JWT token not persisting across page refreshes.** The `unlocked` state was initialized to `false` on every load, showing the login screen even when a valid token was already in `localStorage`. It now reads the token on startup and skips the login screen if one is present.
- **Expired token leaves app in broken state.** Any 401 response from the API now clears the stored token and reloads the page, sending the user back to the login screen cleanly.
- **Smaller UI on mobile.** Root font size reduced to 14 px on viewports below 768 px (up from 16 px). All `rem`-based sizes — text, padding, spacing — scale down proportionally on mobile without touching individual components.
- **PWA top overlap fixed.** Added `env(safe-area-inset-top)` padding to the root layout so app content starts below the Dynamic Island / status bar instead of rendering underneath it.
- **PWA zoom prevented.** Added `maximum-scale=1.0` to the viewport meta tag so iOS no longer scales up content in standalone mode.
- **Sidebar height corrected.** Sidebar now uses `h-full` instead of `h-[100dvh]` so it respects the top safe-area padding applied to its parent, preventing overflow.

---

## [0.7.1-beta] — 2026-05-08

### Added

- **PWA support.** Added `manifest.json` and iOS-specific meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`). The app can now be installed from Safari via "Add to Home Screen" and runs in standalone mode — all navigation stays inside the app shell instead of breaking out to Safari.
- **Auto-heal sidecar.** Added `willfarrell/autoheal` as a Docker Compose service. It monitors all containers with health checks every 30 s and automatically restarts any that enter the `unhealthy` state — covering scenarios that `restart: unless-stopped` misses (a stuck-but-running container that never exits).

### Fixed

- **AI Chat SSE stream cut off (`ERR_INCOMPLETE_CHUNKED_ENCODING`).** Nginx was buffering the `/api/ai/chat` SSE response, causing the browser to receive an incomplete chunked stream. Added a dedicated `location /api/ai/chat` block with `proxy_buffering off` and `proxy_cache off` so tokens are forwarded to the browser immediately as they arrive from the server. Proxy timeouts also increased to 300 s to accommodate long model responses.
- **Ollama container healthcheck.** Replaced `curl http://localhost:11434` with `ollama list` — the former only checked that the HTTP port was open, not that the model runtime was ready. The new check also uses a longer `start_period` (30 s) and more retries (15) to handle slow first-start model initialization.

---

## [0.7.0-beta] — 2026-05-08

### Added

- **Ollama runs as a Docker service.** Ollama is now a first-class service in `docker_compose.yml` using the official `ollama/ollama` image. Models are persisted in an `ollama-data` named volume. The server waits for Ollama to be healthy before starting. No host installation of Ollama is required.
- **`deploy.sh` script.** Single command to validate the environment, build, and start all services. Checks for required variables (`POSTGRES_PASSWORD`, `JWT_SECRET`), prints defaults for optional ones, streams Docker health-check progress, and prints the local and network URLs when done.

### Changed

- **`OLLAMA_URL` default changed** from `http://host.docker.internal:11434` to `http://ollama:11434` — resolved via Docker's internal DNS instead of a host network bridge.

### Removed

- **`extra_hosts: host.docker.internal:host-gateway`** removed from the server service — no longer needed now that Ollama is a container on the same Docker network.

---

## [0.6.0-beta] — 2026-05-08

### Added

- **Mobile bottom navigation.** A fixed bottom tab bar (Dashboard, Budget, Transactions, AI Chat, More) appears on mobile viewports. The "More" sheet surfaces Investments, Debt, Policies, Help & FAQ, and Settings. Fully respects iOS safe-area insets (home indicator / Dynamic Island).

### Fixed

- **iOS Safari viewport cutoff.** Root layout switched from `h-screen` (`100vh`) to `h-[100dvh]` (dynamic viewport height), which excludes the Safari address bar and bottom chrome. Content no longer gets clipped at the bottom on iPhone.
- **Sidebar hidden on mobile.** The sidebar now uses `hidden md:flex` — on small screens it is completely removed from layout, giving the full width to the main content area.
- **Responsive grids on Dashboard.** All hardcoded desktop-only grids fixed: stat rows (`grid-cols-4` → `grid-cols-2 md:grid-cols-4`), the main content row (`grid-cols-12` → `grid-cols-1 md:grid-cols-12`), and the bottom row (`grid-cols-3` → `grid-cols-1 md:grid-cols-3`). Net worth card now stacks vertically on mobile. Fixed-width (`w-56`) breakdown bar replaced with `w-full max-w-56`.
- **Horizontally scrollable tables on mobile.** Budget envelope table, Transactions table, Debt table, Investments portfolio and linked-accounts tables, and Policies table all get `overflow-x-auto` with a `min-width` guard — columns no longer collapse or overflow the screen.
- **Full-width sheets on mobile.** Account transaction sheets (Budget, Investments) and the Debt transaction history sheet now use `w-full` on small screens instead of a fixed pixel width that exceeded the viewport.
- **Budget page header wraps on mobile.** Month selector and action buttons (`Add Account`, `Add Transaction`) now use `flex-wrap` so they stack instead of overflowing.
- **Chat and Transactions pages clear the bottom nav.** Both pages use a fixed-height (`h-full`) flex layout; added `pb-14 md:pb-0` so the chat input bar and transaction pagination are not hidden behind the bottom navigation bar.
- **Server crash on "Start Ollama" in Docker.** The `/api/ai/start-ollama` endpoint spawned `ollama serve` without attaching an `error` listener to the child process. When `ollama` is not installed (e.g. in a Docker container), Node.js emits an unhandled `error` event that killed the server. An error listener is now attached before `child.unref()`.
- **`viewport-fit=cover` added to HTML meta tag** so iOS respects safe-area environment variables for the notch and home indicator.

---

## [0.5.0-beta] — 2026-05-07

### Added

- **App screenshots.** Ten screenshots covering all major modules — Dashboard, Budget, Transactions, Investments, Debt, Policies, AI Chat, Help & FAQ, and Settings — added to the repository and embedded in the README.

### Changed

- **README fully rewritten.** New structure includes a Prerequisites section, inline `.env` values in Quick Start, a Default column in the environment variable table, split Mac/Windows vs Linux Ollama instructions, and an updated project structure tree reflecting the current codebase.

### Infrastructure

- **Public release.** Repository open-sourced on GitHub with a clean git history. Internal migration scripts, personal data exports, and dev-only docs removed from the tree.
- **Project structure cleaned up.** Removed `extras/`, `docs/`, `.github/`, and `scripts/` directories — repository now contains only the application source.

---

## [0.4.1-beta] — 2026-05-06

### Changed

- **Frontend port changed from 8080 to 3002.** All compose files, `.env.example`, README, and ARCHITECTURE docs updated consistently. Backend remains on 3001.

### Infrastructure

- **Open-sourced.** Repository made public — migration exports and personal data excluded via `.gitignore`, fresh git history with no sensitive data in any commit.
- **`.env.example` updated** to reflect current environment variables (`JWT_SECRET`, `POSTGRES_PASSWORD`, `OLLAMA_URL`, `APP_PORT`).

---

## [0.4.0-beta] — 2026-05-05

### Added

- **Backup & Restore.** Settings now includes a Backup & Restore card. Export exports all financial data (accounts, transactions, envelopes, investments, policies, recurring transactions, AI conversations, and exchange rates) as a single JSON file. Import replaces all existing data from a previously exported file, with a confirmation dialog showing row counts before committing.
- **Production Docker Compose** (`docker-compose.prod.yml`). A separate compose file for deployment — uses build-from-source, only exposes the frontend port, and requires `JWT_SECRET` and `POSTGRES_PASSWORD` to be set via environment variables.
- **GitHub Actions CI.** Lint check (Biome) runs automatically on push and pull requests to `main`.
- **Theme-aware logo.** Sidebar and browser favicon now switch automatically between the dark and light logo variants (`Finwise-Dark.png` / `Finwise-Light.png`) based on the active theme, including when "System" mode follows the OS preference.

### Security

- `JWT_SECRET` is now required at server startup — the server throws immediately if the variable is not set rather than falling back to a weak hardcoded default.

### Fixed

- **AI Chat 401 Unauthorized errors.** The chat stream was sent via the browser's native `EventSource` API, which cannot attach custom headers — so the JWT token was never transmitted. Replaced with a `fetch`-based SSE reader that attaches `Authorization: Bearer <token>`, matching how every other API call in the app authenticates.
- Updating an account's type or currency via the edit sheet was silently ignored — `UpdateAccountSchema` was missing those two fields, so Zod stripped them before they reached the database. Both fields are now included as optional in the schema.
- Portfolio summary and net worth on the Dashboard now correctly count both investment holdings (from the `investments` table) and linked off-budget account balances, rather than only one source.

## [0.3.0-beta] — 2026-05-03

### Added

- **Investment account linking from Investments page.** The Linked Accounts section now shows permanently (even when empty) with an "Add Account" button that creates a real off-budget savings/investment account directly from the Investments page — no need to go to Budget first.
- **Transfer tab in Linked Account sheet.** Clicking a linked account on the Investments page now opens a sheet with income / expense / transfer tabs, so you can move money to/from investment accounts without switching to Budget.
- **Investment Accounts strip on Budget page.** Off-budget savings and investment accounts now appear as clickable cards below the regular account strip on the Budget page, with the full transfer-capable sheet.
- **Debt module.** Track credit cards and loans with outstanding balances, institution names, and payment recording via transfers. Debt is subtracted from net worth on the Dashboard.
- **Changelog viewer in Settings.** The About section now includes a "View Changelog" button showing the full release history in-app.

### Changed

- **Help & FAQ page fully rewritten** to match the actual state of the app: corrected data storage (PostgreSQL, not SQLite), accurate currency support (11 currencies everywhere; debt limited to INR/USD/SGD/NTD), fixed AI connection troubleshooting path (Settings → API Server), updated Danger Zone documentation (two levels: Clear Transactions and Reset All Data), added Savings Account to investment asset types, removed the unimplemented rollover configuration section, added new Debt and Active Month sections.
- **Version display unified.** Settings "About" badge now reads `__APP_VERSION__` from `package.json` instead of being hardcoded, so sidebar and Settings always show the same version.

### Fixed

- Investment holdings created via "Add Investment" are now clearly distinct from transferable linked accounts. The Linked Accounts section explains the difference with an empty-state message.

---

## [0.2.0] — 2026-05-02

### Changed — Architecture

- **Switched database from SQLite/SQLCipher to PostgreSQL 16.** All Drizzle schema types migrated from `drizzle-orm/sqlite-core` (`sqliteTable`, `real`, `integer({mode:"boolean"})`) to `drizzle-orm/pg-core` (`pgTable`, `doublePrecision`, `boolean`).
- **Removed Tauri desktop app.** Finwise is now a pure web application served by Nginx + Docker Compose. No Rust/Tauri dependency.
- **Added Docker Compose deployment.** Three services: `postgres` (data), `server` (Hono API), `frontend` (Nginx + React). Run with `docker compose up --build`.
- **Replaced password-as-DB-key auth (Tauri Keychain) with JWT auth.** Username + password stored in `users` table (PBKDF2-SHA512 + HMAC-SHA256 JWT). Tokens valid for 30 days.
- **Schema migrations now run automatically on server startup** via `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` DDL in `src/index.ts`. No separate migration CLI step needed.
- **All database transactions converted from synchronous SQLite to async PostgreSQL.** Five sync `db.transaction()` blocks in `budget.service.ts` rewritten as `async (tx) => {}`.

### Added

- `JWT_SECRET` environment variable for signing tokens (previously reused the DB encryption key).
- `./utils/hash` subpath export in `@finwise/shared` package so server can import `hashRow` without bundling Node.js crypto into the frontend.
- Currency enum for accounts and investments expanded to the full 11-currency set (INR, USD, SGD, GBP, EUR, AUD, JPY, TWD, HKD, CAD, NTD) to match envelope budget currency support.

### Removed

- `better-sqlite3-multiple-ciphers` and `@types/better-sqlite3` dependencies.
- `FINWISE_DB_KEY` environment variable (no longer needed).
- `DB_PATH` environment variable (no longer needed).
- `db/key-manager.ts` — DB key derivation from macOS Keychain / env var.
- Tauri-specific Vite config (strict port 1420, TAURI_DEV_HOST, HMR over websocket).
- `PasswordGate` component is now dead code (kept in tree, not rendered).

---

## [0.1.0] — 2026-04-01

### Added — Initial release

- Envelope budgeting with monthly rollover (none / amount / leftover).
- Multi-currency accounts (INR, USD, SGD, NTD) with live exchange rates via open.er-api.com.
- CSV transaction import with SHA-256 deduplication.
- Recurring transactions (weekly / monthly / quarterly / annual) applied on server startup.
- Investment portfolio tracking (mutual funds, stocks, ETFs, FDs, bonds, real estate, cash, structured, savings, other).
- Insurance policy manager with premium schedule and payout timeline.
- AI Chat powered by local Ollama (Drizzle-backed conversation history, tool calls logged).
- Three income sub-categories: Income, Cashback, Starting Balances — rendered as collapsible groups in the budget income section.
- Auto-created starting balance income transaction when an on-budget account is added with a positive balance.
- Dark / light / system theme toggle.
- Default display currency selector (converts all INR amounts to the chosen currency).
- Budget alerts (over-budget, approaching threshold).
- Debt page.
- FAQ page.
- Dockerized deployment (server + Nginx frontend) with `docker compose up`.
