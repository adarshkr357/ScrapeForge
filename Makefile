# ================================================================
# ScrapeForge — Makefile
# ================================================================

.PHONY: build up down restart logs seed clean status test npm-install help

# ── Docker Commands ──

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose down && docker-compose up -d

logs:
	docker-compose logs -f --tail=100

logs-api:
	docker-compose logs -f --tail=100 api

logs-workers:
	docker-compose logs -f --tail=100 python-http-worker python-browser-worker node-browser-worker

status:
	docker-compose ps

# ── Database ──

seed:
	docker-compose exec api-1 node src/seed.js

seed-local:
	cd api && node src/seed.js

mongo-shell:
	docker-compose exec mongodb mongosh scrapeforge

redis-cli:
	docker-compose exec redis redis-cli

# ── Development ──

npm-install:
	cd api && npm install
	cd dashboard && npm install
	cd workers/node-browser && npm install

dev-api:
	cd api && npm run dev

dev-dashboard:
	cd dashboard && npm run dev

# ── Cleanup ──

clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

# ── Testing ──

test:
	cd api && npm test

test-health:
	curl -s http://localhost:3000/api/v1/health | python -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/v1/health

# ── Quick Start ──

start: build up seed
	docker-compose restart nginx
	@echo ""
	@echo "=== ScrapeForge is running! ==="
	@echo "Dashboard:  http://localhost:5173"
	@echo "API:        http://localhost:3000/api/v1/health"
	@echo "Login:      demo@scrapeforge.io / DemoPass123!"
	@echo ""

# ── Help ──

help:
	@echo ""
	@echo "ScrapeForge Commands:"
	@echo "  make build          Build all Docker images"
	@echo "  make up             Start all services"
	@echo "  make down           Stop all services"
	@echo "  make restart        Restart all services"
	@echo "  make logs           Tail all logs"
	@echo "  make logs-api       Tail API logs only"
	@echo "  make logs-workers   Tail worker logs"
	@echo "  make status         Show service status"
	@echo "  make seed           Seed database with demo data"
	@echo "  make clean          Remove all containers, volumes, images"
	@echo "  make test-health    Test API health endpoint"
	@echo "  make start          Full setup: build + start + seed"
	@echo "  make npm-install    Install deps locally"
	@echo "  make help           Show this help"
	@echo ""
