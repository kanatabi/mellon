# SvelteKit SSR container (adapter-node). Build output in `build/` is self-contained,
# so the runtime stage needs no node_modules. mellon is ClusterIP in-cluster, but
# NOT port-forward-only since the 2026-11-08 amendment: console.gofar.id is one of
# the two sanctioned public surfaces (TLS + GATE #10 checklist before go-live).
# The RELAY targets (lumen, Bao) stay private — the portal holds no credentials.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# keep only runtime deps for the copy into the output stage
RUN npm prune --omit=dev

FROM node:22-alpine AS output
WORKDIR /app
ENV NODE_ENV=production
# Amended 2026-11-11: mellon's SSR preview chain (jsdom, shiki, isomorphic-
# dompurify) is intentionally EXTERNAL (see vite.config ssr.external — they
# resolve assets/require paths against their package layout and break bundled).
# The runtime stage therefore carries PRUNED production node_modules.
COPY --from=build /app/node_modules ./node_modules
# PORT (listen) and the upstream envs — ADMIN_URL (control plane), CMS_URL
# (this env's content lumen; legacy API_BASE = single upstream) — come from
# the Deployment's env in Git; the path→upstream table lives in
# src/lib/api/routing.ts. Don't bake anything host-specific in here.
# (The ExternalSecret CR for mellon lands with its vortex manifests, Phase C-infra.)
COPY --from=build /app/build ./build
EXPOSE 3000
USER node
CMD ["node", "build"]
