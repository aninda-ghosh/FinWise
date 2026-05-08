# Changelog

All notable changes to Finwise are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
