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

FROM node:22-alpine AS output
WORKDIR /app
ENV NODE_ENV=production
# PORT (listen) and API_BASE (cluster-internal relay target) come from the
# Deployment's env in Git — don't bake anything host-specific in here.
# (The ExternalSecret CR for mellon lands with its vortex manifests, Phase C-infra.)
COPY --from=build /app/build ./build
EXPOSE 3000
USER node
CMD ["node", "build"]
