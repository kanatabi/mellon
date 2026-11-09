# mellon — dev targets, including the REAL-lumen cutover mode (Phase C).
# The API itself is orchestrated in ../lumen (its Makefile owns compose+seed+plane).

LUMEN ?= http://localhost:8080
PORT  ?= 5173

.PHONY: help install dev lumen live check lint test build

help:                  ## list targets
	@grep -hE '^[a-z][a-z-]*:.*## ' Makefile | sed 's/:.*## /  — /'

install:               ## deps only (no backend needed for mock mode)
	npm install

dev:                   ## dev on the MOCK twin (offline default — zero backend)
	npm run dev -- --port $(PORT)

lumen:                 ## dev against a REAL lumen: every §8/§9 call rides fetch-adapter to $(LUMEN)
	@curl -sf $(LUMEN)/readyz >/dev/null || { echo "lumen not reachable at $(LUMEN) — cd ../lumen && make dev (secrets page also wants: make dev-plane)"; exit 1; }
	API_BASE=$(LUMEN) npx vite dev --port $(PORT)

live:                  ## the gated acceptance suite (vitest vs a RUNNING lumen)
	LUMEN_URL=$(LUMEN) npx vitest run src/lib/api/api.live.test.ts

check:                 ## svelte-check
	npm run check

lint:                  ## prettier + eslint
	npm run lint

test:                  ## unit suite (mock twin — no backend)
	npm run test:unit

build:                 ## production build (adapter-node)
	npm run build
