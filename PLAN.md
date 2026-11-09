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
- ~~**Exactly one public ingress** — earendil. mellon: ClusterIP, no Ingress, ever (P0).~~
  **Amended 2026-11-08** (owner decision, per §2-rule-3's own ritual): two sanctioned public
  surfaces — `gofar.id` (content) and `console.gofar.id` (this portal; TLS + edge
  middlewares + GATE #10 checklist, INFRA §2/Phase 3). THE RULE THAT SURVIVES: never a
  public API — lumen/Meilisearch/Bao stay ClusterIP-only; browser→API bytes ride
  same-origin relays only (`/api/*` surface; `/media/*` retired by D1-rev).
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
- [x] [mellon] Scaffold: SvelteKit 3 + Svelte 5 runes + TS strict + Tailwind v4 +
      `adapter-node`, Node 22. Copy earendil's `package.json` dev-deps set,
      `eslint.config.js`, `prettier.config.js`, `vitest.config.ts`, `tsconfig.json`,
      `vite.config.ts` (rename app, strip blog-specific plugins; keep `allowedHosts`
      ngrok suffix pattern). Exact pins where earendil pins.
- [x] [mellon] Theme day one: `src/routes/layout.css` token block (copy values — the
      semantic contract, §3), `[data-theme='dark']` overrides, cookie + pre-paint script
      in `+layout.svelte` (copy recipe), `ThemeToggle` port. Additive admin tokens NOW
      (empty for P0): `--danger`, `--diff-add`, `--diff-del` with light/dark values.
- [x] [mellon] `/healthz` route (echo earendil proxy shape) + placeholder `/` shell page;
      `Dockerfile` (multi-stage non-root, copy earendil's); note GHCR workflow as M0.5.
- [ ] [lumen] Go scaffold: `go.mod` (latest stable pinned), stdlib or `chi` <!-- PARTIAL via M1 `b2aa886`: module + chi (gate #2) + viper config + /healthz + migrations + seed; Dockerfile & GH Actions still open (M7-adjacent) -->
      — `HUMAN-GATE` router choice (offer: stdlib `net/http` + `ServeMux` = zero deps,
      chi = middleware ergonomics; recommend stdlib until middleware demand is real),
      `/healthz`, config struct reading ONLY env (`API_BASE`-equivalents per
      `env.yaml.sample` pattern: schema in git, values in Bao), multi-stage Dockerfile,
      GH Actions build (copy earendil workflow: build → `sha-<short>` → kustomize edit).
- [x] [lumen] `env.yaml.sample` seed schema (keys documented, zero values — doctrine);
      [vortex] placeholder manifests untouched until M7, as planned.

**Verify:** mellon gates §3 exit 0 incl. `check` 0/0; `curl :5173/healthz` 200; theme
flip works with no FOUC (hard-reload, throttled); lumen `gofmt/vet/build/test` clean;
`docker build` of both succeeds.
**Journal:** M0 entry. **PRs:** two.

## M1 — `read-api` · lumen · 1–2 days

**Context:** lumen/DESIGN.md §1,§6; earendil `client.ts`,`types.ts`,`mock.ts` (fixture
source), `api.test.ts` (the harness to clone).
**Branch:** `lumen: milestone/1-read-api`.

Tasks:

- [x] Postgres schema per §6 (posts **with `status ENUM('draft','published','unpublished')`**, rev for
      CAS-ish optimistic lock, tags, post_tags, photos); migrations as plain SQL files.
      (§6 additions the contract forced: `post_tags.position` — tag ORDER is payload, not
      alphabet; `tags.cloud` — cloud MEMBERSHIP is curation distinct from FK vocabulary:
      earendil curates 10 of 26 corpus names. Plus `users(passhash, token_version)` from
      the revised §6, empty until M3.)
- [x] Seed importer: `cmd/seed` reads a JSON translation of earendil's 12-post corpus
      (committed as `testdata/earendil-fixture.json` — GENERATED from the mock by a
      throwaway vitest dump, never hand-transcribed; ships with a seeded draft as
      permanent leak-bait asserted invisible on every surface).
- [x] Implement §1 read endpoints exactly (published-only): pagination, repeated `tag`
      (OR), `from/to`, `readMin/readMax`, `sort` whitelist, suggest/search split,
      photos list, featured (404 when unset — keep, FE tolerates), tags cloud
      (counts = published corpus; curation = SQL ORDER BY count DESC, ties by name).
- [x] Contract harness: port `api.test.ts` expectations to a Go-side test set AND keep
      the JS side — add `earendil: scripts/contract.spec.ts` (vitest, env-gated:
      `LUMEN_URL=… npx vitest run src/lib/api/contract.spec.ts`, skipped by default so
      offline CI stays green) asserting the same 12-post fixtures round-trip.
- [x] Dev ergonomics: `docker-compose.dev.yml` (postgres:16.6 only) + make up/seed/run/
      test/test-integration/contract (`make dev` named out — same intent).

**Verify:** `go test ./...` green; with compose up + seed:
`LUMEN_URL=http://localhost:8080 npx vitest run src/lib/api/contract.spec.ts` in earendil
green; `API_BASE=<lumen> npm run dev` renders the identical site (diff two pages
by eye once; journal the result).
**HUMAN-GATE:** none. **PRs:** lumen (+ small earendil test-script PR, `milestone/1-contract-harness`).

## M2 — `shell` · mellon · 1–2 days

**Context:** mellon/DESIGN.md §4,§6,§7,§11.1–11.3.
**Branch:** `mellon: milestone/2-shell`.

Tasks:

- [x] Mock-first layer: `src/lib/api/` mirroring earendil's split (`client.ts` AdminApi
      interface = extracted from lumen §8 shapes; `mock.ts` fixtures; `index.ts` picks on
      `API_BASE`). Types generated-by-hand but kept adjacent to lumen §8 wording.
      (Shape note: the browser `client.ts` calls mellon's own `/api/*` relay — the
      doctrine made honest in code; the relay maps 1:1 to AdminApi, zero logic.)
- [x] App shell: left nav (groups, CardTitle labels, icon-rail <lg), topbar (breadcrumb /
      centered ⌘K / actions), content region; port the kit primitives needed as copies:
      `Pill`, `CardTitle`, `Watermark` (from earendil — vendored copies, token-based).
- [x] Command registry `src/lib/commands.ts` + palette component (SearchDialog recipe:
      focus trap, Esc + focus return, arrow nav, `go to`/`actions`/`open recent`
      sections, hint column). Pages register commands; adding a page = one entry.
- [x] Auth (mock session in M2): `/login`, session cookie handling (httpOnly,
      SameSite=Strict), route guard; `recent` in localStorage-free way (cookie or mock
      store — decide: keep simple, cookie `recent` list max 8). (Chose cookie, non-httpOnly.)
- [x] Dashboard + list stubs (posts/photos/tags/secrets routes with empty states using
      Watermark @8–10%).
- [ ] CI: add earendil-style workflow + Dockerfile check. (Parked — no remote until
      HUMAN-GATE #1; the workflow file needs a GitHub target to mean anything.)

**Verify:** full gates; **keyboard-only tour script** (agent-run with a documented manual
checklist since no browser automation: `Tab`/arves order, rings visible, ⌘K opens/closes,
every nav item reachable, no hover-only control — grep-audit for `group-hover` without a
`group-focus` twin; journal the audit).
**PR:** mellon.

## M3 — `admin-api` · lumen · 1–2 days

**Context:** lumen §8, §2 (unit of work); INFRA §5.1 (values never in git).
**Branch:** `lumen: milestone/3-admin-api`.

Tasks:

- [x] Session mint endpoint (**revised 2026-11-08 — JWT design, lumen §8**): single user;
      credentials from `users.passhash` (argon2id + salt — env/Bao credential era
      superseded, the Bao seed now holds only `SESSION_JWT_SECRET`); HS256 `exp`=12h,
      claims `{sub,iat,exp,tv,jti}`, alg PINNED at library-config level; verification =
      signature AND indexed `users.token_version` row read; `DELETE /admin/session`
      bumps tv (real revocation — logout kills every outstanding token); NO refresh
      tokens (owner ruling); login throttle (per-IP + per-account backoff — the public
      console makes stuffing the attack; argon2id prices guesses, the throttle starves
      them). Middleware for `/admin/*` checks both halves. (lumen `4786b08`:
      tests forge alg:none and replay a revoked token — both refused; the
      battery runs login→use→logout→401 over the wire.)
- [x] Posts CRUD + drafts (rev-checked PUT per §8), unpublish, soft-delete. (CAS
      verifies RowsAffected; soft delete frees the slug via partial unique; the
      publish machine 409s draft→unpublish; integration battery covers it all.)
- [x] **Publish = §2 transaction**: readTime from final content, preview default,
      rank assignment, Meilisearch upsert, Postgres commit — one handler, idempotent
      (re-publish byte-stable; store `content_hash` and no-op on identical).
- [x] Meilisearch: search client with index bootstrap — delivered EARLY via M2.5
      (the serving-model ruling moved all list/search reads onto it); upsert+delete
      hooks are the river queue jobs; compose addition landed with `cmd/seed`'s
      drain-pipeline; `cmd/index-init` = seed's enqueue-all + `cmd/reindex` is the
      reconcile entry point. **Admin search door (lumen §8
      `GET /admin/search`)**: second index `photos` (docs id/alt/collection/gallery —
      admin-only, §1 never reads it); the `tags` group is a Postgres VOCABULARY prefix
      lookup (a name, not a document — deliberately off the search engine); ≤8 each.
- [x] Admin photo verbs (lumen §8, from the contract audit): `GET /admin/posts/:slug`
      (incl. drafts + rev — the editor's door, the mirror HAD no verb line),
      `GET /admin/photos/:id`, `GET /admin/photos/:id/references` (content scan feeding
      the delete warn-list), `DELETE /admin/photos/:id` (row dies, OBJECT serves until
      GC). Session verbs reconcile against mellon's `client.ts` — api-sync round
      (expiresIn, logout, `q` retired) is the executable spec; §8 stays normative.
- [x] Tests: derivations unit-tested (preview default, word count, idempotent
      re-publish via content_hash, rank unmoved); integration suite RUNS against
      real pg+meili+embedded-S3+dev-vault (`make test-integration`), env-gated like
      the read harness — run-to-run idempotent by harness hygiene.

**Verify:** scripted curl choreography (commit it as `scripts/admin-smoke.sh`) — plus the
session proofs: a JWT replayed from a second client AFTER logout must 401 (tv bump),
`alg:none`/RS256-confusion tokens fail at the library, throttle returns 429 with audit
line (no payload):
login → create draft → §1 hides it → publish → §1 shows it, search finds it, byte-stable
re-publish no-op; drafts absent from EVERY read endpoint (assert in contract spec).
**PR:** lumen.

## M4 — `editor` · mellon · 2–4 days ⚠️ split PRs

**Context:** mellon §5, §11.4; earendil `src/lib/markdown/render.ts` (+ `layout.css`
prose section) as the vendoring source.
**Branches:** `mellon: milestone/4a-preview`, then `milestone/4b-editor`.

4a — preview parity:

- [x] Vendor `render.ts` (markdown-it chain: anchors, grids, task lists, Shiki dual
      theme, mermaid placeholder + `mermaid-src` escape) into `mellon/src/lib/preview/`;
      vendor needed prose CSS into preview-scoped stylesheet; mermaid in preview MAY
      start as source-reveal-only (defer client render — write the deviation in journal).
      (Served via `/api/preview`, auth-guarded; deviating local endpoint marked in code.)
- [ ] Parity page `/dev/parity`: same fixture text rendered by vendored copy vs an
      iframe of a local earendil route — manual-diff checklist in PR body.
      (DEFER to Phase C — needs both apps up; the vendored CSS block carries the same
      prose/shiki rules earendil renders with, so parity is structural for now.)

4b — editor:

- [x] CodeMirror 6 + vim keymap; pins exact; preference `mellon_vim` cookie;
      IME-safe toggle. (Reality check journaled: npm has no `@codemirror/vim`; the
      community package is `@replit/codemirror-vim` — installed pinned.)
- [x] Theme via CSS-var-driven `EditorView.theme` mapped from tokens — simpler than the
      planned style-mod + MutationObserver route: every color is a `var(…)`, so the
      `data-theme` flip repaints WITHOUT any reconfiguration (no JS observer needed).
- [x] Editor page: split/toggle preview, meta rail (status pill, slug, date, tags
      multi-select, featured picker via photo `<select>` — closes the §10 open question),
      two verbs (`save draft` / `publish`), Ctrl+Enter, dirty-state guard (beforeunload).
- [ ] Wire to REAL lumen M3 when available; mock otherwise (API layer unchanged).
      (Phase B item — mock mode is the state of the art here.)

**Verify:** full gates ×2; acceptance ritual from the plan: paste the queue-depths post →
preview matches (checklist in PR); publish lands through real lumen → earendil renders it
(with earendil dev pointed at M1 lumen); one hour of vim-mode editing without friction
(owner confirms — HUMAN note, agent self-reports).
**PRs:** two.

## M5 — `media` · 1 day

**Context:** lumen §5 (**D1 revised**: object storage + CDN, backend-relay upload —
2026-11-08 second pass), §8 upload. Earendil's planned `/media/*` relay work is
CANCELLED by that revision — browsers fetch CDN URLs directly.
**Branches:** lumen `milestone/5-media`, mellon `milestone/5-media`; [vortex] gains
the media-provider ExternalSecret refs, no relay manifests.

Tasks:

- [x] [lumen] multipart upload → **object store** (bucket/endpoint/CDN base from
      env — values in Bao, HUMAN-GATE #9 for the provider), dimension + EXIF strip
      BEFORE the object is public (image lib: Go stdlib `image` decode per format —
      pin format list to what the gallery needs: jpeg/png/webp), returns `Photo`
      with the absolute CDN src; GC window for soft-deleted.
- [ ] ~~[earendil] + [mellon] add `/media/*` to relay~~ **cancelled by D1-rev** —
      the mock-era `/api/media/:id` local route retires when the CDN src arrives.
- [x] [mellon] photos page: upload drop-zone (button-first — keyboard doctrine: real
      `<input type=file>` with label, `has-[input:focus-visible]` ring on the chip),
      alt editing deferred (§11 says caption from filename in mock), dims display;
      editor featured-photo picker (closes §10 open question).
      (Mock deviation: stores data-URLs + CLIENT-side dimension probe; lumen M5 does
      the server probe — contract shape unchanged.)

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

- [x] [lumen] `hashicorp/vault/api` client; AppRole login w/ token cache + re-login;
      expose ONLY: metadata list (policy-scoped), read (+`?version`), versions list, CAS
      write (require `cas` param — no unconditional puts); no `sys/` routes at all.
      (2026-11-08 audit: these four are exactly the routes lumen §8 now enumerates —
      `bao/paths`, `bao/:app/:env`, `bao/:app/:env/metadata`, `PUT bao/:app/:env`.)
- [x] [lumen] redaction middleware for admin access logs (op + path + version + actor;
      never values/body); tests assert body absence in logs (capture logger output).
- [x] [mellon] `/secrets`: app/env picker (from policy-scoped list), masked mono table,
      reveal-on-press-and-hold (`pointerdown`/`up` + `Space` keydown/keyup parity),
      edit drawer with CAS, version side-sheet + line diff (vendor a tiny diff or
      compute LCS — keep dependency-light), rollback = "save old version forward"
      (new version with old contents; Bao history preserved — journal this choice).
      (Implemented: LCS diff in `src/lib/diff.ts`, values MASKED in diffs too — the
      side-sheet is a review aid, Bao's audit holds the true bytes. "Save forward"
      rollback = pick old version → edit → CAS-save; no destructive path exists in UI.)
- [x] Seed procedure doc: `kv/data/lumen/{env}` gains **`SESSION_JWT_SECRET`** (32B,
      bootstrap-generated); `kv/data/mellon/{env}` is API_BASE-only (the portal holds no
      credentials in any era — with JWTs it holds not even a session secret); the owner
      `users` row (argon2id passhash) seeded via one-time lumen CLI at bootstrap; the
      `fzr-portal` role/policy creation lines + INFRA §5.6 checklist updates (doc change,
      not applied). [amended 2026-11-08 to the session design]

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
- [ ] ~~[vortex] **mellon has NO Ingress resource**~~ **amended 2026-11-08**: mellon
      gains an **IngressRoute for `console.gofar.id`** with the Phase-3
      `console-headers` + `console-ratelimit` middlewares attached; service stays
      ClusterIP (Traefik routes to it); port-forward line becomes the documented
      BREAK-GLASS (runbook in README). DNS record = GATE #10 (external resource +
      checklist) — owner action, sequenced last.
- [ ] [lumen/mellon] CI image bump wiring (kustomize edit images, existing pattern);
      `kubectl kustomize` every dir passes.
- [ ] `HUMAN-GATE` apply sequence: owner runs §5.6 manual bootstrap steps (unseal,
      AppRole/policy creation, first seeds), then Argo syncs staging → **owner**
      promotes per §5.4; agent drafts the promotion PRs only.
- [ ] [earendil] staging `API_BASE` switch via overlay env (no code); run the AGENTS §9
      preload-storm + relay QA checklist against staging URL.

**Verify:** Phase 10 acceptance (as amended): publish via mellon→render on earendil;
secrets round-trip audited; **console answers over public TLS with GATE #10 checked,
`tv`-revocation proven by replay**; `curl <any external probe> lumen/meili/bao ports` =
unreachable (the rule the amendment never touched); port-forward break-glass still works;
driftcheck CI green for all apps; §1 budget: live `kubectl top` within requests; pins bumped.
**PRs:** vortex (+ possibly earendil staging overlay PR — infra-owned, HUMAN merge).

## M8 — `harden` · P0 exit · 1 day

- [ ] Empty/error states sweep; settings page (vim toggle, theme note); keyboard-doctrine
      re-audit (grep for hover-only affordances; the M2 checklist re-run); CSP headers
      via relay config; port-forward runbook line in mellon README.
      (Partial: settings page DONE in M6; hover-only audit run this round — fixed
      palette input ring via `focus-within`, secrets value cell `focus-visible:bg-muted`,
      dashboard rows + upload chip got focus-visible twins; no `group-hover` without a
      `group-focus` twin anywhere. Remaining: CSP headers — DEFERRED with reason (the
      rail hues ride inline `style=` by design; a tight `style-src` fights the color
      system — refactor to CSS custom properties first, mellon §8 records the tradeoff),
      port-forward runbook line → break-glass runbook line.)
- [ ] Journal finalization: `mellon/PLAN.md` P0 close entry; every `HUMAN-GATE` decision
      recorded with date + owner.

**Verify (exit criteria):** §11.5 screenshot ritual (agent captures via owner-assisted
manual step — or documented checklist); keyboard-only demo script passes; all repos'
gates green; no open `HUMAN-GATE` left unresolved. **P0 CLOSED** only on owner's word.

---

## HUMAN-GATE ledger (the agent never resolves these alone)

| #   | gate                                                                                                                                                                                                                                                                                                                | milestone |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | ~~Create + push `kanatabi/mellon`~~ **CLOSED (owner, 2026-11-09)**: remote created & pushed (a `mollen` typo renamed in place on GitHub — history intact), registered as the fourth submodule in the superproject (`3906add`)                                                                                       | M0        |
| 2   | ~~lumen router choice (stdlib vs chi)~~ **RESOLVED (owner, 2026-11-08): chi** — same-session ruling **viper** for config (env > env.yaml > defaults, no dotenv); both recorded in `lumen/AGENTS.md`                                                                                                                 | M0        |
| 3   | PR merges (every repo, every PR) — lumen: **MERGED to main 2026-11-09 by owner instruction** (`milestone/1-read-api` ff + docs lineage; gates green on main); earendil `milestone/1-contract-harness` still pending                                                                                                 | all       |
| 4   | OpenBao bootstrap seeds: `fzr-portal` role/policy creation, `kv/data/mellon/*` first values                                                                                                                                                                                                                         | M6/M7     |
| 5   | Security threat-note ack before secrets merge — **expanded to standalone `THREAT-NOTE.md`; provisionally ack'd by the owner's merge instruction, FINAL re-review pending — it gates prod seeding + #10**                                                                                                            | M6        |
| 6   | Staging→production promotion runs                                                                                                                                                                                                                                                                                   | M7        |
| 7   | Any doctrine/AGENTS/INFRA amendment                                                                                                                                                                                                                                                                                 | any       |
| 8   | P0 exit declaration                                                                                                                                                                                                                                                                                                 | M8        |
| 9   | Media provider choice (S3 / R2 / Wasabi / …) — bucket, endpoint, CDN base, keys to Bao                                                                                                                                                                                                                              | M5-B      |
| 10  | **Console go-public**: DNS for `console.gofar.id` flips only after the checklist verifies — edge middlewares live (Phase 3 CRDs), lumen login throttle + argon2id credentials, `tv`-revocation PROVEN (logout kills an outstanding JWT replayed from a second client), `Secure` cookie over TLS, Bao audit trail on | M7        |

## Parked (do not build without re-planning)

Infra/GitOps tab · shared-theme package · multi-user/RBAC · WYSIWYG.
(Crossed off: client-side mermaid in the mellon preview — shipped; presigned-direct
media upload — recorded as lumen §5's future scale option.)

---

## Journal

### 2026-11-08 — execution order revised (owner decision): portal first, backend last

The tracks swap sequence, not content — the plan already decouples them via the
mock-first invariant (§1: mellon builds against its in-process fixtures; M2's API
layer). Revised order:

**Phase A — the portal (Track P, mock mode):**

1. M0 `[mellon-only]` — scaffold, theme parity, gates. _(HUMAN-GATE #1 repo creation
   can stay pending; local git proceeds, push retro-fits.)_
2. M2 — shell + palette + mock `AdminApi` layer.
3. M4a → M4b — preview pipeline, then editor (mock-backed).
4. M5 `[mellon UI]` + M6 `[mellon UI]` — photos & secrets pages against fixtures.
   Their verify blocks that need real servers (uploads through relays, Bao round-trip,
   threat-note gate) DEFER to Phase B — UI acceptance in Phase A is mock-mode:
   keyboard tour, §11.5 visual bar, interaction completeness.

**Phase B — the backend (Track L):** 5. M1 read-api → M3 admin-api → M5 `[lumen]` → M6 `[lumen]` — **lumen now implements
the surface mellon's `src/lib/api/client.ts` already encodes**: the mirror
relationship flips to the exact pattern earendil↔lumen already runs (client is the
contract's executable spec; §8 in lumen's DESIGN stays normative — they reconcile in
one commit set per the ritual). 6. Deferred verifies execute here: admin smoke scripts, compose-backed Bao integration,
HUMAN-GATE #5 threat note, drift check.

**Phase C — convergence:** 7. M5 `[earendil relay]`, M7 deploy & cutover, M8 harden (P0 exit unchanged).

Consequences, noted honestly: HUMAN-GATE #2 (Go router) now waits until Phase B starts;
lumen scaffold moves out of M0; and the editor's "publish lands on real earendil" check
lands in Phase C instead of M4 — everything else in the plan stands as written.

### 2026-11-08 — M0 [mellon-only] DONE — the portal breathes

Scaffold live: SvelteKit 3 + runes (forced via vite compiler), TS strict, Tailwind v4,
adapter-node, Node 22 — earendil's gate ladder replicated exactly (`lint` standalone,
`check` 0/0, vitest, build; all green first pass, 3 tests). Theme parity day one: full
semantic token contract in `layout.css` (copied values, additive `--danger/--diff-add/
--diff-del` light+dark), cookie-driven `resolveTheme` server load + pre-paint data-theme
script (verified in SSR: light default, dark follows the cookie — no FOUC path),
View-Transition toggle with `samesite=strict` (portal doctrine differs from the public
site, deliberately). `/healthz` 200 + mask asset served. Deviation logged: PR ritual
paused — no remote exists (HUMAN-GATE #1); commits accumulate on local `main` with
conventional messages and will retro-fit cleanly. [lumen] M0 items deferred to Phase B
per the portal-first reorder. Next: M2 shell + palette + mock AdminApi layer.

### 2026-11-08 — PHASE A [mellon] DONE — M2 + M4 + M5-UI + M6-UI in one round

The portal is fully browsable in mock mode: shell + palette, editor + preview,
photos, secrets + settings. Gates: lint 0 standalone, check 0/0, **16 tests**
(theme 3, slug 3, diff 3, new api contract 7), build + adapter-node server smoke.

**What the smoke run proved** (curl against `node build`): 303 guard → login →
session cookie; posts list/editor/dashboard SSR; relay maps AdminApi 1:1 (list,
preview POST → `mermaid-src` + shiki HTML out, photos, tags); **CAS discipline
live**: `cas=1` → 412, `cas=2` → v3, secrets page then shows `v3` from the
singleton mock state; recent-cookie written by the editor load; unauthed `/api/*`
→ 401; unknown relay path → 404 (never a silent proxy success).

**Smoke lesson worth keeping:** adapter-node derives the request origin from
`x-forwarded-proto`-style headers ONLY when `PROTOCOL_HEADER`/`HOST_HEADER` are
set, else assumes https — a plain-http POST then trips Kit's CSRF with a 403
("Cross-site POST form submissions are forbidden"). Locally: `PROTOCOL_HEADER=
x-forwarded-proto HOST_HEADER=host node build`. In-cluster the ingress sets the
forwarded headers and `ORIGIN` env lands in M7 — no app bug, but the runbook line
for M8's port-forward recipe now.

**Deviations journaled this round** (all deliberate, none silent in code):

1. Mermaid in preview = source-reveal (`mermaid-src`), no client render — Route B
   honesty in the editor; earendil keeps the render pipeline exclusive.
2. `@replit/codemirror-vim` (npm has no `@codemirror/vim` — earlier plan text
   corrected here rather than in the old entry, append-only).
3. Editor theming is CSS-var-driven `EditorView.theme` — the data-theme flip
   repaints for free; the planned MutationObserver is unnecessary (simpler wins).
4. Photos: data-URL storage + client dimension probe (mock reality; lumen M5
   server-probes, contract unchanged). Alt editing deferred — caption from filename.
5. `/api/preview` is mellon-local, deviating from lumen's surface — marked in the
   relay code comment; it rides the auth guard and nothing else.
6. Login accepts any non-empty pair (mock); real minting is lumen M3. The browser
   client THROWS on `login` — sessions are minted by the form action only.
7. PR ritual still paused (HUMAN-GATE #1 — no remote). Commits accumulate per
   milestone on local `main`: feat(m2), feat(m4), feat(m5), feat(m6), docs —
   they retro-fit into branch/PR shape when the repo goes up.

Keyboard audit result: zero `group-hover` without a `group-focus` twin; three
`outline-none` inputs audited (two kept — both sit inside focus-within-ringed
labels; one gained `focus-visible:bg-muted`); dialog focus = `focusOnMount`
action (earendil lesson #7 — `autofocus` no-ops on dynamic mounts).

**Next:** Phase B awaits owner go + lumen repo (HUMAN-GATE #1 also gates GitHub
targets for CI). M8 leftovers (CSP, runbook) can ride the first lumen PR round.

### 2026-11-08 — owner review round 1: eight calls, all executed

1. **Settings save "unchecked itself" — real bug, found and fixed.** The cookie
   was always written; SvelteKit's `enhance` resets form elements after a
   successful action, and that reset (DOM → `bind:checked`) snapped the toggle
   back to its pre-save default. Fix: `update({ reset: false })` + a quiet
   `saved;` confirmation. Lesson for the family: never pair `bind:` with a
   server-truth form without thinking about the reset.
2. **New post = editor, immediately.** The standalone create-form page is gone;
   `/posts/new` renders the editor with an unsaved starter doc (rail shows an
   `unsaved` marker instead of a status pill). First save POSTs create; publish
   from unsaved runs create+publish as one intent before adopting the URL.
   Slug moved into the settings rail, auto-derived from the title until authored
   by hand — and **fixed at creation** (URL stability; lumen §8 has no rename
   verb, so the input goes read-only with "URLs never move;" after creation).
3. **Dates**: `createdAt` + `publishedAt` (null until first publish) joined the
   contract; shown on dashboard rows, list rows, and the editor timeline block.
4. **Three-state machine** `DRAFT → PUBLISHED ⇄ UNPUBLISHED` (no path back to
   draft once shipped): status type, mock transitions (409 on illegal unpublish,
   idempotent republish), pill skins (violet / outlined / dashed), filter chips,
   verbs per state, and contract tests. lumen/DESIGN §8 mirror updated in the
   same commit set per the ritual.
5. **List filtering moved to a right rail**: tags (OR semantics — relayed as
   repeated `?tag=`, never filtered client-side; doctrine #1 respected: the
   load parses params into `PostListOpts`, the API does the work) + sort
   newest/oldest/title. Filters live in the URL — shareable, back-button clean.
6. **Every sidebar folds to the side** — left nav (rail: icons + `m;` mark),
   posts filters, editor settings — via `src/lib/rails.svelte.ts`
   (localStorage; a pure client preference, deliberately NOT a cookie —
   nothing server-side reads it). SSR renders expanded, `init()` adopts the
   stored value on mount; one-frame settle, no FOUC class of problem.
7. **Preview toggle** stays a visible toolbar button (eye icon, pressed state),
   not palette-only; debounced render skips work while off.
8. **Motion where it moves, still where it reads**: rail fold = 200ms width
   transition + content curtain; palette = fade backdrop + fly sheet; list
   rows = 140ms local crossfade; message = slide; primary buttons =
   `active:scale`; a global reduced-motion kill-switch added. §11.3's motion
   clause amended to match the owner's call.
9. **Topbar command field widened** to w-72 with the kbd pinned right.

Smoke notes: `transition:local|fade` is **Svelte 4 lore** — the 5.x AST is
`transition:fade|local` (modifier after the name; svelte-check only accepts
the new order). Kit 3 renamed `$app/environment` → **`$app/env`** and the
goto options → `{ replace, reset }` (`noScroll`/`keepFocus`/`replaceState` are
gone — `reset:false` covers both scroll and focus). Both found by check, fixed
before commit. Sort-direction sign bug caught by the smoke sweep, pinned by a
new test assertion (newest[0] must be the just-touched draft).

### 2026-11-08 — owner review round 2: the typing-never-saved bug, folding rails fixed

Seven reports; the list found two real defects and one overridden deviation:

1/4. **Rail collapse buttons died silently** — `onclick={rail.toggle}` passes a
prototype method detached from `this`; every click threw a TypeError behind the
handler. All three rails shared the bug. Fix in `rails.svelte.ts`: arrow-bound
class fields (`init = () => …`), so any passing style works. Lesson journaled:
never hand a `this`-dependent method as an event reference.

3. **The editor never saw the typing — a data-loss bug.** `CodeMirrorEditor`
   pushed doc changes only through `onchange`, never assigning its `$bindable`
   `value`; the parent's `bind:value` left `draft.content` frozen at the seed.
   Preview looked static AND **save wrote the old content back**. Fix: assign
   `value = emitted` in the update listener (bindable props must write themselves).
   Verified end-to-end: typing now reaches the doc → CAS PUT carries it.

4. **Mermaid renders in the live preview** — owner reversed the source-reveal
   deviation: `src/lib/mermaid-preview.ts` lazy-imports `mermaid@12.2.0` (same
   pin as earendil) after each preview swap, `pre.mermaid-src` → SVG box; theme
   flip re-renders from the kept sources; parse errors reveal the source dashed.
   The escaped source stays the DOM ground truth — Route B rule intact. The
   server pipeline still emits source-reveal (SSR + no-JS fallback).

5. **Preview pane ghost below the editor on toggle-off**: the outro `fade`
   kept the pane a grid child while the container had already collapsed to one
   column — it reflowed to row 2 mid-fade. Removal is now immediate; transitions
   on layout-participating children are the trap, journaled.

6. **Breadcrumb is navigation** — segments are links (cumulative paths), the
   last wears `aria-current="page"`; the root reads `dashboard`.

7. **Copy de-semicolonised** — every button, label, pill, message and empty
   state is normal prose; the `;` device survives ONLY in the wordmark `mellon;`
   (§11.2 amended). Near-real-time preview: debounce 250→120ms (one Shiki
   round-trip per burst, feels live).

Gates: lint 0 standalone · check 0/0 · 18/18 tests · build + SSR smoke
(breadcrumb links, clean copy, wordmark intact, lazy mermaid chunk present).

### 2026-11-08 — mermaid bomb exorcised: parse-first, settle-to-render

Owner screenshot: mermaid's own "Syntax error in text" bomb SVG rendered twice
in the preview. Root cause is a trap worth keeping: **`mermaid.render()` does
NOT reject on a parse error — it RESOLVES with the error graphic as the svg**
(its legacy `parseError` renderer paints the bomb and hands it back as
success). A `catch` around render is never fired; the bomb lands in
`box.innerHTML`.

The graceful cycle now — exactly the proposed UX:

- typing → every preview swap re-`markMermaidPending`: dashed shimmer box
  (pure CSS sweep, role=progressbar), the escaped source hidden underneath;
- settled (450ms after the keystroke burst) → `mermaid.parse(src,
{suppressErrors:true})` gate FIRST — nothing paints on failure; only
  verified sources reach `render()`;
- invalid → our dashed error panel: quiet headline, the parser's first line,
  and a `<details>` revealing the source. §11.3 holds: no red, no bombs;
- belt beyond the gate: `mermaid.parseError` is hooked to THROW (so even
  render's internal error path rejects into our handler) and the resolved svg
  is content-checked for the bomb markers as a last guard.

Verified API facts against mermaid@12.2.0's shipped .d.ts (parse resolves
`{diagramType}` when valid / `false` with suppressErrors / throws without).
Half-typed fences never flash errors: they simply stay pending until the
typing pauses.

### 2026-11-08 — shimmer removed: a pending state that needs JS to leave is a trap

Two-step lesson, same hour:

1. The previous message rewrote `mermaid-preview.ts` but the round was cut
   before `PostEditor.svelte` and `layout.css` followed — a half-applied edit
   is a broken app (the AGENTS "verify edits landed" rule, biting our own
   portal). The screenshot showed it: empty pending boxes that no code path
   could leave.
2. The design itself was wrong: the shimmer box was an intermediate DOM state
   removable ONLY by the async chain (dynamic import → parse → render). When
   mermaid's load failed — e.g. the dev server predating the dependency
   install — every box shimmered forever. "Remove the shimmering feature" is
   the correct call: **never build a waiting state whose escape hatch is the
   thing you're waiting on.**

Final cycle: while typing, the dashed `.mermaid-src` block IS the waiting
state (server-rendered ground truth, zero JS required to exist — and nothing
hides it unless a render SUCCEEDS). 450ms after the burst settles,
`renderMermaid` attempts each fence: parse-first (suppressErrors — mermaid
never paints; our `parseError` hook captures the message, with a deliberate
re-parse to guarantee one), render, svg content-guard as last belt. Success →
`.mermaid-box`; failure → `.mermaid-error` panel (headline + parser line +
source in `<details>`). Theme flip re-renders from the surviving sources
(force); if mermaid fails to load at all, everything just stays as source
with one console warning. Worst case = source, never a stuck lie.

Gates green (lint 0, check 0/0, 18 tests, build). NOTE for the owner: restart
`npm run dev` — Vite optimized mermaid (114 pkgs) mid-session and a stale
dep cache explains the failed dynamic import behind the stuck shimmer.

### 2026-11-08 — owner review round 3: preview motion, vim status bar, export rail, confirm-to-delete, earendil dates

Seven calls, plus the tail of the shimmer saga (previous entry). All shipped:

1. **Preview toggle animates** — the pane is now a permanent grid child whose
   column animates `1fr ↔ 0fr` (`transition-[grid-template-columns,gap]`,
   200ms) with inner `min-w` so text never re-wraps mid-slide; hidden below
   lg where there is no room to slide. No outro ghost: nothing leaves the
   layout, so nothing can reflow (the old bug's structural cure).
2. **Editor status bar** — CodeMirror's frame gained an instrument readout:
   vim mode badge (`INSERT` violet / others solid, `NORMAL·PENDING` submodes)
   fed by the keymap's `vim-mode-change` DOM event (the package ships no
   getVim accessor), plus `Ln/Col` live and word count. Non-vim users see
   `insert · Ln · words` — still useful.
3. **Export section in the settings rail**: `download markdown` (YAML
   front-matter + Route B body, blob download), `copy markdown`
   (clipboard API), `save as PDF` — prints the LIVE preview DOM (hydrated
   mermaid included) through the browser's own Save-as-PDF in a popup with
   the light-theme Shiki vars resolved inline. Export = portable artifact,
   not the storage contract.
4. Subtitle is a 3-row auto-styled `textarea`.
5. **Delete = GitHub-style intent check**: real dialog (`DeleteDialog`),
   permanent-effect copy, the slug shown `select-all`, submit disabled until
   the retyped slug matches; Esc/backdrop close with busy-locking; red
   finally earns its keep on the one truly destructive verb (§11.3).
   6/7. **Dates go native-to-us, not native-to-OS**: `DatePicker` (editor) and
   `DateRange` (posts rail: 7/30/90/all presets + two-pick Monday-first
   calendar) vendored from earendil's rail recipe — same geometry, same
   brand-filled endpoints, same non-modal Esc/outside-click contract.
   Popovers position `fixed` from the trigger rect because the curtain rails
   clip their overflow. `?from&to` relay through the API (inclusive window on
   the editorial date, ISO-lexicographic — pinned by contract test).

Check caught two self-inflicted regressions before commit: the CodeMirror
rewrite had dropped `$bindable()` again (bind would fail loudly now — good),
and DeleteDialog's `role=dialog` belongs on a wrapper, not the `<form>`.

### 2026-11-08 — vim badge stuck: there is no DOM event to listen for

Owner screenshot: the status bar read `INSERT` forever. The event I trusted —
`vim-mode-change` — is real but PRIVATE: @replit/codemirror-vim dispatches it
on its own CM5-style emitter (`cm.on(...)`), consumed by the package's own
status bar; it never touches the DOM, so my `host.addEventListener` sat
waiting for something that cannot arrive. The badge only ever showed its seed.

The truth door the package DOES export: `getCM(view)` → CM5 adapter →
`cm.state.vim.mode / subMode` (`'Insert' | 'Normal' | 'Visual line' …`).
Now sampled on every editor transaction (mode switches ride effects) plus a
`keyup → queueMicrotask` belt for transitions that resolve outside a
transaction. Lesson: grep a library's DISPATCH site, not just the event name —
`on(` in their code may be their bus, not the DOM.

Reload seed fix: `state.vim` is created lazily by the keymap, and my "nothing
yet" fallback said INSERT — but vim opens in NORMAL (owner screenshot). The
fallback now mirrors the truth; live reads correct it from the first key.

### 2026-11-08 — actions join the rail; wrap joins the status bar

Owner layout call: the meta bar above the editor keeps ONLY the preview
toggle; `save draft` / `publish`-`unpublish` / quiet `delete` move to the top
of the settings rail — Ghost's publish-box position, actions live with
settings. A `dirty · unsaved` dot-in-pill appears beside the toggle, and
⌘S joins ⌘Enter for save (the rail can be collapsed — the shortcut keeps the
primary verb reachable either way; keyboard doctrine).

CodeMirror status bar gained a `wrap` chip (aria-pressed; compartment
reconfigure, no rebuild) persisted to localStorage like the rails — default
on, matching the old behavior. §11.4 amended in place.

### 2026-11-08 — rail relabel: actions are not "settings"

Owner screenshot flagged the misleading grouping — publish verbs sat under
the rail's SETTINGS heading. The rail is now headed **post**; **actions** is
its own labeled section (save/publish/delete), ahead of the fields, export
and timeline. Collapse/expand aria labels follow the rename. §11.4 amended.

### 2026-11-08 — phones get bottom sheets (earendil's RailDrawer ported)

The right-side rails (posts filters, editor post rail) are inline at `lg+`
and render as a **bottom sheet** below that — earendil's recipe ported
verbatim: floating circular trigger above the safe area, modal sheet capped
at 80svh with grab-band drag-to-dismiss (1:1 downward, rubber-band upward,
fling velocity decides), Esc/backdrop/X close, focus returns to the trigger,
navigation closes it, reduced-motion honored. Markup is shared via Svelte 5
snippets — the sheet and the desktop aside render the same `railBody` /
`filtersBody`, so mobile is never a second-class copy.

Type detour worth keeping: lucide v1 ships LEGACY component classes (plain
`<script>`, class constructors invariant on their prop type) — `Component`,
`Component<any,any>`, and `typeof SvelteComponent` all reject them
structurally; the honest annotation is the concrete union
`typeof FileCog | typeof SlidersHorizontal`.

### 2026-11-08 — tablet & mobile shell round (planned session, executed)

Three shipped calls from the owner review of the phone/iPad surfaces:

1. **Topbar was structurally fragile at md** (iPad screenshot: breadcrumb text
   under the search pill). The pill was `absolute left-1/2` — absolute centering
   reserves no space, so siblings slide beneath it. Now a three-zone flow grid
   `minmax(0,1fr) auto minmax(0,1fr)`: breadcrumb truncates BEFORE the pill,
   pill stays optically centered, actions right. Collision-free at every width.
2. **Hamburger drawer below lg**: the mobile icon strip is gone; the topbar's
   left zone gains a Menu button, summoning a left slide-in drawer (slide|local
   x-axis + backdrop fade, X/Esc/backdrop close, close on navigation, focus
   return, body scroll-lock while open, safe-area padding). Deliberately NO
   drag-to-dismiss — nav drawers are tap-to-dismiss idiom; the thumb-pull
   gesture stays with the bottom sheets. No focus ping-pong on navigation
   close (plain state clear, not closeNav()).
3. **Editor/preview tabs below lg** (the agreed plan): top `write|preview`
   segment under the meta bar, roving tabindex (Tab lands on the selected tab,
   arrows + Home/End walk), panels mounted permanently — inactive hidden via
   `max-lg:invisible/opacity-0` (visibility removes it from tab order and a11y
   tree WITHOUT JS media queries: desktop semantics untouched by mobile state,
   and hydration-safe since SSR always renders the `write` default). Preview
   stays live on mobile (`previewLive` keeps rendering into the hidden tab —
   switches are instant). Pane box `h-[calc(100svh-13.5rem)]` — the offset is
   the one number to tune in real-device QA. Eye toggle goes lg-only; the
   dirty-dot pill stays in the meta bar for both layouts.

Tailwind lesson reused on purpose: state-driven classes must exist as LITERAL
strings for the scanner — the ternaries spell `max-lg:invisible` in full.

### 2026-11-08 — phone follow-up: empty editor + wandering toggle (two flex/grid traps)

1. **Empty editor on phones:** the pane box carried `flex-1` AND
   `h-[calc(100svh-…)]` — flex's 0% basis overrides the explicit height in an
   indefinite-height column, so the box collapsed to zero and the absolute
   children (no intrinsic height) vanished. The old static grid survived only
   because its child had `min-h-[50vh]` forcing the row open. Fix: mobile =
   `h-calc shrink-0`, desktop = `lg:flex-1 lg:h-auto` (basis 0 is fine there
   because the split grid rows size to content stretch).
2. **Theme toggle drifted to center, over the breadcrumb:** grid
   auto-placement SKIPS `display:none` items — with the ⌘K pill hidden below
   md, the toggle took the middle auto track instead of the right one. Fix:
   explicit `col-start-1/2/3` placement on the three zones; a hidden pill can
   no longer shift anything.

Both were invisible to every desktop-width test — real-device passes are part
of the shell's definition of done, not the last step. §11.1 amended.

### 2026-11-08 — vim auto-off below lg; wrap promoted to a real toggle

1. **Vim is a desktop affordance.** The preference cookie stays the user's
   truth; the EDITOR computes effectiveness: `vim && !smallScreen`. Own
   `media()` store (svelte 5.57 exports no `mql`) starts false → SSR/hydration
   agree → syncs post-mount and tracks viewport crossings live (rotate a
   tablet: vim compartment reconfigures itself, status bar follows). Settings
   copy says so. No state.vim → plain `insert` mode on touch.
2. **Wrap left the status bar** for a normal pressed-state pill in the meta
   bar — every viewport, next to preview; the editor became a pure `wrap`
   prop consumer (parent owns state + localStorage, same key).
3. Two traps caught by the gates on the way: a `vim` PROP shadowed the `vim`
   EXTENSION import (eslint's odd "read-only" error was really calling a
   boolean as a function — alias to `vimKeymap`), and lucide v1 renamed
   WrapText's class to `lucide-text-wrap` — the alias still imports fine,
   greps must use the new kebab.

### 2026-11-08 — wrap rides the tab row

Owner placement call: pane controls live in ONE band — tabs left (below lg),
wrap pill right (`ml-auto`), at every viewport. The meta bar keeps only the
dirty dot and the desktop eye toggle.

### 2026-11-08 — FAB retired: sheet triggers occupy layout, not the sky

Owner screenshot: the floating file-cog sat on the editor's status bar,
crushing the word count. Floating triggers are earendil's reading-context
furniture (a sticky assistant by the BottomNav); in the admin every control
belongs in a band with an honest layout slot. RailDrawer became SHEET-ONLY
(open/trigger bindable props, all dismissal logic intact) and the triggers
are chips in the rows that already exist: the editor's pane-controls row gets
`[post]` (phone/tablet only), the posts status row gets `filters · N` (N =
active tags + date window; chip violet-tinted when N>0). ml-auto lives on the
ALWAYS-visible element (wrap) — put it on a lg:hidden one and desktop loses
its right edge (caught before commit).

### 2026-11-08 — thumb band: editor pane controls dock to the bottom (option 3)

Owner review of the top controls row: the meta band should be pure content
and pane controls belong where the thumb is — earendil's idiom, applied to
the editor screen (scoped to this page, NOT the global drawer-nav):

- `<lg`: below the panes a slim bar — `[write|preview]` segment left,
  right-paired `[wrap] [post]` — the post chip still summons the sheet.
  The top controls row is gone; panes reclaim that height (13.5rem chrome
  offset kept — row out ≈ band in; re-check on device).
- `lg+`: unchanged split + eye; wrap lives in the meta band beside the
  toggle, rendered from ONE snippet in both bands (`wrapToggle(cls)`) —
  two homes, zero forked markup.
- Status band (mode · Ln/Col · words) stays inside the write pane, directly
  above the thumb bar: readouts stack above inputs, VS Code order, no
  overlap since both hold layout (the FAB lesson, applied).

### 2026-11-08 — route-progress bar ported from earendil's shell

Navigation latency (real in Phase B when loads hit lumen) deserves honest
feedback: the portal now paints earendil's 2px violet bar — the same
three-phase machine (active sweep capped at 94% → guaranteed finishing beat
→ fade), hash-jump exclusion, preloaded-fast-navs still get a visible
pulse. Ported verbatim, including the raw-CSS exception (fixed overlay,
phase-driven keyframes) — z-60 so it rides above the palette (z-40) and the
delete dialog (z-50); 2px and pointer-transparent, it never blocks.

Known limits, stated: the FIRST document load can't show a bar that ships
inside the document (browser spinner covers that), and per-route slow DATA
would need SvelteKit `+pending` skeletons — the bar answers "the portal is
working", not "what is loading". If Phase B loads crawl, +pending is the
next layer, deliberately un-shipped for now (mock loads are instant; a
skeleton for zero-latency is theater).

### 2026-11-08 — media & vocabulary round: tags become first-class, one picker to rule them

Owner session, five parts (four code commits + docs):

1. **Tags are a vocabulary now, not a derivation.** `createTag` joins AdminApi
   (slugified, 409 on duplicates, lumen §8 mirrored). The rail's chip wall
   becomes a `TagPicker` combobox: search, roving arrow-key options with
   checkbox states, and EAGER creation — the create-row POSTs immediately
   then selects, so saves never guess which names are new. Selected chips
   keep the house look, keyboard-removable.
2. **Mock media store + `/api/media/:id`** — uploads now get a _serving URL_
   (`AdminPhoto.src`), bytes in a process store, the route marked a
   mellon-local deviating endpoint (like `/api/preview`, same retirement
   class: when Phase B's CDN src arrives, both vanish without UI churn).
3. **`ImagePicker` — one dialog, three modes** (thumbnail/insert/upload):
   drop zone as bonus over the real labeled file input, per-file queue,
   library grid, copy-link row action. Single upload in thumbnail mode picks
   itself; in insert mode it embeds itself — `insertAtCursor` on the CM
   wrapper writes `![alt](src)` through the NORMAL docChanged path, so
   value/dirty/preview all update for free. Alt = filename, no prompt.
4. **Photos page folds into the picker** — one upload path in the portal.
5. **D1 REVISED (docs):** media = object storage + CDN, **backend-relay
   upload** (lumen probes + strips EXIF before public). Presigned-direct
   recorded as the future scale option — the portal contract was shaped so
   the swap touches zero UI code. Earendil's `/media/*` relay work is
   cancelled; provider choice enters the ledger as HUMAN-GATE #9.

Gates per commit: lint 0 standalone, check 0/0, 19 tests (media round-trip
pinned: upload → serve bytes → gallery URL shape), builds + SSR/relay smoke
(401 on media unauthed, 404 unknown, 409 dup tag, vocab count-0 listing).

### 2026-11-08 — thumb band keys: rectangles, not circles, not labels

Owner screenshot showed the labeled chips overflowing (post clipped off-screen);
icon-only was agreed, and the first draft's 36px circles were rightly rejected
as too small to hit. Final form: `h-9 w-11` rounded-md keys — 44px-wide touch
target, house form-control shape (cards round at lg, keys round at md), icons
size-4, pressed states intact, `title`+`aria-label` for discovery. Snippets
gained an `iconOnly` param — desktop meta band keeps the labeled pills, one
markup source. Tab padding trimmed to px-3 for the ≤360px crowd. Math:
segment ~120 + 3×44 + gaps ≈ 276px — fits 320.

### 2026-11-08 — search everywhere + the posts table (desktop) round

Three owner calls, three commits:

1. **Mobile filters key**: the four status chips + clear scroll horizontally
   (single line, hidden scrollbar); the sheet trigger became a pinned
   `h-9 w-11` key in the thumb-band language. "Is anything filtered?" answers
   itself twice: violet tint + a mono count badge on the key corner.
2. **Search made reachable and real**: a round Search key joins the theme
   toggle below md — the palette door phones never had. And the palette now
   SEARCHS POSTS: 2+ chars fire a debounced `listPosts({q})` THROUGH the
   relay (doctrine: the API filters, never the palette looping arrays), top 5
   join a 'posts' group ranked below actions, each row wearing its status as
   the hint-column value. Pill copy upgraded to the truth: "search posts,
   commands…". (q/relay/mock all existed — this round just wired the door.)
3. **Desktop posts table**: `lg+` renders a columnar table (title, created,
   updated, published, status+rev) — headers SORT: clicking a column link
   flips dir / picks the field default (dates desc, title asc), `aria-sort`
   honest, direction arrow on the active column. Below lg the existing
   stacked rows stay (owner: the current mobile view suits it) — ONE loop
   serves both: div role=table, rows flip flex→grid at lg, date cells hide
   below lg while the mobile meta line hides above it, so the two views can
   not drift. Rows are link-cards (title ::after spans the row: whole-row
   click, one tab stop, focus-within tint).
   Contract change: `sort:'newest'|'oldest'|'title'` → `sort:
'updated'|'created'|'published'|'title'` + `dir:'asc'|'desc'` (default
   updated/desc; never-published sinks as the empty key). Rail chips map
   onto it (newest/oldest/title unchanged in feel). lumen §8 mirrored in
   the same set; tests expanded to pin created/published/title/window.

### 2026-11-08 — curation round: gallery flag, collection vocabulary, tiles⇄table

Four commits (`74f0dc5 → docs`):

1. **media-model**: `AdminPhoto.{gallery,collection}` + listCollections/
   createCollection/updatePhoto(PATCH) + `listPhotos({collection?, gallery?,
sort?, dir?})`. Uploads land `gallery:false, collection:null` — publishing
   to the blog's Gallery is deliberate; collections are ADMIN-INTERNAL themes
   (public = every gallery=true photo, owner decision). Seeds cover every
   state. lumen §1/§6/§8 mirrored in the same set.
2. **photos-curate**: filter strip (collections + in-gallery/out + select
   all), eye keys + single-select collection Combobox per tile, bulk bar
   that exists only while a selection lives, optimistic per-id edit overlays
   (tiles never reload under the keyboard). TagPicker generalized into
   `Combobox` (multi|single + injected eager create + optional clear row) —
   tags and collections share one popover truth; TagPicker retired.
   Gotcha kept: Kit 3 +server.ts is verb-EXPlicit — PATCH 405'd until it was
   exported; and an a11y `figcaption` must be FIRST OR LAST child of a figure.
3. **photos-table**: `[tiles | table]` segment (localStorage, like rails/
   tabs), table = checkbox · thumb · alt · collection · gallery · size ·
   created with API-sorted headers (`sort=title|collection|created`,
   uncategorized sinks on the empty key). Phones always see tiles — the
   table is `hidden md:flex` even if the saved view says otherwise: seven
   columns lie at 390px.
4. **docs**: §6 page table + §11.4 darkroom anatomy.

### 2026-11-08 — photos sidebar: the posts architecture, transplanted

Owner ask: date-range + collections (+sort) in a filter sidebar. Built as a
carbon copy of the posts pattern — inline curtain rail at lg+, bottom sheet
below (RailDrawer + badge-counted key), ONE `filtersBody` snippet serving
both, DateRange reused verbatim. The contract grew the list to match:
`listPhotos` now takes `{collections?: string[] (repeated ?collection=, OR,
'uncategorized' = null bucket), gallery?, from?, to?, sort?, dir?}` —
createdAt windows inclusive, ISO-lexicographic; tests pinned; lumen §8
gained the explicit `GET /admin/photos` verb line it was missing. The strip
slimmed to the always-visible axes (gallery state, select-all) — collection
chips moved behind the sidebar where the dates already live.

### 2026-11-08 — color round + pagination: seven commits, doctrine amended (HUMAN-GATE #7 applied by owner)

Owner-led redesign, executed in browsable tiers (each revertable alone):

- **Pagination first** (`05a1759`, `cd955e4`): admin lists return the §1-shaped
  envelope `{ total, items, page, pageSize }` — posts 20/page, photos 24,
  out-of-range pages clamp to the last (never an empty void), 48-post bulk test
  pins non-overlap. Pagers are LINK bands; any filter/sort change drops
  ?page= (stale pages behind new filters read as broken); photo selection is
  per-page context and clears on query change. lumen §8 documents the envelope
  it had been silently promising (`page` was listed, never honored).
- **Tier A** (`f6ebaf3`): whisper-indigo neutrals + `--chrome` shell — rail and
  topbar are the wall, content the lit panel. Token names remain the earendil
  contract; VALUES diverge by owner decision.
- **Tier B** (`d4663eb`): hues get jobs — draft amber, gallery axis teal (strip
  chips, tile + table eyes), vault reveal amber. published violet, unpublished
  dashed-neutral, red exclusively destructive.
- **Tier N** (`8975735`): the nav cast — violet/periwinkle/teal/amber/slate per
  destination, icons 72% at rest, full + color-mix wash when active, ONE
  `navItems(rail)` snippet for rail/strip/drawer. Hues ride INLINE styles
  (Tailwind can't generate dynamic utility names). Recovery note: an external
  stash apply landed mid-flight with the snippet referenced but never defined
  — the commit also completes that definition; gates caught the broken state
  before it shipped.
- **Tier C** (`8183c63`): the login aura — the single sanctioned radial.
- **Docs** (this commit): §11.3 rewritten as the wayfinding doctrine (cast
  table, where color may/may not live, the one gradient exception), §11.4 gains
  the login entry, `palette.test.ts` guards light/dark token parity + @theme
  mapping + the zinc-departure, journal closed.

### 2026-11-08 — palette context commands: DESIGN §7 becomes real

Owner asks: editor verbs + image import in the palette, editor commands shown
ONLY on the editor. The registry promise ("pages register, the palette
renders") existed only for static nav; now it's a mechanism:

- `page-commands.svelte.ts` — a $state registry; a page publishes its verbs
  inside an effect whose CLEANUP unregisters. Leaving the editor cannot leave
  stale save/publish rows on the dashboard (the lifecycle contract).
- PostEditor registers: Create/Save draft (⌘↵ label follows mode), Publish or
  Unpublish (state machine decides which exists at all), Delete post… (opens
  the confirm dialog — never deletes straight from a palette keystroke), and
  Import image into post (insert-mode picker).
- Global `Import image` action → /photos?upload=1; the photos page opens the
  shared picker once per arrival flag (uploadSeen latch — closing must not be
  fought by a re-opening effect). One upload door, many handles.
- §7 amended with the lifecycle contract.

### 2026-11-08 — the visibility round: settings appearance, palette toggles, end-session, search doctrine, photo detail (6 commits)

Owner walked in with four observations that were really one theme — controls
that exist but hide, and content that can't be found: _where is the theme
setting_, _the end-session button is ugly_, _images must be searchable by
ALT_, _a clicked image should land on its own page_. All four landed.

- **`6210277` feat(settings)**: Appearance section with a `[light | dark]`
  segment (radiogroup), writing through a NEW extracted `setTheme()` — the
  single write path (store + cookie + View Transition) now shared by the
  topbar toggle, the settings segment and the palette. The stale footnote
  ("theme follows the toggle in the top bar") was deleted: a control with
  documentation pretending to be a setting was the actual bug. One behavior,
  three doors, zero forked logic.
- **`a6eab3f` feat(palette)**: global toggles `Toggle theme` + `Toggle vim
editing`, state shown IN THE HINT COLUMN (light/dark, on/off) — the palette
  answers "what mode am I in?" before you flip. Vim writes the same
  non-httpOnly cookie as the settings action, then `invalidateAll()` → the
  layout load re-reads it and the CodeMirror compartment reconfigures WITHOUT
  a page reload. `Toggle word wrap` registered as an EDITOR-CONTEXT command
  (exists only where wrapping exists — the register/cleanup lifecycle doing
  its job). Lesson relearned the hard way: lint flagged an unused import and
  my `&&`-chained gate script let the commit slide anyway — amended; run
  gates to completion BEFORE staging anything.
- **`454897f` fix(nav)**: end session became a nav row — hairline separator,
  LogOut icon, danger tint on hover only, and the collapse fix that matters:
  the old label fade left an INVISIBLE FOCUSABLE BUTTON in the tab order when
  the rail folded. Icon always visible, `aria-label` carries the name, one
  `navFooter(rail)` snippet for rail/strip/drawer.
- **`c452f94` feat(search)**: the doctrine line drawn — **portal-side**:
  commands/nav/toggles; **API-side**: `search(q) → {posts, photos}`, one
  debounced call for both content groups, ranked ABOVE actions (searching
  "alpine" should find the photo, not the word "actions"). Photos match on
  ALT + collection — the curation vocabulary people actually remember; the
  mock does honest substring, lumen §4/§8 mirror Meilisearch + the admin-only
  `photos` index for Phase B. The old palette hack (`listPosts({q})`) is
  gone; the contract now says what the backend will actually serve.
- **`ab01190` feat(photo-detail)**: `/photos/[id]` — the photo's own page,
  and the owner's correction steered it: "by save image I mean save the
  METADATA" — so metadata is a **classic dirty-state form** (draft vs
  baseline, per-field dots, Save disabled until dirty, ⌘S, commit-all PATCH,
  failure keeps edits) with the editor's unsaved-navigation guards lifted
  whole. Download (blob same-origin → open-tab fallback, honest about CORS),
  delete **WARNED NEVER BLOCKED**: `listPhotoReferences` content-scan runs
  SERVER-side with the page load (a delete warning that hydrates late is
  advice already acted upon), the generalized DeleteDialog
  (`heading/description/confirmText/references`) lists the citing posts and
  demands the photo id retyped. `deletePhoto` keeps bytes in the mock media
  store — Phase B's GC window made tangible. The metadata pane is a hideable
  curtain (`photoRail`) lg+ / RailDrawer sheet below — with the form state
  living in the PAGE so closing the sheet hides the UI, never the edits.
  Fixture corpus amended so references are REAL: both queue posts now embed
  p2 (the USED-IN list must be exercisable from first boot).
- **Docs** (this commit): §6 gains the `/photos/[id]` row + the settings
  correction; §7 rewritten around the search doctrine (portal vs API side) +
  toggles-with-state + photo-results-one-destination (the context-magic idea
  died when the detail page was born — a click always means "show me this
  photo"); §11.1 end-session anatomy + the invisible-focus lesson; §11.4 the
  full photo-detail entry.

Semi-colons stayed out of the copy; they live only in the `mellon;` wordmark.
Gates per commit: prettier → lint(0) → check 0/0 → vitest (24 → 26) → build.
lumen mirrors pushed (`42ce0b5` search, `8624abe` photo verbs) on
`feature/admin-api-and-portal`; mellon remains HUMAN-GATE #1 paused (no
remote) — commits accumulate on local `main`.

### 2026-11-08 — palette mode grammar: sigils that route the question

Owner sketched the prefix design outright (`>` commands / `/` content / `#`
pages, plain text = everything) and it slotted into §7 doctrine like it was
always there — the palette keeps staying DUMB about content, the prefixes
just tell it WHERE to look. Five clarifying calls: chip = consuming prefix +
pill (plain `<input>`, IME-safe; contenteditable rejected), `>` includes
global actions and stateful TOGGLES, `#` owns destinations + open recent,
prefix requires the committing space (bare `>` stays literal).

- **`4914e51` feat(search-tags)**: `search(q)` grows to
  `{posts, photos, tags}` — and the mirror records the boundary tags live
  on: a NAME lookup over the vocabulary (Postgres), never Meilisearch
  relevance. Counts honor the published-corpus rule so a tag hint never
  disagrees with the tags list. Selecting a tag enters `/posts?tag=` —
  filter axis, not page; the URL already rode the API filter, zero new
  plumbing. (Gate caught the empty-query early-return missing the new
  group — the contract test pinned it immediately.)
- **`9184cea` feat(palette)**: the mode machine in PURE logic
  (`palette-mode.ts`: arm/disarm/group-routing/API-gating, 7 node tests —
  vitest 26 → 33). Prefix + space at position 0 consumes both characters
  into a pill; mode is explicit STATE, never re-parsed from text, which is
  what keeps IME and caret semantics boring on a plain input. Empty
  Backspace disarms; pasted `/ alpine ridge` commits in one keystroke.
  `/ ` never renders navigation, `# ` never asks the API — the door gating
  is the doctrine made executable. Tag rows: hint shows published counts.
  Group chips hide in forced modes (the pill says what rows ARE); the idle
  legend footer documents the grammar so it's learned by sight, not folklore.
- **Docs** (this commit): §7 search doctrine amended to THREE content
  groups + the full mode grammar bullet; §11.4 gains the palette anatomy
  (pill, hint-column state, legend, chip-hiding rule).

Live-verified: `/api/search?q=latency` → tag 'latency · 0 posts' — the
eager vocabulary shows UNUSED names, exactly as the vocabulary doctrine
promises (a tag exists from creation, used or not).

### 2026-11-08 — palette pills, submenus, and the INSERT task

Owner opened with a screenshot (the pill's text sigil sat visibly off-center)
and a behavior sketch (Import image should become upload-THEN-apply, with a
nested choice). Both landed as grammar, not one-offs.

- **`740dc87` fix(palette)**: pills + legend render Lucide SVGs, never text
  glyphs — mono font stacks lack ❯/⌕, browser fallback drifted the baseline.
  Flex-centered icons can't misalign; `leading-none` as insurance; pure
  `palette-mode.ts` sheds its glyph table (node module stays icon-free).
  Gate lesson restated: `tail -1` on svelte-check HID a warning while the
  commit chain ran — amended; 0/0 means BOTH numbers.
- **`acfa266` feat(palette-submenu)**: `Command` grows declarative shape —
  `children?` (Enter drills in, palette never closes, `← parent` back row,
  typing filters children) and `arm?` (Enter arms a mode instead of
  running). `insert` joins the mode table as the odd one out: NO SIGIL —
  tasks are destinations, sigils stay the user's vocabulary; its rows are
  API photos running the page-published handle. Esc unwinds ONE layer per
  press (insert→submenu→palette, `escapeAction` pure + tested); typed modes
  keep closing straight through — pre-submenu semantics honored.
  `page-commands` gains `setPhotoInsert` under the same lifecycle contract:
  unmounting an editor cannot leave a stale insertion door.
- **`b66836b` feat(editor-import)**: the doctrine split the owner named —
  global `Import image` = library upload only; editor `Import image into
post` = a task with two doors: `Upload new image…` (picker in upload mode,
  `onUploaded` wired straight to insertAtCursor — upload THEN apply, dialog
  stays open for multi-upload, library rows mid-flow insert instead of
  silently closing) and `Search library` (INSERT mode, no dialog). The
  mouse doors (toolbar/rail keys) keep the full picker — palette paths
  ADD, never replace.
- **Docs** (this commit): §7 gains the submenu/INSERT doctrine (including
  the one honest exception to "photo rows always navigate": declared intent
  vs inferred context), §11.4 the pill/submenu anatomy.

vitest 33 → 35 (insert routing, Esc-stack precedence), gates 0/0 per commit.

### 2026-11-08 — pill icon Refined: the lowercase tag was never a component

Owner's screenshots pinned it: the pill showed an EMPTY GAP before
`COMMANDS`. Root cause is the compiler's naming rule — `<modeIcon>`
(lowercase) is an HTML ELEMENT, not a component: Svelte emitted an empty
custom element inside the pill, occupying the flex gap with zero glyph.
The bug shipped wearing a warning: svelte-check's "self-closing HTML tags
for non-void elements are ambiguous" was the bug report itself, and I read
it as a style nit, "fixed" the self-close syntax, and kept the element
alive. Headless captures then measured the PILL (it rendered!) but never
the GLYPH (it didn't) — verified the wrong pixel.

`740dc87`+`fix` chain lesson, restated where it bites hardest:

- a checker calling your tag an HTML element means it IS an HTML element —
  dynamic components need UPPERCASE bindings (`const ModeIcon = $derived(...)`);
- when verifying a render, assert the smallest thing that can break — the
  DOM dump / bounding box of the icon, not the row containing it.

### 2026-11-08 — control center round 1: the post rail joins the palette

Owner's doctrine, stated at last: _the command palette is the control center
of the entire portal._ The approved plan — edit buffers, live submenus,
picker tasks, date grammar — landed as three commits; the parity rule is now
law (§7): everything a page lets you change, ⌘K can change while that page
is mounted. Exemptions ruled, not drifted: confirmation theater (delete
always opens its dialog), spatial state (bulk selection stays in the grid),
secrets values (masked + CAS want a form — palette navigates, never edits).

- **`6664cf7` feat(palette-edit)**: the primitives. EDIT mode — a command
  with `edit+seed+commit` turns the query into a SEEDED buffer (you edit,
  never replace); Enter commits through the closure and STAYS OPEN
  (chaining title→subtitle→date is the keyboard-first point — ruling);
  `commit` returning false rejects — an invalid date can't eat a keystroke.
  Submenus went LIVE: hold the parent's id, re-read children from the
  reactive tree — snapshotted ✓-marks would lie after a toggle;
  `keepOpen` rows stay put (selection stays on the flipped row — your eyes
  are already there); `createChild` synthesizes `+ create "xyz"` from the
  filter text — eager vocabulary, palette edition. Picker tasks: one
  engine, many destinations (`insert` cursor markdown vs `cover` thumbnail,
  page-published per-task handlers). `date-expr.ts`: today/-3d/nov 12/next
  monday/this week, ranges `a..b` + window words parsed from day one for
  the filter pages, month-end clamp, nov-31-is-a-typo rejection; arrows
  step the buffer (←→ ±1d, ↑↓ ±1w). vitest 35 → 44.
- **`e8c34ff` feat(editor-palette-fields)**: the rail, ⌘K-complete — Set
  title/subtitle/date, Set slug (pre-creation only; commit freezes
  auto-derivation like typing it does), Edit tags (✓-live submenu +
  create), Cover image (upload-then-SET singular / search library with the
  COVER pill), Download markdown · Save as PDF · Copy markdown. Every
  commit closes over the rail's OWN setter — the parity rule made safe:
  no second implementation to rot.
- **Verification earned its keep** (control-verify.js, 20/20 headless):
  pixel-level runs found TWO real bugs grep-and-hope would miss — task
  modes inheriting the submenu's skip-back-row selection (Enter hit a
  phantom row; cover silently did nothing), and created tags invisible
  until reload (fixed with the Combobox's local-vocab ride). Also caught:
  tests against the in-memory mock are NOT idempotent across runs — the
  corpus survives (that's the point of it); fresh server per suite.
  One lesson re-learned while writing tests: trust the tool, not the
  fixture arithmetic — the failing shiftDate assertion was the TEST's
  wrong expectation (Nov 8 + 1w + 1d = the 16th), the parser was right.
- **Docs** (this commit): §7 grows the task-mode doctrine (edit/insert,
  live submenus, date grammar) and the control-center parity rule with its
  three exemptions; §11.4 the buffer/selection anatomy and the rail-parity
  note. Next surfaces by the owner's map: photo-detail form, posts/photos
  list filters (where the range grammar finally gets its consumer).

### 2026-11-08 — control center round 2: photo detail joins, the kit is born

The factory extraction happened exactly where the plan said it would — at the
SECOND consumer. Photo-detail needed the same three shapes the editor proved
(alt buffer, collection submenu, gallery toggle), so `command-kit.ts` came
out of that duplication rather than ahead of it: `editField`, `stateToggle`,
`vocabSubmenu` (+5 node tests, 49). The editor and the layout's theme/vim
toggles were refactored onto the kit in the same commit — a toggle is now a
toggle on every surface, and the parity rungs share one behavior spec.

- **`010e177` feat(photo-palette)**: the metadata pane is ⌘K-complete —
  `Set alt text` (seeded EDIT buffer), `Set collection` (single-home submenu:
  rows SET instead of toggling, `uncategorized` clears, `+ create` rides the
  local vocab AND picks itself), `Toggle gallery` (live in-gallery/hidden
  hint; keepOpen made OPT-IN on stateToggle for precisely this chain — form
  toggles stay open so you can flip→verify→save; plain toggles still close),
  `Copy link`, plus the surviving save/download/delete trio. The decisive
  doctrine, proven by test: the palette reaches the FORM, never around it —
  a full editing session across alt/collection/gallery left the SERVER copy
  untouched; the Save button armed dirty like typing would, and persistence
  stayed the explicit ⌘S.
- Also fixed on the way: submenu hints now pluralize honestly ('1 photo') —
  both pages had the `1 posts` artifact; the headless runs caught it.
- Verification discipline, re-learned loudly: running the editor suite twice
  against ONE mock server fails the second time — the in-memory corpus IS
  the database; created vocabulary (distr/portrait) persists across suites.
  One fresh server process per verifying run, ever. (photo 14/14, editor
  20/20, each on its own corpus.)

Next surface (round 3): the posts/photos list filters — where the range
grammar (`nov 1..nov 12`, `last week`) finally gets its consumer.

### 2026-11-08 — control center round 3: the filter pages, chained

The parity map closed: posts and photos lists now answer to ⌘K exactly like
their sidebars — `Filter by status`, `Filter by tags`, `Filter gallery`,
`Filter collections`, `Set date range` (the grammar's planned consumer at
last), `Sort by`, `Toggle view` (photos), `Clear filters` present only while
something is on and vanishing when it isn't. Every command closes over the
page's own `buildUrl` — the URL is the one query-string truth — so a palette
pick and a chip click write the identical state by construction.

- **`6aeffa9` feat(filter-palette)**: `editField` gained `range:true` (filter
  fields take windows, content fields still reject them); the ✎ dates buffer
  parses live in the hint (`2026-11-01 .. 2026-11-12 — ⏎ saves`), slides
  WHOLE windows with the arrows (`last week` + → moves both endpoints), and
  re-serializes canonically on commit. keepOpen's grand showcase: one ⌘K
  session walked /posts → ?status=draft → &tag=queues → &from=..&to=.. →
  &sort=title&dir=asc, ✓ marks staying live between navigations, then Clear
  filters back to zero — 19/19 in the new filter-verify suite (editor 20/20,
  photo 14/14 re-run; one fresh mock server per suite — the corpus
  persistence is the DATABASE behaving correctly, tests just respect it).
- **The round's real catch — focus theft**: a keepOpen pick navigates under
  the still-open palette, and SvelteKit moves focus to the NEW page; every
  subsequent keypress (Escape included) hit nothing. The step-debug dump
  made it visible: aria said 'all', rows said submenu, keys said nothing.
  Fix: while mounted, the palette reclaims its input on every URL change
  (tick-guarded). Doctrine sharpened for §7: a control center must OWN its
  focus or it is decoration.
- Test-suite honesty: two of the mid-round "failures" were the SUITE's
  choreography (double-Escape leaving the list, stale expectations against
  pluralization fixes) — the dumps told the truth; the app got fixed only
  where the dumps proved it broken.

Next: none on the parity map — settings/secrets/dashboard are exempt-by-
ruling or already twin-complete. The control center is the control center.

### 2026-11-08 — the create-door bug the owner's screenshots caught (fix)

Owner typed `test-collection` (and `asd`) into the palette create doors and
the rail came back littered with PREFIXES: te, test, test-c, test-co… / a,
as, asd. Diagnosis from the pattern itself — every junk name is a keystroke
boundary — the kit's create door returned `{ name, ride: client.createX(name) }`
and **the promise fired at ROW-BUILD time**. The palette legitimately
rebuilds the `+ create` row on every keystroke (that's how it shows the
partial name) — so each keystroke POSTed a creation. Enter was never the
trigger; rendering was.

- **Contract fixed**: `create` now returns `{ name, start: () => Promise }` —
  the creation is LAZY, fired only when the row runs (Enter). The kit doc
  names it load-bearing, and the unit test pins it structurally: build the
  create row through four partial words, assert `starts === 0`; then `run()`,
  assert `starts === 1` ("BUILD NEVER CREATES").
- **Headless repro of the exact user action**: 15 keystrokes typing
  `test-collection` → inventory unchanged (2→2); Enter → exactly one new
  collection, no prefixes, picked as drafted. Same for the editor tag door
  (`zeta-two`: 5→5 during typing, +1 on Enter). 7/7.
- Both doors shipped in round 2/3 code; nothing else used the eager shape
  (grep-verified). The user's polluted vocabularies are in-MEMORY mock state —
  restarting the dev/build server clears the prefix litter.

Lesson for the kit: any callback the palette evaluates during RENDER must be
a decision, never an effect. Rendering the word "create" must not create.

### 2026-11-08 — API sync + JWT sessions + the console amendment: Phase B/C executions revised

Owner opened an audit ("sync the API we need with the lumen design doc — nothing
missing") that surfaced five findings, and made three decisions on the way
through: **JWT sessions (option B: token-version)**, **12h TTL, no refresh
tokens**, **credentials later as argon2id+salt in the DB** — and one that
re-draws the map: **the portal goes public at `console.gofar.id`**.

- **The audit found** (crosswalk of all 24 AdminApi verbs vs lumen §8/§9):
  `GET /admin/posts/:slug` had NO verb line (the editor could not open a draft
  from §8 alone); the bao passthrough was one vague `POST /admin/bao/…` while
  §9 defines four GET/PUT operations; `login` shapes disagreed (`expires_in`
  promised, never consumed — the cookie hardcoded 12h while the settings page
  _claimed lumen decided_); logout was cookie-deletion theater — no verb, no
  revocation, a stolen bearer outliving its own logout by 12h; and `q` in
  `PostListOpts` was dead surface (the palette's pre-`search()` hack, zero
  call sites).
- **lumen mirror** (`7f5bd59`): §8 gets the JWT design in full — HS256 pinned
  (no alg negotiation; None/RS-confusion fail at library-config, not at
  review), claims `{sub,iat,exp,tv,jti}`, verification = signature AND the
  indexed `users.token_version` read, `DELETE /admin/session` bumping tv =
  REAL revocation, `SESSION_JWT_SECRET` from Bao alone, login throttle as a
  §8 rule (single user + public URL = stuffing is _the_ attack), the missing
  post verb, the four bao operations enumerated, `expires_in` named as the
  cookie driver. §6 gains `users(passhash argon2id, token_version)` — the
  env-credential era formally superseded.
- **mellon contract** (`a1aa70a`): `login → {token, expiresIn}` (mock honest
  stand-in, no fake crypto), `logout()` — the /logout action revokes server
  side FIRST, clears the cookie regardless; cookie Max-Age from the server's
  number (verified live: `Max-Age=43200`); `q` retired everywhere; tests 50.
- **Doctrine amendments, written where they live** (the file's own ritual —
  mellon §2 rule 3 prescribed "a written decision, never a quiet convenience"
  for exactly this day): mellon §8 posture (GATE #10 checklist, honest CSP
  deferral — inline-style hues are a design decision, a header that lies
  about protection is worse); root INFRA (access matrix row, §3A record,
  Phase 2 no-new-listener note, Phase 3 runnable console middlewares, Phase
  10 IngressRoute + seeds + inverted acceptance, commit `aa196a1`); root
  AGENTS rule 2 rewritten; earendil's stale workspace line fixed on branch
  `docs/console-amendment-sync` (`b446610`, pushed — owner merge per ritual).
- **Phase B/C revisions (this commit's checklist edits, the requested
  "update the phase executions")**: §1 invariant struck-to-amended; ledger
  gains **#10 console go-public gate**; M3's session task rewritten to the
  JWT design + the search/photo-detail/verb tasks + revocation-PROOF verify
  lines (replay-after-logout 401, alg-confusion rejection, 429 audit); M5/M6
  reconciled against the enumerated §8 surface (M6's four bao ops confirmed
  already exactly right, seed task rewritten: JWT key to lumen alone, mellon
  env shrinks to API_BASE, users-row CLI seed); M7's "NO Ingress resource"
  struck to IngressRoute + middlewares + break-glass port-forward + its
  acceptance inverted; M8's remaining-CSP item recorded with its reason.
  The Phase B/C prose in the old journal entry stays (append-only); THIS
  entry is its revision note.
- What survives every amendment unamended: **never a public API** — the
  probe `curl <external> :9090/:7700/:8200/:6443` = unreachable is still the
  line in the acceptance, and the relay remains the only byte-path from UI
  to lumen.

### 2026-11-08 — PHASE B OPENS: lumen M1 read-api is live code, accepted the doctrine's way

Owner said continue; HUMAN-GATE #2 answered on the spot — **chi** (and a second
ruling arrived mid-build: **viper** for config, env-precedence, no dotenv).
With #2 resolved, Phase B began: lumen scaffolded, and M1 (read API) shipped
in one session.

- **`b2aa886` [lumen] feat(read-api)** (branch `milestone/1-read-api`, pushed):
  §6 schema as plain-SQL migrations (embedded, `_migrations` ledger) — with
  two columns the contract itself forced: `post_tags.position` (tag ORDER is
  payload — the alphabet-ordered aggregation drifted from the mock on the
  very first live diff) and `tags.cloud` (the cloud is a CURATED subset —
  10 of the corpus's 26 names; counts exist, membership is decided).
  The `users(passhash argon2id, token_version)` row landed with the session
  design's schema, empty until M3. The fixture twin is GENERATED from
  earendil's mock (a throwaway vitest dump), never hand-transcribed, and
  seeds a draft as permanent leak-bait.
- **The acceptance ran**: `earendil: milestone/1-contract-harness` (`6c593d3`,
  pushed) adds `contract.spec.ts` — 13 env-gated tests driving the REAL
  `createApi(LUMEN_URL)` client against live lumen-on-Postgres, diffing every
  endpoint against `mockApi`. **13/13 green**, including the defaults-parity
  traps (absent list limit = whole corpus; search default 10) and the draft-
  leak assertions through the production client path. Offline CI untouched:
  no LUMEN_URL ⇒ clean skip (verified: earendil gates report 47 passed | 13
  skipped). The Go side mirrors the same suite twice — in-memory twin
  (offline) and real Postgres (LUMEN_INTEGRATION=1) — 24 cases each.
- **Rulings written where they live** (`lumen/AGENTS.md`): prepared statements
  ALWAYS — `store.NewPool` asserts `QueryExecModeCacheStatement` explicitly
  (the one honest exception: multi-statement DDL migrations, trusted files,
  zero user data, documented as the exception it is); handlers one FILE PER
  RESOURCE (owner caught the accreting http.go mid-build — split to
  router/respond/posts/search/photos/tags); viper precedence env >
  `LUMEN_CONFIG`/`./env.yaml` > defaults, and chi's deprecated `RealIP`
  replaced with `ClientIPFromXFFTrustedProxies(1)` — which STATEs the trust
  topology instead of blindly rewriting RemoteAddr (nothing reads it until
  M3's throttle; the assumption is commented for that day).
- **Config caught live what tests missed**: `SetEnvPrefix("LUMEN")` quietly
  renamed `PORT` to `LUMEN_PORT` — the first real smoke listened on the
  wrong port. Fixed with explicit multi-name `BindEnv("port", "LUMEN_PORT",
"PORT")` + a regression test. Journal law, again: run the binary; offline-
  green is not live-correct.
- **Verify honesty (3 items, 2 done):** go tests ✓ (offline + integration),
  live contract spec ✓ — the third (render the site against `API_BASE=lumen`
  and diff two pages by eye) is DEFERRED to Phase C's cutover: the payload-
  level twin already proves identity, and pointing earendil at lumen is
  literally M7/M8's switch. Not forgotten, not claimed.
- Dev loop today: `make up && make seed && make run` (:8080), `make contract`
  runs the whole acceptance against the live server.

Next in Phase B: **M3 admin-api** — JWT sessions (HS256 pinned, tv-revocation,
argon2id users row finally gets its code), posts CRUD + the §2 publish
transaction, Meilisearch (swapping the Go-scored interim), the four bao
operations. GATE #9 (media provider) still gates M5-B.

### 2026-11-08/09 — PHASE B executed: M1 + M2.5 + M3 + M5 + M6 on lumen, in one delegated run

Owner: _"directly continue on all milestone of Phase B. I will review later"_ — batch
authorization taken at face value: **no gate was bypassed** (#3 merges, #5 threat-note
ack, #9 provider all remain owner-side; this run PREPARED #5's note, did not resolve it).

- **M2.5 — serving model** (`3284e24`/`8617b85`/`970e42a`, branch `milestone/1-read-api`):
  Meilisearch v1.56.1 answers EVERY list and search (rank/day/readTime as sortable
  attributes → determinism survives the engine; relevance is engine-owned — contract
  assertions split strict-twin vs rules at both tiers, offline twin keeps byte-parity);
  Postgres hydrates and RE-CHECKS truth (lagging index can shorten a page, never leak
  a draft); pure-engine posture (503 when down — no fallback to rot); river v0.51.1
  queue (Postgres tables — the §2 publish enqueue is transactional by construction,
  ids-only jobs converge, uniqueness coalesces bursts); seed drains the REAL pipeline.
  Caught: the harness must not touch siblings' rows (suite-isolation), and the read
  integration found `Photos` hydration silently mapping everything to key 0 — no id
  selected. Run the binary.
- **M3 — admin-api** (`4786b08`): JWT sessions exactly as ruled (pinned HS256 — the
  test FORGES an alg:none token with perfect claims and Parse refuses; `tv` row check
  — logout→replay-the-same-token→401 proven over the wire); argon2id credentials +
  `cmd/userctl` (password via env, never argv); indistinguishable auth failures;
  throttle per-IP+per-account with Retry-After (12-guess battery answered 429);
  publish = the §2 transaction (derivations, first-paragraph preview, rank assign,
  content_hash idempotence — re-publish unmoved rank verified; the guard was widened
  after finding published→changed-content republish was wrongly 409ed); CAS with
  RowsAffected verification (TOCTOU closes); soft delete + PARTIAL slug unique —
  a DESIGN bug the suite's own residue exposed (deleting must free the slug); the
  admin search door sees drafts (the leak-bait draft surfacing there and nowhere
  public is now a tested FEATURE).
- **M5 — media** (`7ab4d8a`): multipart → decode-and-REBUILD (EXIF dies by
  construction; a spliced APP1/Exif fixture proves the absence) → content-addressed
  S3 key (`media/<sha>/<sha>.<ext>` — immutable cache-control is now honest) → row +
  GC ledger + index job in one tx; fresh photos gallery=false by doctrine; formats
  pinned jpeg|png, loud 415. The registry rug-pull documented: MinIO's public images
  are gone, LocalStack v4+ wants an auth token — dev endpoint is gofakes3 (embedded
  in the battery, `cmd/devs3` manual), so **gate #9 stays a values decision** — the
  code never learned a vendor.
- **M6 — secrets plane** (`c8d5bb0`): the §9 relay is exactly four routes (no sys/
  by construction); AppRole env-rendered, lazy re-login (dev TTL 5m exercises it);
  version pin via ReadWithData (splicing `?version=` into an SDK path is a 404);
  write version parsed from the TOP level (a metadata-only parse 500s AFTER
  persisting — the worst shape, caught live); stale cas → 409; **redaction is now
  tested, not promised** (capturing slog across reads/writes, demanding the marked
  value never appears while op lines do); dev plane = vault:1.19 stand-in (OpenBao
  registry unreachable from this box — wire API shared lineage; the test bootstraps
  the exact §5.6 shape: kv-v2 mount, policy over kv/* ONLY, approle, no sys).
  Plus `cmd/driftcheck` (§5.5 consumer two — key names/counts only, never values;
  aligned 0 / drift 1 both proven) and the distroless Dockerfile (runs nonroot,
  fail-fasts its config contract; CI wiring itself remains INFRA Phase 8, stated
  not skipped).
- **The milestone's ugliest bug was in OUR git**: `.gitignore`'s artifact lines read
  `lumen`/`seed` UNANCHORED — and unanchored patterns match ANY depth, so
  `cmd/lumen/` and `cmd/seed/`, the service's MAIN packages, were silently excluded
  from every `git add -A` all milestone. Builds/tests/containers passed — from the
  dirty working tree; a fresh clone would not compile. `git ls-tree -r` caught it
  during branch audit. Fix `638345f` (anchored, force-added, story commented).
  **Doctrine: a branch is what `git ls-tree` says it is — gates prove the working
  tree, only the tree proves the branch.**
- **HUMAN-GATE #5 — THREAT NOTE: expanded into a standalone document
  (`mellon/THREAT-NOTE.md`, 2026-11-09 — assets ranked, placement table, six
  vectors with code/test evidence pointers, residual risks R1-R5, finalization
  steps). Provisionally ack'd by the owner's merge instruction; FINAL read
  through that document gates prod seeding + GATE #10.** Original condensed
  note follows for the record:** (1) _token placement_ — Bao role/secret ids: lumen pod env
  only (ESO-rendered from `bao-approle-credentials`), TTL 5m dev/≤1h prod, re-login
  agent-side; session JWT: never stored by mellon (HttpOnly cookie is a carrier),
  signing key in `lumen/{env}`; the portal UI holds NOTHING. (2) _what a stolen mellon
  session CAN do_ — everything an admin can, including reading secret VALUES through
  the relay (server-side masking is UI-only by design — an authenticated bearer is an
  admin); window bounded by 12h TTL, tv-revocation makes it instant on detection.
  (3) _what it CANNOT_ — reach Bao directly (AppRole bound to cluster CIDRs; lumen is
  the only door), write git, or survive logout. (4) _exposure surface_ — the console
  is the ONLY public door to any of this (gofar.id content plane holds no credentials);
  ingress TLS + HSTS + throttle + argon2id are the layers. (5) _residual risks_ —
  in-memory throttle is per-replica (2× tolerance budget at ×2 replicas — documented
  tradeoff); dev stand-ins (vault/gofakes3) never meet prod values. **Owner action:
  review, then merge decisions follow.**
- Branches (all pushed, merge = GATE #3): lumen `milestone/1-read-api` (M1→M6, nine
  commits — deliberately stacked; splitting per-milestone PRs after the fact is the
  owner's call), `feature/admin-api-and-portal` (docs lineage, `0a7cdb5`); earendil
  `milestone/1-contract-harness` (`8e11c10`). Root pins NOT bumped — pins track `main`,
  nothing is merged yet.
- Battery (final state): `go test ./...` offline green; `make test-integration` = twin
  - real pg/meili + embedded S3 + dev vault + 401-replay + throttle, run 2× idempotent;
    earendil contract.spec 13/13 against the live binary; mellon gates untouched and green.

**Refined 2026-11-09 — the M6 dev plane is OpenBao, not Vault (`938ce69`).** The owner
asked why an OpenBao-documented tree dev-tested against `hashicorp/vault:1.19`. Honest
answer: `docker.openbao.xyz` failed DNS from this box at build time and **one
unreachable registry was treated as a decision instead of a data point** — ghcr.io
serves pinned `openbao/openbao:2.5.3` fine. Swapped; re-proven with zero doctrine
edits: `TestBaoRelay` passes as-is against OpenBao (the `hashicorp/vault/api` Go
client IS its documented compatibility path; the bootstrap's error-string matches,
AppRole/mount/policy, CAS 409s, version pins and the slog-capture redaction proof
all held), and `driftcheck` re-smoked both exits — mid-run it correctly flagged our
own mis-seeded key pair, a third behavior proven by accident. Dev plane == prod
plane now by FACT. Lesson for the habit shelf, next to `git ls-tree`: **verify every
registry before substituting; a substitution recorded honestly is still a
substitution worth questioning.**

**2026-11-09 — dev-ergonomics round: `make dev`, a Postman collection, and two live
contract bugs (`2d190a4`+`a4ee264`, lumen `milestone/1-read-api`).** The owner asked to
test the APIs directly; building the collection against the live binary found, in one
sitting, what three green suites had missed all milestone: (1) lumen's login answered
`expires_in` while mellon's `AdminApi` — the executable spec — consumes `expiresIn`
(the Go integration test couldn't catch it: its struct tag was written from the
HANDLER, not the spec); (2) media config was bound in viper but never POPULATED into
`Config.Media`, so the real binary 503'd every upload while the integration harness —
wiring `media.Config` by hand — stayed green. Both fixed; regression tests pin both
shapes. Doctrine added to the journal's habit shelf: **run the binary THROUGH the
client's contract** — every consumer-side type is a wire assertion waiting to be
walked. The collection itself (59 requests, 6 folders: §1 facets, the §8 lifecycle
with CAS/idempotence/soft-delete-frees-slug proofs, upload relay, the logout→replay→401
revocation walk, §9 Bao CAS) carries `x-lumen-*` expectation extensions consumed by a
throwaway harness — shipped only after a 59/59 walk executed twice consecutively
(rerunnable by design; the only deliberate non-cleanliness is eager vocabulary rows,
201-or-409, which proves the doctrine). `make dev` is now the one-command loop (infra →
seed → dev user → serve :8080), `make dev-plane` bootstraps this box's OpenBao into the
§5.6 shape so §9 is testable directly, and the README finally matches reality — its
M1-era quickstart had been dead since M3 (the Makefile never exported the signing
secret the config fail-fasts on). lumen gates green throughout; no mellon code changed
(it consumed neither bug — mellon→lumen cutover is still Phase C).

**2026-11-09 — Postman restructured as an ENDPOINT CATALOG (`920ecac`).** Owner call: the
scenario-per-request shape was an unreadable API reference. Now 32 endpoints / 10 folders;
the 81 executed cases became 78 EXAMPLES carrying their own originalRequest + the REAL
response captured live off the dev binary (ids/timestamps = dev artifacts, JWTs truncated;
4 marked `x-lumen-state: historical` — e.g. the revoked-token replay, frozen by nature).
Docs on every endpoint: auth, param semantics, each status code's WHY, doctrine lines.
New `postman/environments/{dev,staging,production}` — staging/prod ship localhost baseUrl
**by doctrine** (no public API ever; reach = port-forward) with EMPTY passwords and the
type-don't-save rule; runtime chaining stays in collection variables. Validation kept its
rank: 41 read-only examples + 19 defaults replayed against the live server, zero status
mismatches, before commit. The stateful lifecycle moved to its proper home — the Go
battery IS the walkthrough; the collection is the reference.

### 2026-11-09 — PHASE C (scoped): both portals cut over to the real lumen

Owner: _"execute PHASE C, only the earendil + mellon cutover… hold the vortex,
etc later."_ Branches: earendil `feature/lumen-cutover` (`33bcaec`, pushed),
mellon `feature/lumen-cutover` (pushed with this entry). Merges remain #3.

- **earendil: zero request-path code.** The mock-first seam was built for this
  day — `API_BASE` (server loads, direct) + `PUBLIC_API_BASE=/` (browser rides
  the same-origin proxy). One `dev:lumen` script + docs. Proved it's the REAL
  backend, not a twin trick: the proxy 503s without API_BASE, a dead API_BASE
  makes SSR pages 500 (the feed is now genuinely lumen-dependent), engine-
  ranked search hits, leak-bait unlinked (0), plain `npm run dev` still 200
  on the twin. Contract harness: 13/13 vs :8080 throughout.
- **mellon: the fetch adapter the placeholder promised.** `src/lib/api/
fetch-adapter.ts` implements all of AdminApi against §8/§9 (multipart upload
  converts the browser's dataUrl; lumen's DECODE owns dims; CAS/409/conflict
  statuses surface verbatim — "the relay forwards, never decides"). `createApi
(bearer)` threads the session cookie at 10 call sites (loads/actions/relay);
  login stays bearer-free. Mock mode untouched — unset API_BASE is still the
  twin.
- **The wire taught two lessons before merge, exactly as designed:**
  ① **412→409** — the mock era had invented 412 for CAS conflicts; lumen ships
  409 on BOTH CAS surfaces (rev + secret). Aligned mock, UI branches, tests,
  and the types comment to the shipped wire (mirror ritual: mellon moved —
  lumen's 409 was already merged, tested, and Postman-published).
  ② **session expiry had no real-mode story** — the layout only checked cookie
  PRESENCE (mock-era laziness). Now: `search('')` (the cheapest authenticated
  call — short-circuits before the engine) asks lumen whether the bearer lives;
  401 → clear cookie → `/login?expired=1`; 503 → honest error, NEVER a fake
  logout (an outage must not kill good sessions — mellon cannot verify, only
  lumen can; asking IS forwarding).
- **Live proof (running :5100 build against :8080 lumen + OpenBao + devs3):**
  login 200 with real JWT cookie; desk lists DRAFTS (lumen data, camelCase,
  rev); palette door finds `drafts-are-fantasies` through the relay; secrets
  paths list `lumen/{dev,staging,production}` from the real plane; stale-rev
  PUT → `{"error":"stale rev — someone saved first"} [409]` passthrough;
  publish 200 (with Origin — Kit's CSRF check on body-less POST bit the probe,
  not the product); upload via dataUrl → `…/media/4e/4e54….png` content-
  addressed src, `gallery:false`, filename-derived alt; cleanup deletes 200;
  logout 303 → stale-token replay → 303 `/login?next=%2F&expired=1`.
- **Gates:** mellon lint 0 / check 0-0 / test:unit 50 passed + 6 live-gated
  (they pass 6/6 with LUMEN_URL set) / build ✓. earendil lint / check 0-0 /
  47 unit / build ✓. QA-tool lesson journaled: `grep -c` exits 1 on zero
  matches — a `&&` chain after a should-be-empty assertion breaks when the
  assertion PASSES.

**Cutover vindication (same round):** the mellon e2e's soft-deleted probe post
exposed a real lumen bug the mock era structurally could not see — `PostDocByID`
ignored `deleted_at`, so the indexing worker RE-INDEXED soft-deleted published
rows: items stayed honest (truth re-checking hydration, as designed) but the
engine's TOTAL carried a ghost (13 vs truth's 12 — the contract suite caught the
arithmetic). Fixed on lumen `fix/softdel-index-convergence` (`e74e993`, pushed)
with a regression subtest pinning `total == len(items)` after publish→delete→drain,
plus an ops purge of the two existing ghost docs (a WHERE-clause fix cannot
re-enqueue jobs for rows nobody touches again — the engine had to be told).
Consumer harnesses re-verified against the fixed binary: contract 13/13, live 6/6,
Postman replays 60/60. This is the program's thesis in one paragraph: mock-mode
green proves the LOGIC; only the live wire proves the SYSTEM.

## PENDING TASKS — session handoff (2026-11-09, owner stepped away)

**Owner side (gates — nothing here may be self-resolved):**

1. **GATE #3 merges** (all branches pushed, every gate green on each tip):
   - lumen `fix/softdel-index-convergence` (`e74e993`) → merge to `main`
   - earendil `milestone/1-contract-harness` (`8e11c10`) and
     `feature/lumen-cutover` (`c6cbb25`) — merge the harness FIRST: the new
     `make contract` target needs `src/lib/api/contract.spec.ts` on the tree
   - mellon `feature/lumen-cutover` (this commit)
2. **Root pins** — bump after each child merges (main-only rule).
3. **GATE #5** — final read of `mellon/THREAT-NOTE.md`; it gates prod seeding
   and GATE #10. Provisionally ack'd, NOT finalized.
4. **GATE #9** — media provider choice; then bucket/endpoint/CDN/keys become
   Bao `lumen/{env}` VALUES (code never learns the vendor).
5. **GATE #10** — console go-public checklist, run at launch (items listed in
   DESIGN §exposure + the threat note's finalization sequence).

**Phase C-infra (explicitly held by owner — the next execution slice):**

- vortex manifests: lumen/meilisearch/openbao Deployments (placement, budget
  line, ESO ExternalSecret CRs, unrouted 9090 + prometheus annotations,
  `overlays/production/lumen`)
- CI wiring (INFRA Phase 8): build → GHCR → `kustomize edit set image` hook
- §5.6 prod seed procedure — with the AppRole **CIDR-bound** (dev is not);
  `scripts/dev-plane.sh` is the shape reference
- k3d rehearsal (root README §5): placement, failover, selfHeal, proxy
- staging Application CRs when a staging target exists
- put contract.spec + api.live.test behind a CI job with a lumen service container

**Recorded-deferred (each has a written why):** D2/RSS routing decision;
webp encoder story; fenced-media GC rows; presigned-direct uploads; strict-CSP
hue refactor; content-revision audit trail (threat note R4).

**Dev-stack state at leave:** everything STOPPED (`docker compose down`; no
go/node processes). pg + meili volumes persist; **OpenBao dev storage is
in-memory — rerun `make dev-plane` before wanting /admin/bao back.** Resume
loop: `cd lumen && make dev` (+ `make devs3` for uploads) → `make lumen` in
earendil/mellon (PORT/LUMEN overridable; default 5173/5173 — pass PORTs).
Last full verification before stop: lumen battery 2× green, earendil contract
13/13, mellon live 6/6, Postman example replays 60/60 — all against the fixed
binary including the soft-delete convergence patch.

**Addendum 2026-11-09 — real-by-default (mock exits the runtime).** Owner
superseded the mock-first doctrine: `createApi()` now ALWAYS returns the
fetch adapter (unset `API_BASE` = dev fallback :8080, cluster env wins);
`index.ts` no longer imports `mock.ts`, and the relay's mock-era
`GET /api/media/<id>` byte-store route retired exactly as its comment
promised (src has been real URLs since the upload relay shipped). The twin
stays — as the test-only semantics reference `api.test.ts` already imported
directly: 50 offline tests still pass with zero backend, now with a runtime
that ships no fixtures at all. `make dev` folded the old two-target split
into one readyz-gated entry. Gates: lint / check 0-0 / 50+6-gated / build;
live: login → desk → secrets → dead /api/media 404 — all against the running
stack. Lumen's dev loop went idempotent the same session (23d650a: reuse
containers/server, seed never clobbers real data without FORCE=1).

**2026-11-09 — console behaviour round (owner-reported, all Playwright-proven).**
Three fixes + one system, committed as `39f6657`/`63f3c75` on `feature/lumen-cutover`:
① hover-preload storm — the fix proposed weeks ago finally LANDED, with a
committed harness (`scripts/console-harness.mjs`, `npm run test:console`) so it
cannot evaporate a third time; tap for data, hover for code. ② palette jumps
left the editor on the OLD post (SvelteKit reuses the route component; PostEditor
seeds state once — and `rev` could have carried across posts) — fixed with
`{#key slug}`; the pre-existing unsaved-changes guard is now genuinely exercised
(dismiss keeps / accept navigates). ③ long posts scrolled the whole app — the
shell is viewport-locked at every breakpoint now; scroll lives inside the editor,
preview and rails (T4: window at 0, cm-scroller at +1200, chrome pixels fixed).
④ Error states designed straight into code (owner: no mockup round): ErrorPanel

- both boundaries, status-mapped calm copy (401/404/409/backend/500), §11.3 hues
  honoured — red stays destructive-only, warnings get one amber dot; dev-only
  diagnostics; the 500-whose-message-says-unreachable honest-503 translation;
  in-chrome rendering keeps the palette one keystroke from escape. Harness 9/9;
  units 50 green; lint exit 0 verified directly after a pipe swallowed a prettier
  warning (own lesson logged: pipes eat gates — check the exit, not the tail).
