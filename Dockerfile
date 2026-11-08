# SvelteKit SSR container (adapter-node). Build output in `build/` is self-contained,
# so the runtime stage needs no node_modules. mellon deploys as a ClusterIP-only
# service — port-forward access per mellon/DESIGN.md §2; there is no Ingress to add.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS output
WORKDIR /app
ENV NODE_ENV=production
# PORT (listen) and ORIGIN come from the Deployment's env in Git — don't bake
# anything host-specific in here; the portal is reached by forwarding anyway.
COPY --from=build /app/build ./build
EXPOSE 3000
USER node
CMD ["node", "build"]
