# AGENTS.md — `mellon` (private admin portal)

Orientation + load-bearing rules. **[`DESIGN.md`](DESIGN.md) §2 (doctrine) is
load-bearing — read it before any feature work.** The workspace root's
[`../AGENTS.md`](https://github.com/kanatabi/omicron/blob/main/AGENTS.md) holds the
workspace-wide non-negotiables.

## 1. What this repo is (60 seconds)

- The **private admin portal** of the `omicron` workspace — becoming the
  owner's personal/family app center (the RBAC spine, 2026-11-24):
  content management for [earendil](https://github.com/kanatabi/earendil),
  env/secret management for the cluster, and the UI surface for every
  app that lands later — one keyboard-first web app, talking ONLY to
  the estate's backend services (lumen for identity + content; future
  app BEs verify lumen tokens and enforce their own scopes — the RBAC
  ADR in the omicron vault's decisions tier).
- **UI-only by doctrine:** the relay forwards, it never decides (§2.2). All logic,
  auth, credentials, and policy live in lumen. Mellon holds **no secrets** — no Bao
  tokens, no GitHub tokens, no DB creds, in any layer, any era.
- **Never serves content traffic** (§2.1): `earendil → lumen` is the blog's data
  path; mellon going down cannot break the blog.
- **Public at `console.gofar.id`** (amended 2026-11-08): TLS at the shared Traefik
  edge, console middlewares (HSTS, headers, rate-limit), JWT sessions with
  `token_version` revocation, login throttle. The service itself stays ClusterIP;
  `kubectl port-forward` remains documented break-glass. Go-live is
  **HUMAN-GATE #10** (the pre-launch checklist).
- **Ghost-field doctrine:** relayed server copy is rendered verbatim, never
  decorated or paraphrased (§6.1).
- The owner's `PLAN.md` is a **local-only journal** (gitignored) — never recreate it
  in Git. The superseded `THREAT-NOTE.md` lives in the omicron vault's
  [archive](https://github.com/kanatabi/omicron/blob/main/context-knowledge/archive/mellon-THREAT-NOTE.md)
  (its GATE #5 read-through stayed with the owner).

## 2. How to analyze this repo — read in this order

1. `git log --oneline -15` — recent themes (upstream split, pin-lock, the estate
   matrix).
2. **`DESIGN.md`** — §2 doctrine, §6 route table (incl. §6.1 secrets control
   plane), §8/§9 wire contracts, §11 shell + view anatomy.
3. Code spine: `src/routes/(app)/` shell (+layout) → per-route `+page.server.ts` →
   `src/lib/api/` (`fetch-adapter.ts` maps every `AdminApi` method 1:1 onto §8/§9)
   → `src/lib/components/`.
4. `lumen/DESIGN.md` §8/§9 — the wire contract this repo mirrors (its own AGENTS.md
   too).
5. `README.md` is user-facing (routes, how to run).
6. **The widget home** (`src/lib/dashboard/`): `widgets/registry.ts` is the
   plugin seam — adding a widget = one folder + one registry line
   (omicron runbook ch. 15 walks it; DESIGN §11.4 holds the contract).

## 3. Commands

```
npm run dev · npm run check · npm run lint · npm run test:unit · npm run build
```

Gates in that order after touching `src/` (mirror earendil's conventions:
SvelteKit 3 + Svelte 5 runes + TS + Tailwind v4 + `adapter-node`, Node 22, exact
pins). `make help` lists the verbs — `make dev` (readyz-gated real mode,
`LUMEN=`/`PORT=` overridable, reuses a live server), `make live` (the gated
acceptance suite vs a running lumen: login, drafts-at-the-door, CAS 409s, multipart
upload, secrets relay, instant revocation). Start the backend first:
`cd ../lumen && make dev`. Dev login: `gofar` / `mellon-dev-password` (the dev
placeholder).

## 4. Dual upstreams (2026-11-13)

The cluster wires `ADMIN_URL` (control plane — sessions, users, TOFU, Bao) and
`CMS_URL` (this environment's content lumen). Which call goes where is ONE
auditable table: `src/lib/api/routing.ts` — session/users/setup/bao → `ADMIN_URL`,
content + `/api` → `CMS_URL`, unknown → **throw (no default)**. Legacy `API_BASE`
still feeds both planes (single-binary dev shape); unset everywhere falls back to
`http://localhost:8080`.

## 5. Load-bearing conventions

- **Real by default** (owner ruling 2026-11-09): one data source — lumen. The
  browser never sees lumen or a token; the fixture twin lives on ONLY in test
  scope (`api.test.ts` imports it directly — the runtime graph never does).
- **Relay honesty:** lumen's error copy renders verbatim (e.g. the 403
  `pinned at vN — unpin first`). Never paraphrase or "improve" the wire.
- **Markdown stack is bundled + lazy-loaded** on purpose — one broken chunk once
  killed the ENTIRE relay; keep that chunk boundary when touching imports.
- **Keyboard-first** (§2.4): anything reachable by mouse is reachable by keyboard;
  no hover-only affordances.
- Validation rules the relay renders (pin locks, CAS 409s, key-set mirror
  conflicts) are lumen's truth — never reimplement or pre-empt them client-side
  beyond affordance (e.g. the re-pin offer).

## 6. Git workflow

Branch-per-milestone off `main`, PR-reviewed — never commit directly to `main`.
Conventional Commits; club related changes into one commit, no micro-commits.
**Merging to `main` = SQUASH (owner ruling 2026-11-21): one conventional
commit per round (`git merge --squash <branch>` + one commit); never
fast-forward a branch merge, never rebase.**
`PLAN.md` is the owner's local-only journal: gitignored, never committed, never
recreated in Git.

## 7. Context sync (workspace rule, 2026-11-15)

Changes that alter this repo's stack, anatomy, contract, commands,
conventions, or state update the vault's learning note in the SAME round:
`omicron` → `context-knowledge/repos/mellon/README.md` (+ its
`LEARNING.md` if the change minted a lesson; + the runbook/INFRA docs when
decision- or operation-level). "The code landed but the vault didn't" is
an incomplete round — the checklist lives at the end of that note.
