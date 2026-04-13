# ScrapeForge

> **The most comprehensive, commercial-grade Web Scraping & Data Intelligence Platform.**

ScrapeForge combines adaptive stealth, JS rendering, AI extraction, Knowledge Graph construction, SERP scraping, site crawling, and LLM-ready data output — all behind a single unified API.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │               NGINX (Port 80/443)           │
                    │         Load Balancer + Rate Limit           │
                    └────────────────────┬────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────────┐
                    │          EXPRESS API (Port 3000)             │
                    │  Auth → RateLimit → CreditCheck → SSRF →    │
                    │  Validate → Route → SmartRouter → Queue     │
                    │  + Socket.io (Real-time updates)            │
                    └────┬─────────┬─────────┬──────────┬────────┘
                         │         │         │          │
              ┌──────────┴──┐  ┌───┴────┐  ┌─┴─────┐ ┌─┴──────────┐
              │ Python HTTP │  │ Python │  │ Node  │ │ SERP/NLP   │
              │  Worker     │  │Browser │  │Browser│ │  Workers   │
              │ (httpx+BS4) │  │(Chrome)│  │(PW)   │ │ (spaCy)    │
              │ 200 conc.   │  │50 conc.│  │50 conc│ │ 200 conc.  │
              └──────┬──────┘  └───┬────┘  └──┬────┘ └──┬─────────┘
                     │             │          │         │
                  ┌──┴─────────────┴──────────┴─────────┴──┐
                  │          STEALTH ENGINE                  │
                  │  Fingerprints · TLS Mimicry · CAPTCHA    │
                  │  Behavioral Sim · Challenge Detection    │
                  └─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
        ┌─────┴─────┐      ┌───────┴──────┐     ┌────────┴──────┐
        │  MongoDB   │      │    Redis     │     │ Proxy Manager │
        │ 19 Models  │      │  8 Queues    │     │ Mock/BD/Oxy   │
        │ Data Store │      │  Cache/PubSub│     │ 500+ IPs      │
        └────────────┘      └──────────────┘     └───────────────┘

  Background Services: Proxy Checker · Domain Learner · Scheduler · Change Detector
```

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone
git clone <repo-url> && cd ScrapeForge

# Copy env
cp .env.example .env

# One-command setup: build → start → seed
make start
```

### Option 2: Manual

```bash
# Install dependencies
cd api && npm install
cd ../dashboard && npm install
cd ../workers/node-browser && npm install

# Start MongoDB + Redis
docker-compose up -d mongodb redis

# Seed database
cd api && node src/seed.js

# Start API
cd api && npm run dev

# Start Dashboard
cd dashboard && npm run dev
```

### Access

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:5173 |
| **API** | http://localhost:3000/api/v1/health |
| **Login** | `demo@scrapeforge.io` / `DemoPass123!` |

---

## API Reference

### Core Endpoints

| Method | Endpoint | Description | Credits |
|--------|----------|-------------|---------|
| `POST` | `/api/v1/scrape` | Single URL scrape | 1-25 |
| `POST` | `/api/v1/scrape/batch` | Batch scrape (up to 5,000 URLs) | per-URL |
| `GET`  | `/api/v1/scrape/:id` | Poll async result | 0 |
| `POST` | `/api/v1/crawl` | Start site crawl | per-page |
| `POST` | `/api/v1/crawl/map` | Discover URLs (no scraping) | 2 |
| `POST` | `/api/v1/search` | SERP scrape (7 engines) | 5 |
| `POST` | `/api/v1/search/fast` | Ultra-fast SERP (<1s) | 10 |
| `POST` | `/api/v1/extract` | AI extraction from HTML | 5 |
| `POST` | `/api/v1/extract/screenshot` | Page screenshot | 2 |
| `POST` | `/api/v1/extract/pdf` | Page to PDF | 3 |
| `POST` | `/api/v1/nlp` | NLP extraction | 5 |
| `POST` | `/api/v1/knowledge-graph/query` | Query Knowledge Graph | 0 |

### Authentication

```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"MyPassword123!","name":"John"}'

# API Key auth
curl http://localhost:3000/api/v1/scrape \
  -H "X-API-Key: sf_demo_..."
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# JWT auth
curl http://localhost:3000/api/v1/scrape \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### Scrape Example

```bash
curl -X POST http://localhost:3000/api/v1/scrape \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://news.ycombinator.com",
    "render_js": false,
    "output_format": "markdown",
    "stealth_mode": "adaptive",
    "extraction_rules": {
      "titles": { "selector": ".titleline a", "type": "array" },
      "scores": { "selector": ".score", "type": "array" }
    }
  }'
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | Node.js, Express.js, Socket.io |
| **Data** | MongoDB (19 models) |
| **Queue** | Redis, BullMQ (8 queues) |
| **Workers** | Python (httpx, Selenium, spaCy), Node.js (Playwright) |
| **Stealth** | Fingerprints, TLS mimicry, CAPTCHA solving, Behavioral sim |
| **AI** | OpenAI, Claude, Ollama (LLM extraction) |
| **Dashboard** | React 18, Vite, Recharts, TailwindCSS v4 |
| **Proxy** | Mock (500 IPs), Bright Data, Oxylabs |
| **Infra** | Docker Compose, Nginx, 15 services |

---

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

**Required:** `MONGO_URI`, `REDIS_HOST`, `JWT_SECRET`

**Optional (unlocks features):**
- `OPENAI_API_KEY` — AI extraction
- `BRIGHTDATA_*` — Real proxy rotation
- `OXYLABS_*` — Alternative proxy provider
- `TWO_CAPTCHA_API_KEY` — Automatic CAPTCHA solving

---

## Project Structure

```
ScrapeForge/
├── api/                      # Express.js API
│   ├── src/
│   │   ├── models/           # 19 MongoDB models
│   │   ├── middleware/       # 6 middleware (auth, rate limit, etc.)
│   │   ├── routes/           # 14 route handlers
│   │   ├── services/         # 10 core services
│   │   ├── queue/            # 8 BullMQ queues
│   │   ├── websocket/        # Socket.io handler
│   │   ├── app.js            # Entry point
│   │   └── seed.js           # Database seeder
│   └── Dockerfile
├── workers/
│   ├── python/               # Python workers (5 types)
│   │   ├── stealth/          # 5 stealth modules
│   │   └── Dockerfile
│   └── node-browser/         # Playwright worker
│       └── Dockerfile
├── dashboard/                # React admin panel
│   ├── src/
│   │   ├── pages/            # 15 dashboard pages
│   │   ├── components/       # Layout + shared components
│   │   ├── hooks/            # Auth, Socket.io hooks
│   │   └── api/              # HTTP client
│   └── Dockerfile
├── services/                 # Background services
│   ├── proxy-checker/
│   ├── domain-learner/
│   ├── scheduler/
│   └── change-detector/
├── nginx/                    # Reverse proxy config
├── docker-compose.yml        # 15 services
├── Makefile                  # Build automation
└── .env.example              # Environment template
```

---

## License

Proprietary. All rights reserved.
