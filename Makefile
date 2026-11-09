# mellon — dev targets, including the REAL-lumen cutover mode (Phase C).
# The API itself is orchestrated in ../lumen (its Makefile owns compose+seed+plane).

LUMEN ?= http://localhost:8080
PORT  ?= 5173

.PHONY: help install dev live check lint test build

help:                  ## list targets
	@grep -hE '^[a-z][a-z-]*:.*## ' Makefile | sed 's/:.*## /  — /'

install:               ## deps only (no backend needed for mock mode)
	npm install

dev:                   ## dev against REAL lumen (the only runtime mode) — reuses a live server, guides when none answers
	@if curl -sf $(LUMEN)/readyz >/dev/null 2>&1; then \
		if [ "$(PORT)" = "5173" ] && ss -tln 2>/dev/null | grep -q ':5173 '; then echo "  mellon: already serving :5173 — reusing it"; exit 0; fi; \
	else \
		echo "lumen not reachable at $(LUMEN) — cd ../lumen && make dev (secrets page also wants: make dev-plane)"; exit 1; \
	fi
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
