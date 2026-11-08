# mellon — program journal & Phase 10 execution plan

> **Status: the living plan.** This file is the program journal for building
> `mellon` + `lumen` (Phase 10). Milestone checkboxes get ticked as their PRs
> merge; every milestone additionally appends a dated journal entry below the
> plan (append-only — never rewrite history, same rule as earendil's PLAN.md).
> Provenance: drafted as an agent-run execution plan on 2026-11-08.


> **Executor: an AI agent.** Human = the owner, who reviews PRs and makes only the
> decisions marked `HUMAN-GATE`. Every task below is written so an agent can run it
> end-to-end without interpretation: read the listed context, execute, verify with the
> given commands, commit per the ritual, PR, stop at GATEs.
>
> Source of truth: `mellon/DESIGN.md` (portal + UI system), `lumen/DESIGN.md` (§1 read
> contract, §8 Admin API, §9 Bao passthrough, §10 phase), `INFRA_ARCHITECTURE.md`
> (Phase 10, §5.5 portal integration, §1 budget, §2 access matrix), earendil
> `AGENTS.md`/`DESIGN.md` (FE doctrine + contract). When docs conflict, the newest
> mirror commit wins; log the conflict in the journal, do not silently pick.

---

## 0. Operating protocol (applies to every task)

1. **Onboarding per repo, before edits** — read `<repo>/AGENTS.md` (if present),
   `<repo>/DESIGN.md`, recent `git log --oneline -15`. Never re-derive a decision that is
   written down.
2. **Branch ritual** — `milestone/<N>-<slug>` per repo; never commit directly to `main`;
   open a PR; owner merges. After a merge: bump the superproject pin
   (`git add <child> && git commit -m "chore(pins): …"`) — pins track `main` only, never
   open branches.
3. **Gate command per repo** (must exit 0 standalone — never trust piped output):
   - earendil / mellon: `npx prettier --write <touched> && npm run lint && npm run check && npm run test:unit && npm run build`
   - lumen: `gofmt -l . && go vet ./... && go build ./... && go test ./...`
   - vortex: `kubectl kustomize <every changed dir>`
4. **Commit style** — Conventional Commit subject + a WHY body; one logical change = one
   commit; verify edits landed with grep/diff, never from memory.
5. **Journal** — every milestone appends a dated entry to `mellon/PLAN.md` (program
   journal; cross-repo tasks tagged `[lumen]`/`[mellon]`/`[earendil]`/`[vortex]`),
   mirroring earendil's append-only `PLAN.md` practice.
6. **Stop conditions — `HUMAN-GATE`** — an agent MUST halt and ask when: a secret or
   credential is to exist outside already-documented seeds; a doctrine file (AGENTS,
   INFRA non-negotiables) needs amending; an external resource is created (GitHub repo,
   DNS, cloud); a merge is requested; production promotion; or any acceptance check
   fails twice after honest fixes.
7. **Test data rule** — earendil's mock corpus (12 posts, `queue`-matching search) is the
   canonical fixture seed. Tests never require live cluster, real Bao, or the network.

## 1. Global invariants (violating any = blocked PR)

- **Contract is `earendil/src/lib/api/client.ts`** — lumen read endpoints serve its exact
  shapes; the earendil vitest suite run against real lumen IS the acceptance test (M1).
- **Mock-first everywhere** — both new apps run fully with zero external services in dev.
- **Exactly one public ingress** — earendil. mellon: ClusterIP, no Ingress, ever (P0).
  `/api/*`, `/admin-api/*`, `/media/*` ride SSR relays.
- **No credentials in the UI, no values in git, no payloads in logs.** AppRole
  `fzr-portal` lives in lumen's env only (ESO-rendered). Bao audit devices are the trail.
- **Drafts never leak** to the read API; published-only, always.
- **Light/dark parity + keyboard-first** on every mellon screen from day one (§11 UI
  system; "no mouse-only affordance"; palette-registry pattern).
- **Versions pinned exactly; images deployed `sha-<short>`; vortex bases stay ESO-free.**
- **Docs move with decisions** — any behavior change to a documented contract ships the
  mirror-doc edit in the same PR set.

---

## M0 — `bootstrap` · ~1 day

**Context:** mellon/DESIGN.md §3,§11; earendil config files (copy sources);
lumen/DESIGN.md intro.
**Branches:** `mellon: milestone/0-scaffold`, `lumen: milestone/0-scaffold`.

Tasks:
- [ ] `HUMAN-GATE` **mellon GitHub repo** — owner runs (no `gh` on this machine):
      create `kanatabi/mellon` **private** → push local repo → `git submodule add` at root
      → pin commit. (Steps pre-written in `mellon/README.md`.)
- [ ] [mellon] Scaffold: SvelteKit 3 + Svelte 5 runes + TS strict + Tailwind v4 +
      `adapter-node`, Node 22. Copy earendil's `package.json` dev-deps set,
      `eslint.config.js`, `prettier.config.js`, `vitest.config.ts`, `tsconfig.json`,
      `vite.config.ts` (rename app, strip blog-specific plugins; keep `allowedHosts`
      ngrok suffix pattern). Exact pins where earendil pins.
- [ ] [mellon] Theme day one: `src/routes/layout.css` token block (copy values — the
      semantic contract, §3), `[data-theme='dark']` overrides, cookie + pre-paint script
      in `+layout.svelte` (copy recipe), `ThemeToggle` port. Additive admin tokens NOW
      (empty for P0): `--danger`, `--diff-add`, `--diff-del` with light/dark values.
- [ ] [mellon] `/healthz` route (echo earendil proxy shape) + placeholder `/` shell page;
      `Dockerfile` (multi-stage non-root, copy earendil's); note GHCR workflow as M0.5.
- [ ] [lumen] Go scaffold: `go.mod` (latest stable pinned), stdlib or `chi`
      — `HUMAN-GATE` router choice (offer: stdlib `net/http` + `ServeMux` = zero deps,
      chi = middleware ergonomics; recommend stdlib until middleware demand is real),
      `/healthz`, config struct reading ONLY env (`API_BASE`-equivalents per
      `env.yaml.sample` pattern: schema in git, values in Bao), multi-stage Dockerfile,
      GH Actions build (copy earendil workflow: build → `sha-<short>` → kustomize edit).
- [ ] [lumen] `env.yaml.sample` seed schema; [vortex] placeholder manifests remain —
      no new app dirs until M7 (skip until real images exist).

**Verify:** mellon gates §3 exit 0 incl. `check` 0/0; `curl :5173/healthz` 200; theme
flip works with no FOUC (hard-reload, throttled); lumen `gofmt/vet/build/test` clean;
`docker build` of both succeeds.
**Journal:** M0 entry. **PRs:** two.

## M1 — `read-api` · lumen · 1–2 days

**Context:** lumen/DESIGN.md §1,§6; earendil `client.ts`,`types.ts`,`mock.ts` (fixture
source), `api.test.ts` (the harness to clone).
**Branch:** `lumen: milestone/1-read-api`.

Tasks:
- [ ] Postgres schema per §6 (posts **with `status ENUM('draft','published')`**, rev for
      CAS-ish optimistic lock, tags, post_tags, photos); migrations as plain SQL files.
- [ ] Seed importer: `cmd/seed` reads a JSON translation of earendil's 12-post corpus
      (commit it as `testdata/earendil-fixture.json` — the contract twin).
- [ ] Implement §1 read endpoints exactly (published-only): pagination, repeated `tag`
      (OR), `from/to`, `readMin/readMax`, `sort` whitelist, suggest/search split,
      photos list, featured (404 when unset — keep, FE tolerates), tags cloud
      (counts = published corpus; curation = SQL ORDER BY count DESC, ties by name).
- [ ] Contract harness: port `api.test.ts` expectations to a Go-side test set AND keep
      the JS side — add `earendil: scripts/contract.spec.ts` (vitest, env-gated:
      `LUMEN_URL=… npx vitest run src/lib/api/contract.spec.ts`, skipped by default so
      offline CI stays green) asserting the same 12-post fixtures round-trip.
- [ ] Dev ergonomics: `docker-compose.dev.yml` (postgres only) + `make dev`.

**Verify:** `go test ./...` green; with compose up + seed:
`LUMEN_URL=http://localhost:8080 npx vitest run src/lib/api/contract.spec.ts` in earendil
green; `API_BASE=<lumen> npm run dev` renders the identical site (diff two pages
by eye once; journal the result).
**HUMAN-GATE:** none. **PRs:** lumen (+ small earendil test-script PR, `milestone/1-contract-harness`).

## M2 — `shell` · mellon · 1–2 days

**Context:** mellon/DESIGN.md §4,§6,§7,§11.1–11.3.
**Branch:** `mellon: milestone/2-shell`.

Tasks:
- [ ] Mock-first layer: `src/lib/api/` mirroring earendil's split (`client.ts` AdminApi
      interface = extracted from lumen §8 shapes; `mock.ts` fixtures; `index.ts` picks on
      `API_BASE`). Types generated-by-hand but kept adjacent to lumen §8 wording.
- [ ] App shell: left nav (groups, CardTitle labels, icon-rail <lg), topbar (breadcrumb /
      centered ⌘K / actions), content region; port the kit primitives needed as copies:
      `Pill`, `CardTitle`, `Watermark` (from earendil — vendored copies, token-based).
- [ ] Command registry `src/lib/commands.ts` + palette component (SearchDialog recipe:
      focus trap, Esc + focus return, arrow nav, `go to`/`actions`/`open recent`
      sections, hint column). Pages register commands; adding a page = one entry.
- [ ] Auth (mock session in M2): `/login`, session cookie handling (httpOnly,
      SameSite=Strict), route guard; `recent` in localStorage-free way (cookie or mock
      store — decide: keep simple, cookie `recent` list max 8).
- [ ] Dashboard + list stubs (posts/photos/tags/secrets routes with empty states using
      Watermark @8–10%).
- [ ] CI: add earendil-style workflow + Dockerfile check.

**Verify:** full gates; **keyboard-only tour script** (agent-run with a documented manual
checklist since no browser automation: `Tab`/arves order, rings visible, ⌘K opens/closes,
every nav item reachable, no hover-only control — grep-audit for `group-hover` without a
`group-focus` twin; journal the audit).
**PR:** mellon.

## M3 — `admin-api` · lumen · 1–2 days

**Context:** lumen §8, §2 (unit of work); INFRA §5.1 (values never in git).
**Branch:** `lumen: milestone/3-admin-api`.

Tasks:
- [ ] Session mint endpoint (single-user; credentials from env/Bao; short-TTL bearer;
      constant-time compare); middleware for `/admin/*`.
- [ ] Posts CRUD + drafts (rev-checked PUT per §8), unpublish, soft-delete.
- [ ] **Publish = §2 transaction**: readTime from final content, preview default,
      rank assignment, Meilisearch upsert, Postgres commit — one handler, idempotent
      (re-publish byte-stable; store `content_hash` and no-op on identical).
- [ ] Meilisearch: `search` client with index bootstrapping (`cmd/index-init`), upsert +
      delete hooks; dev via docker-compose addition.
- [ ] Tests: unit for derivations; integration for publish transaction (compose-up in CI
      optional — at minimum a `//go:build integration` suite).

**Verify:** scripted curl choreography (commit it as `scripts/admin-smoke.sh`):
login → create draft → §1 hides it → publish → §1 shows it, search finds it, byte-stable
re-publish no-op; drafts absent from EVERY read endpoint (assert in contract spec).
**PR:** lumen.

## M4 — `editor` · mellon · 2–4 days ⚠️ split PRs

**Context:** mellon §5, §11.4; earendil `src/lib/markdown/render.ts` (+ `layout.css`
prose section) as the vendoring source.
**Branches:** `mellon: milestone/4a-preview`, then `milestone/4b-editor`.

4a — preview parity:
- [ ] Vendor `render.ts` (markdown-it chain: anchors, grids, task lists, Shiki dual
      theme, mermaid placeholder + `mermaid-src` escape) into `mellon/src/lib/preview/`;
      vendor needed prose CSS into preview-scoped stylesheet; mermaid in preview MAY
      start as source-reveal-only (defer client render — write the deviation in journal).
- [ ] Parity page `/dev/parity`: same fixture text rendered by vendored copy vs an
      iframe of a local earendil route — manual-diff checklist in PR body.

4b — editor:
- [ ] CodeMirror 6 + `@codemirror/vim`; pins exact; preference `mellon_vim` cookie;
      IME-safe toggle.
- [ ] Theme via `style-mod` mapped from tokens; `data-theme` MutationObserver →
      reconfigure (port the mermaid-flip pattern from earendil actions.ts).
- [ ] Editor page: split/toggle preview, meta rail (status pill, slug, date, tags
      multi-select, featured later), two verbs (`save draft` / `publish`), Ctrl+Enter,
      dirty-state guard (unsaved-changes prompt via `beforeunload` + palette guard).
- [ ] Wire to REAL lumen M3 when available; mock otherwise (API layer unchanged).

**Verify:** full gates ×2; acceptance ritual from the plan: paste the queue-depths post →
preview matches (checklist in PR); publish lands through real lumen → earendil renders it
(with earendil dev pointed at M1 lumen); one hour of vim-mode editing without friction
(owner confirms — HUMAN note, agent self-reports).
**PRs:** two.

## M5 — `media` · 1 day

**Context:** lumen §5 (D1 resolved), §8 upload; earendil `routes/api/[...path]` relay.
**Branches:** lumen `milestone/5-media`, mellon `milestone/5-media`, earendil
`milestone/5-media-relay`, [vortex] PVC/manifest notes deferred to M7.

Tasks:
- [ ] [lumen] multipart upload → `/media` store (PVC path from env), dimension + EXIF
      strip (image lib: Go stdlib `image` decode per format — pin format list to what
      Shiki-free gallery needs: jpeg/png/webp), returns `Photo` shape; GC window for
      soft-deleted.
- [ ] [earendil] + [mellon] add `/media/*` to relay (same handler pattern; keep
      `allowedHosts`, timeouts, and 404 semantics).
- [ ] [mellon] photos page: upload drop-zone (button-first — keyboard doctrine: real
      `<input type=file>` with label), alt editing, dims display; editor featured-photo
      picker (closes §10 open question).

**Verify:** upload → curl earendil-origin `/media/<file>` 200; curl lumen-origin directly
from outside cluster → unreachable (proves one-ingress); `identify` matches reported
dims; EXIF stripped (grep binary for `Exif` = none); earendil full gate (relay change is
src/ touch).
**PRs:** three (+earendil PR = first real earendil change in this program).

## M6 — `secrets` · 1–2 days

**Context:** lumen §9; INFRA §5.5 (the ops list is verbatim here — implement exactly it),
§5.6 seed procedure; mellon §6 + §11.4 secrets anatomy.
**Branches:** lumen `milestone/6-bao-passthrough`, mellon `milestone/6-secrets`.

Tasks:
- [ ] [lumen] `hashicorp/vault/api` client; AppRole login w/ token cache + re-login;
      expose ONLY: metadata list (policy-scoped), read (+`?version`), versions list, CAS
      write (require `cas` param — no unconditional puts); no `sys/` routes at all.
- [ ] [lumen] redaction middleware for admin access logs (op + path + version + actor;
      never values/body); tests assert body absence in logs (capture logger output).
- [ ] [mellon] `/secrets`: app/env picker (from policy-scoped list), masked mono table,
      reveal-on-press-and-hold (`pointerdown`/`up` + `Space` keydown/keyup parity),
      edit drawer with CAS, version side-sheet + line diff (vendor a tiny diff or
      compute LCS — keep dependency-light), rollback = "save old version forward"
      (new version with old contents; Bao history preserved — journal this choice).
- [ ] Seed procedure doc: add `kv/data/mellon/{staging,production}` + `fzr-portal`
      role/policy creation lines to INFRA §5.6 checklist (doc change, not applied).

**HARD GATE (security):** before PR-merge, agent produces a short threat note in the
journal: token placement, TTL, policy paths, what a stolen mellon session can and cannot
do; owner reviews personally. Do NOT mark ready for merge without owner ack.

**Verify:** integration test against a dockerized OpenBao (compose add): round-trip
CAS, version list, redaction assert; drift check (§5.5) executes using the same client
(`cmd/driftcheck` — CI job wired in M7).
**PRs:** two.

## M7 — `deploy & cutover` · vortex · 1 day

**Context:** vortex README (conventions load-bearing), INFRA Phase 7/8/10, §1 budget,
§2 matrix; `.gitmodules` state after mellon registration.

- [ ] [vortex] `applications/lumen` + `applications/mellon` (ESO-free bases:
      deployment w/ node-pool affinity + anti-affinity where ×2, ClusterIP svc,
      resources per §1 rows, probes), `overlays/{staging,production}/…` (ExternalSecret
      CRs templated, no values), `apps/lumen-app.yaml` + `apps/mellon-app.yaml` CRs.
- [ ] [vortex] **mellon has NO Ingress resource** — add a comment citing the access
      matrix row (future-you grep protection).
- [ ] [lumen/mellon] CI image bump wiring (kustomize edit images, existing pattern);
      `kubectl kustomize` every dir passes.
- [ ] `HUMAN-GATE` apply sequence: owner runs §5.6 manual bootstrap steps (unseal,
      AppRole/policy creation, first seeds), then Argo syncs staging → **owner**
      promotes per §5.4; agent drafts the promotion PRs only.
- [ ] [earendil] staging `API_BASE` switch via overlay env (no code); run the AGENTS §9
      preload-storm + relay QA checklist against staging URL.

**Verify:** Phase 10 acceptance verbatim: publish via mellon→render on earendil;
secrets round-trip audited; `curl <any external probe> mellon` = unreachable; driftcheck
CI green for all apps; §1 budget: live `kubectl top` within requests; pins bumped.
**PRs:** vortex (+ possibly earendil staging overlay PR — infra-owned, HUMAN merge).

## M8 — `harden` · P0 exit · 1 day

- [ ] Empty/error states sweep; settings page (vim toggle, theme note); keyboard-doctrine
      re-audit (grep for hover-only affordances; the M2 checklist re-run); CSP headers
      via relay config; port-forward runbook line in mellon README.
- [ ] Journal finalization: `mellon/PLAN.md` P0 close entry; every `HUMAN-GATE` decision
      recorded with date + owner.

**Verify (exit criteria):** §11.5 screenshot ritual (agent captures via owner-assisted
manual step — or documented checklist); keyboard-only demo script passes; all repos'
gates green; no open `HUMAN-GATE` left unresolved. **P0 CLOSED** only on owner's word.

---

## HUMAN-GATE ledger (the agent never resolves these alone)

| # | gate | milestone |
| --- | --- | --- |
| 1 | Create + push `kanatabi/mellon` (private), submodule registration | M0 |
| 2 | lumen router choice (stdlib vs chi) | M0 |
| 3 | PR merges (every repo, every PR) | all |
| 4 | OpenBao bootstrap seeds: `fzr-portal` role/policy creation, `kv/data/mellon/*` first values | M6/M7 |
| 5 | Security threat-note ack before secrets merge | M6 |
| 6 | Staging→production promotion runs | M7 |
| 7 | Any doctrine/AGENTS/INFRA amendment | any |
| 8 | P0 exit declaration | M8 |

## Parked (do not build without re-planning)

Infra/GitOps tab · shared-theme package · multi-user/RBAC · WYSIWYG · client-side
mermaid in mellon preview (deviation logged in M4a).
