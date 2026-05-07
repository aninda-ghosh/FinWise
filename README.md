# Finwise

A self-hosted personal finance manager built for people who want full control over their financial data. Track budgets, accounts, investments, and insurance policies — everything runs within your own infrastructure, with no third-party cloud sync.

AI-powered financial chat is included via a locally-running [Ollama](https://ollama.com) model, so your data never leaves your machine.

---

## Features

- **Envelope budgeting** — monthly budgets with configurable rollover (none / fixed amount / full leftover)
- **Accounts** — checking, savings, credit, investment, cash, loan with live balance tracking
- **Transactions** — manual entry, CSV import with SHA-256 deduplication, recurring transactions, transfers
- **Investments** — portfolio tracking across mutual funds, stocks, ETFs, FDs, bonds, real estate, and more
- **Insurance policies** — premium schedules, payout timelines, maturity tracking
- **Debt tracking** — credit cards and loans, subtracted from net worth
- **AI Chat** — ask natural-language questions about your finances via a local Ollama model
- **Multi-currency** — INR, USD, SGD, GBP, EUR, AUD, JPY, TWD, HKD, CAD, NTD with live exchange rates
- **Dashboard** — net worth, monthly summaries, income/expense breakdown, upcoming payouts
- **Backup & Restore** — export all data as JSON and restore from it in one click
- **Dark / light / system theme**

---

## Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.png)

### Budget
![Budget](screenshots/budget.png)

### Transactions
![Transactions](screenshots/transactions.png)

### Investments
![Investments](screenshots/investments.png)

### Debt
![Debt](screenshots/debt.png)

### Policies
![Policies](screenshots/policies.png)

### AI Chat
![AI Chat](screenshots/ai_chat.png)

### Help & FAQ
![Help & FAQ](screenshots/help_faqs.png)

### Settings
![Settings](screenshots/settings_1.png)
![Settings](screenshots/settings_2.png)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript + TailwindCSS 4 + TanStack Query 5 |
| API server | Hono (Node.js / TypeScript) |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Reverse proxy | Nginx — serves frontend, proxies `/api/` to server |
| Deployment | Docker Compose |
| AI | Ollama (local LLM, accessed via HTTP) |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose
- [Ollama](https://ollama.com) installed on the host machine (for AI chat)

For local development without Docker:
- Node.js 22+
- pnpm 10+
- PostgreSQL 16+

---

## Quick start

```bash
git clone https://github.com/aninda-ghosh/FinWise.git
cd FinWise
```

Copy the example environment file and fill in your secrets:

```bash
cp .env.example .env
```

```bash
# .env — required values
JWT_SECRET=        # generate with: openssl rand -hex 32
POSTGRES_PASSWORD= # choose a strong password
```

Start all services:

```bash
docker compose -f docker_compose.yml up -d
```

Open **http://localhost:3002** in your browser. On first visit you will be prompted to create a username and password. JWT tokens expire after 30 days.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | — | HMAC-SHA256 signing key |
| `POSTGRES_PASSWORD` | **Yes** | — | PostgreSQL password |
| `POSTGRES_USER` | No | `finwise` | PostgreSQL username |
| `POSTGRES_DB` | No | `finwise` | PostgreSQL database name |
| `OLLAMA_URL` | No | `http://host.docker.internal:11434` | Ollama API endpoint |
| `APP_PORT` | No | `3002` | Host port for the frontend |

Generate a strong `JWT_SECRET`:
```bash
openssl rand -hex 32
```

---

## AI Chat

Finwise connects to a locally-running Ollama instance for the AI chat feature. Install Ollama, then pull a model:

```bash
ollama pull gemma3
```

**Mac / Windows** — `OLLAMA_URL` defaults to `http://host.docker.internal:11434`, which Docker Desktop resolves automatically.

**Linux** — `host.docker.internal` is not available by default. Set `OLLAMA_URL` to your Docker bridge IP:

```bash
OLLAMA_URL=http://172.17.0.1:11434
```

---

## Local development

Start PostgreSQL, then run the server and frontend in separate terminals:

```bash
pnpm install

# Terminal 1 — API server
DATABASE_URL=postgres://finwise:finwise@localhost:5432/finwise \
JWT_SECRET=$(openssl rand -hex 32) \
pnpm --filter @finwise/server dev

# Terminal 2 — Frontend
pnpm --filter finwise-desktop dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API server | http://localhost:3001 |

---

## Project structure

```
finwise/
├── apps/
│   ├── server/          Hono API (TypeScript)
│   │   └── src/
│   │       ├── ai/      Ollama client, context builder, tool definitions
│   │       ├── db/      Drizzle schema + PostgreSQL client
│   │       ├── routes/  API route handlers
│   │       └── services/  Business logic
│   └── desktop/         React frontend (Vite)
│       └── src/
│           └── modules/ Feature modules (budget, investments, policies, chat, …)
└── packages/
    └── shared/          Shared types, Zod schemas, API contracts
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.
