# mellon — Design Document

Part of the [`omicron`](https://github.com/kanatabi/omicron) superproject. `mellon` is the
**private admin portal**: the authoring UI for the blog and the operator console for
env/secret management. It is a UI — the only server it ever talks to is
[`lumen/`](../lumen/DESIGN.md), and the only thing it ever shows is what lumen's Admin API
(§8 there) decides to expose.

> _Speak, friend, and enter._ The name is the access doctrine — and the doctrine
> **amended** (owner decision, 2026-11-08, as §2-rule-3 prescribed: _"a written decision,
> never a quiet convenience"_): the door now has one sanctioned public address,
> `console.gofar.id`, reachable only with a session (JWT, revocable — §8) and gated on
> the pre-launch checklist (HUMAN-GATE #10). What the amendment does NOT touch: the
> backend stays behind the relay — **lumen/Meilisearch/Bao have no public address, ever**.
> "Speak, friend, and enter" still holds; the friend just arrived over TLS now.

Status: **design only** — implementation not started. Conventions (git discipline, gates,
branch-per-milestone, pinned versions) are inherited from `earendil`.

---

## 1. Product

**P0 — build now:**

- **Content management**: posts (raw-markdown editor + true-to-prod preview, drafts,
  publish), photos (upload → lumen), tags (BE-curated cloud, read + assign).
- **Basic env/secret management**: browse app/env secrets through lumen's Bao passthrough
  (read, edit with CAS, version history, diff, rollback-by-pin) — the surface §5.5 of
  `INFRA_ARCHITECTURE.md` already specifies.

**Deferred — deliberately:**

- Infra/GitOps tab (Argo status/sync, vortex commit-writer) — low priority; when it comes,
  it follows the GitOps-purity rule: write to _git_, never apply to the cluster (§2).
- Multi-user/RBAC (single operator today; lumen's session contract keeps the door open).
- Public or mesh ingress (§2 access).

## 2. Doctrine (non-negotiables)

1. **Never serves content traffic.** `earendil → lumen` is the blog's data path; mellon
   does not exist on it. Mellon going down cannot break the blog.
2. **The relay forwards; it never decides.** All logic, auth, credentials, and policy
   decisions live in lumen. Mellon holds **no secrets** — not Bao tokens, not GitHub
   tokens, not DB creds.
3. ~~**Private path only.** ClusterIP, no ingress (public _or_ mesh).~~ → **Amended
   2026-11-08 (this clause's own prescribed ritual):** the portal is public at
   `console.gofar.id` — TLS at the shared Traefik edge, console middlewares (HSTS,
   headers, rate-limit), JWT sessions with `token_version` revocation, login throttle,
   and HUMAN-GATE #10 as the launch checklist. The **service itself stays ClusterIP**
   (only Traefik routes to it); port-forward remains documented break-glass. Doctrine
   intact where it counts: the API plane keeps "no public ingress, ever", and relay-only
   remains the sole path from UI to lumen.
4. **Anything reachable by mouse is reachable by keyboard.** The palette + shortcuts are
   the vocabulary; this is the promise. No hover-only affordances (AGENTS §10.5 lesson,
   applied to the admin too).
5. **GitOps purity (future infra tab):** the portal may _propose_ (commit/PR to vortex) and
   _trigger convergence_ (Argo sync) — the cluster still takes orders only from Git.

## 3. Stack & house rules

Same kit as earendil, same discipline: SvelteKit (latest 3.x) + Svelte 5 runes + TS +
Tailwind v4 + `adapter-node`, Node 22, exact version pins (mermaid-style policy), Docker
multi-stage → GHCR, deploys as `sha-<short>` (immutable).

Gates: `prettier --write` → `npm run lint` (standalone exit code) → `npm run check` (0/0)
→ `npm run test:unit` → `npm run build`. Branch-per-milestone, PR-reviewed, never direct to
`main`. Vitest in node env (no jsdom) — pure logic tested, UI verified manually.

**Theme**: light/dark parity day one, no-flash pre-paint (`data-theme` cookie + inline
script — copy of the earendil recipe). Tokens are the _semantic_ contract
(`--background`, `--foreground`, `--border`, `--brand`, `--muted-*`) — values copied from
earendil's `layout.css`; admin-specific colors (status green/red, diff tints) are
**additive** mellon tokens, never divergent ones.

## 4. Architecture

```
browser ──► mellon SSR (UI + session cookie) ──/admin-api/*──► lumen Admin API
                                                              │ (server-side)
                                              lumen ──► OpenBao (AppRole, scoped)
                                                    ──► Postgres / Meilisearch / media
```

- **Session**: lumen mints it (single-user login → short-TTL token); mellon carries it in an
  httpOnly `SameSite=Strict; Secure` cookie and forwards. Mellon validates expiry
  reactively, knows nothing about _who_.
- **Relay**: `routes/admin-api/[...path]/+server.ts` — same-origin passthrough, earendil's
  `/api` pattern. No business logic lives here (doctrine 2).
- **Runtime env only**: `API_BASE` (lumen service URL) server-side; nothing build-inlined.

## 5. Post editor (the heart of P0)

The editor's chrome follows §11.4: split view, meta rail, two verbs.

- **Content model**: raw Markdown, ` ```mermaid ` fences and `:::` grids **intact** (Route
  B — the lumen contract). The editor edits the artifact that gets stored; no
  transformation layer, no WYSIWYG content model.
- **Editor**: CodeMirror 6 + `@codemirror/vim` (a _preference_, persisted; IME-aware
  toggle). Theme = `style-mod` map over the token set (JetBrains Mono, `--background`/
  `--foreground`, `--brand` markers; block caret in normal mode / bar in insert). Theme
  flip reconfigures via the `data-theme` observer — the mermaid re-render pattern.
  Pragmatic ladder: a well-typed `<textarea>` + preview may ship v0; the content model
  never changes either way.
- **Preview**: vendored copy of earendil's `render.ts` pipeline (anchors, grids, task
  lists, Shiki dual-theme, mermaid placeholder + shimmer). _The preview must look like
  the product_ — that's what makes this editor better than a generic CMS's. Sync strategy
  (drift risk): snapshot + periodic reconcile; revisit as a shared package when a third
  consumer appears.
- **Fields**: slug, title, subtitle, preview (explicit, default = first paragraph), date,
  readTime (BE-computed at publish — display only), tags (multi-assign from lumen's tag
  vocabulary), featured photo (thumbnail picker deferred with lumen's upload pipeline).
- **Publish button** = the §2-lumen unit of work: derivations + Postgres + Meilisearch
  upsert fire server-side; the UI shows state (`draft;` / `published;` / `unpublished;`
  pills). **State machine (owner decision 2026-11-08): three states — `draft →
published ⇄ unpublished`; a shipped post NEVER returns to draft.** Slug is fixed at
  creation (URLs never move; auto-derived from the title until authored by hand).

## 6. Pages (P0)

Every route lives inside the §11 shell (left nav + topbar + ⌘K); per-view anatomy in §11.4.

| route              | content                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`           | single-user session start                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/` (dashboard)    | recent posts (opens-recent lives here too), publish queue, quick actions                                                                                                                                                                                                                                                                                                                                                               |
| `/posts`           | list (status pills, roving-tabindex rows, `n` = new) + engine search bar                                                                                                                                                                                                                                                                                                                                                               |
| `/posts/[slug]`    | editor + preview (split or toggle), save/publish (`Ctrl+Enter`)                                                                                                                                                                                                                                                                                                                                                                        |
| `/photos`          | the darkroom — curation surface: tiles ⇄ table (md+), gallery keys, collection comboboxes, bulk bar, upload via the shared picker, engine search bar (date chips visibly pause while searching — PhotoDoc carries no day) (owner calls 2026-11-08/2026-11-10)                                                                                                                                                                          |
| `/photos/[id]`     | the image's own page — dark preview canvas + hideable metadata pane; explicit-save curation form (alt/collection/gallery), used-in references, download, delete-warned (owner call 2026-11-08)                                                                                                                                                                                                                                         |
| `/secrets`         | the **secrets control plane** (§6.1): app picker → env tabs, values masked by default (click/keyboard reveal), version history + diff + CAS save, pin-intent badge, restore-by-overlay                                                                                                                                                                                                                                                 |
| `/secrets/summary` | the **estate matrix** (C1): every app × env — head version, pin intent (amber when ≠ head), key counts with empty-key signals (○n = onboarded-unfilled), shape-drift marker; cells deep-link the cockpit. Counts only — values never leave Bao                                                                                                                                                                                         |
| `/tags`            | the **tag desk** — lean rows (checkbox · name · posts · featured pill), row click opens the **settings dialog** (rename → propagates via id-keyed FKs, feature toggle, used-by roster, timestamps, guarded delete naming the COUNT), engine typo search across the whole vocabulary, bulk feature for the multi-select, pager — all filters ride the URL; `?tag=` deep-links the dialog (palette tag rows + dashboard chips land here) |
| `/settings`        | appearance (theme segment), vim toggle, session                                                                                                                                                                                                                                                                                                                                                                                        |

### 6.1 Secrets control plane (PLAN-SECRETS-CONTROL.md, ratified D1-D5)

The portal is the **central control surface for the whole infra**, and the
secrets plane shows the pattern: **apps are DATA** - the picker, the onboarding
dialog, and every request are driven by namespace paths, never by code that
knows `lumen`. Onboard seeds the `dev/staging/production` trio (a default, not
a schema - add-env extends an app, seeded to the canonical key-set union). The
**key-set mirror is lumen's invariant**, enforced on the write path: the UI
edits ONE env; siblings receive the shape (adds land empty - values are
per-env), so the picker never shows drifted apps. **Pins are intent** (D1):
the header badge (`pinned vN . head vM`, amber on drift) records operator
decision; reads and consumers always see head - any version is viewable,
diff-able, and **restorable as a value overlay onto the current key set**
(D2 - removed keys do not resurrect). **Search is client-side, current-env
only** (D3) - key names AND values, via the pure fuzzy scorer; a server search
would push secret bytes through a surface that never needs them. No destroy
path exists in the UI by doctrine (D5): namespaces are born here, they are
retired by operators. History drawer is a modal covering the right edge -
the harness learned to dismiss it between steps.

**Compare versions** (`/secrets/compare?app&env&from&to`, owner round
2026-11-10): two versions of ONE path — never cross-env (values are per-env
secrets by doctrine; a side-by-side env diff is a leak pattern). Three
presentations — `table` (one row per key, added/removed/changed/same chips,
hide-unchanged, honest "N of M keys changed"), `split` (Gitlab-style aligned
panes: del/add runs paired index-for-index, null-padded so both sides keep
EQUAL row counts), `inline` (unified ± lines) — over two content forms:
`parsed` (sorted KEY=value lines) or `raw` JSON (visibly disabled in table
mode, which is parsed by nature). Masking is a property of WHAT IS DIFFED,
not what is painted: `displayValue` runs BEFORE serialization, so even raw
mode cannot leak on the default view; "show values" is display-only and
never persisted (masked is the safe direction of failure). The engine is
`secrets-diff.ts` — pure, offline-tested; presentation/content preferences
persist behind the primitive-flag guard. The nav carries it under OPS with
LONGEST-MATCH highlighting — nested hrefs light exactly one row.

## 7. Keyboard-first

- **Command palette**: ⌘K / Ctrl+K (aliases of one binding). Sections, ranked in order:
  `photos`, `posts`, `tags` (API content results), `actions` (new post, save, publish,
  toggles), `go to`, `open recent`. Mode prefixes re-route this list — see **Mode
  grammar** below. Shortcut-hint column. Built on a
  **command registry** (`commands.ts`: `{ id, title, shortcut?, run? }` plus the
  declarative shapes — `children`, `arm`, `edit`+`seed`+`commit`, `keepOpen`, `task`,
  `createChild`) — pages register,
  the palette renders (the rail kit's plug-and-play contract, applied to navigation).
  Context registration is real (`page-commands.svelte.ts`): a page publishes its verbs in
  an effect whose cleanup unregisters — the editor's save/publish/unpublish/delete… appear
  ONLY while the editor is mounted; leaving the page cannot leave stale commands behind.
  The photo detail page registers its own set (Save metadata ⌘S / Download / Delete…).
  Contextual delete opens the confirm dialog, never deletes from the palette directly.
  Focus management + Esc + focus return reuse the `SearchDialog` recipe.
- **Search doctrine** (owner call, 2026-11-08): the palette is DUMB about content.
  Commands, navigation and toggles are portal-side; "what matches?" is served by the API —
  one debounced `search(q)` call (`GET /admin/search?q`) returns ALL content groups,
  `{ posts, photos, tags }` (posts match title/subtitle/tags incl. drafts; photos match
  alt + collection — images are findable by their ALT text; tags are a VOCABULARY prefix
  lookup, a name not a document). Phase B: Meilisearch behind the same verb
  (lumen §4 indexes `photos` for the admin door; tags come from Postgres); the palette
  never changes. Toggles show CURRENT STATE in the hint column (`light`/`dark`,
  `on`/`off`) — the palette answers "what mode am I in?" before you flip it. A photo
  result always opens `/photos/[id]`: one destination, no context-magic (the one
  exception is the declared INSERT task below — declared intent, never inferred context).
  A TAG result enters `/posts?tag=<name>`: a filter axis, not a page.
- **Mode grammar** (owner call, 2026-11-08): the palette also knows WHERE to look.
  A position-0 prefix + space commits a MODE, rendered as a pill inside the search row —
  the sigil characters are CONSUMED (mode is explicit state, never re-parsed text, so a
  plain `<input>` keeps IME/caret semantics boring; contenteditable chips were rejected):
  `> ` **commands** — current-page verbs + stateful toggles + global actions,
  `/ ` **content** — the API door alone (posts · photos · tags, never navigation),
  `# ` **pages** — destinations + open recent,
  and untyped remains search-EVERYTHING (all groups ranked content-first). Empty
  Backspace disarms; sigils elsewhere stay literal (`C++ > foo` still searches); pasted
  `prefix + argument` commits in one keystroke. The grammar is a legend footer while
  idle — a keyboard-first UI shows its sigils. Pure logic lives in `palette-mode.ts`
  (armed/disarmed/group-routing/API-gating all unit-tested in node). Pills and legend
  render SVG icons (ChevronRight/Search/Hash), never text glyphs — mono stacks lack
  `❯ ⌕` and font fallback drifts the baseline.
- **Submenus & task modes** (owner calls, 2026-11-08): the palette can go DEEPER
  without closing. `Command` is declarative all the way down: `children?: Command[]`
  makes a row a parent (Enter swaps the list to its options under a `← parent` back
  row; typing filters children locally), `arm?: PaletteMode` makes a row enter a mode
  instead of running — pages describe shapes, the palette interprets, nobody sniffs ids.
  Submenus read their children **LIVE** (the parent's id is held, children re-resolved
  from the reactive command tree) — a snapshotted array would keep showing yesterday's
  ✓-marks after a toggle; `keepOpen?: true` rows run without closing (the next tag is
  already typed); `createChild?(filterText)` lets a parent synthesize
  `+ create "xyz"` — the eager-vocabulary doctrine, palette edition.
  **Task modes have no sigils** (typed grammar stays the user-facing vocabulary;
  tasks exist only as a command's destination): `insert` closes the ⌘K→cursor gap —
  rows are API photos whose Enter runs the page-published handler for the declared
  **task** (`setPhotoTask('insert' | 'cover', fn)`, same register/cleanup lifecycle —
  one picker engine, many destinations: cursor markdown or the cover field);
  `edit` is the buffer mode — `edit: true` + `seed` (the field's CURRENT value: you
  EDIT, never replace) + `commit(buffer)`, Enter saves and **stays open** so
  title→subtitle→date chains in one session, `commit` returning `false` REJECTS
  (an invalid value must never eat a keystroke). The pill names the field
  (`TITLE` `DATE` `COVER`), not the generic mode.
  Escape unwinds ONE layer per press: buffer/task → submenu → palette; typed modes
  are grammar, not a path, so Esc closes straight through them.
  The import split states the upload doctrine: **global `Import image` = upload into
  the library and that's it; the editor's `Import image into post` = a task with two
  doors** — `Upload new image…` (picker in upload mode, every finished upload inserts
  `![alt](src)` at the cursor behind the still-open dialog; covers take the same shape
  with singular semantics — first upload sets the cover, dialog closes) or
  `Search library` (task mode, no dialog at all). Upload THEN apply is the editor's
  promise; the mouse doors (toolbar/rail keys) keep the full picker.
- **Date grammar for the ✎ DATE buffer** (control-center round 1): the keyboard answer
  to a calendar popover — dates are day-arithmetic and arithmetic is a keyboard
  artifact. The pure `date-expr.ts` parses `today/tomorrow/yesterday`, ISO verbatim,
  relative `-3d +2w +1m` (month-end clamped), `nov 12` / `12 november` (current year,
  honest no-rollover), `monday / next monday` (1–7 days out), window words
  (`this/last/next week|month`) and ranges `a..b` — ranges parsed from day one for the
  filter pages; a single-date field REJECTS them (parse feedback shows in the hint
  line). The arrows stop moving rows and start moving the day: `←→ ±1d`, `↑↓ ±1w`.
  The calendar popover stays the mouse door; both write through the same setter.
- **Control-center parity doctrine** (owner call, 2026-11-08): the command palette is
  the portal's control surface — **everything a page lets you change, ⌘K can change
  while that page is mounted.** Three principled exemptions: _confirmation theater_
  (destructive acts open their dialog from the palette, never fire from a keystroke);
  _spatial state_ (bulk row-selection lives in the grid); _secrets values_ (masked
  reveal + CAS want a real form — the palette navigates and selects, never edits a
  value). The parity is safe because commands CLOSE OVER the page's own setters —
  there is no second implementation to rot (the rail↔palette title edit writes the
  same `draft` field). Rollout: the post editor's rail is done (fields, tags, cover,
  export) and the photo-detail pane (alt buffer, collection submenu, gallery toggle,
  copy link — the palette reaches the DIRTY FORM, never the network: persistence
  stays the explicit Save), AND the posts/photos list filters (status/gallery,
  collections & tags, date windows, sort, view, clear) — parity is now TOTAL on
  every configurable surface; what remains is exempt-or-already-there by ruling
  (settings' controls ARE palette toggles; secrets values stay out: masked+CAS;
  dashboard is nav+actions). Filter commands close over the page's own
  `buildUrl` — the URL is the ONE query-string truth the API reads, so a palette
  pick and a sidebar chip can never disagree; picking NAVIGATES under the
  still-open palette (keepOpen chains: status→tag→dates→sort in one ⌘K session,
  ✓ marks live between pages), and `Clear filters` exists only while something
  is on. **Focus is part of the contract**: navigation steals the caret (Kit
  follows focus to the new page), so the palette reclaims its input on every URL
  change while mounted — a control center whose keys hit deaf ears is decoration.
  The recurring shapes are kit-ified (`command-kit.ts`: `editField`, `stateToggle`,
  `vocabSubmenu`) — extracted only after two pages proved the same forms; pages
  own WHAT a commit does, the kit fixes how every toggle/submenu/field BEHAVES
  (and `stateToggle`'s `keepOpen` is opt-in: a form toggle chains into save,
  a plain toggle closes like any row).
- Roving tabindex for list rows; every table action keyboard-reachable; visible
  `focus-visible` rings (house style); forms fully labeled (native focus/announce);
  `Ctrl+Enter` save/publish convention in the editor.

## 8. Security posture

- **Exposure (owner amendment, 2026-11-08):** the portal is **public** at
  `console.gofar.id` — TLS at the shared Traefik edge with the console middlewares
  (HSTS, `frameDeny`, nosniff, per-IP rate limit; INFRA Phase 3). The
  port-forward path **survives as documented break-glass, not the only door**.
  The API doctrine is untouched by the amendment: lumen/Meilisearch/Bao stay
  ClusterIP-only; every portal→API byte rides the same-origin relay.
  **HUMAN-GATE #10 (PLAN ledger): DNS flips only when the checklist verifies** —
  edge middlewares live, login throttle + argon2id in lumen, `tv`-revocation
  proven (logout kills outstanding tokens end-to-end), `Secure` cookie over TLS,
  Bao audit trail on. Strict CSP stays deferred honestly: the rail hues ride
  inline `style=` attributes by design (Tailwind can't scan dynamic utilities),
  so a tight `style-src` would break the wayfinding — CSP arrives with a
  custom-property hue refactor, not folklore.
- CSP default; cookie `SameSite=Strict` + `HttpOnly` (Kit's `Secure` default holds —
  prod is TLS-only by the checklist); no third-party requests, ever (fonts self-hosted).
- Bao path per `INFRA_ARCHITECTURE.md` §5.5: the AppRole lives with **lumen's** server
  identity (narrow policy: `read`/`update` on `kv/data/<app>/*`, no `sys/` list); CAS
  writes prevent lost updates; **Bao audit devices are the trail** — mellon adds no
  logging of values, and lumen must never log secret values (structured logs redact by
  key). The portal's own logs: operations, never payloads.
- Values never round-trip to git, never appear in mellon's SSR payloads, and are masked in
  the UI by default.
- **Session (JWT, 2026-11-08):** lumen mints an HS256 token (`sub/iat/exp/tv/jti`,
  12h TTL, **no refresh tokens** — re-login is the design; lumen §8). mellon carries
  exactly one `HttpOnly` cookie, sized from the server's `expiresIn`; the browser NEVER
  sees the token (login/logout are server-side actions — the client's session verbs
  throw). **End session is real**: `/logout` revokes first (lumen bumps `token_version`
  → every outstanding token dies, closing the "stolen 12h bearer outlives logout"
  window that pure statelessness accepts and a public console cannot), then clears the
  cookie best-effort. The signing key (`SESSION_JWT_SECRET`) lives only in Bao;
  credentials move to lumen's argon2id `users.passhash` — the portal holds no
  credential material in any era.

## 9. Infra footprint (when scaffolded)

- `vortex`: `applications/mellon/` (ESO-free base) + `overlays/{env}/mellon` +
  `apps/mellon-app.yaml`; ClusterIP service only; node-pool `edge` (worker-2) — single
  replica; budget row already reserved in `INFRA_ARCHITECTURE.md` §1
  (100m/192Mi → 300m/384Mi).
- Env via ExternalSecret from `kv/data/mellon/{env}` (its only value: `API_BASE` +
  session-secret material — _no_ Bao credentials here; those belong to lumen's seed).
- CI: earendil's GH Actions shape (build → `sha-<short>` → kustomize edit images).

## 10. Open questions

- Port-forward ergonomics vs a mesh-only exposure (decision record required; §2 keeps it
  parked).
- Shared-theme packaging (vendored copy vs extracted package) once mellon ships.
- Media picker in posts — blocked on lumen's upload-pipeline decision (deferred there).
- Whether `/secrets` edits should propose via PR-style diff-confirm (vs direct CAS PUT) —
  lean: direct save + CAS + history (Bao keeps the audit), no ceremony.

## 11. UI system — the look of the instrument

The brief: _"like any other CMS, but simple and modern."_ The resolution: earendil is an
editorial artifact; mellon is an **instrument**. Not its antithesis — the same maker's
tool, a different posture. Every rule below serves that sentence.

### 11.1 The shell

```
┌──────────┬──────────────────────────────────────────┐
│          │  topbar (56px): breadcrumb · ⌘K · actions│
│ left nav ├──────────────────────────────────────────┤
│ 240px    │                                          │
│          │   content: tables / forms / editor       │
│ ──────── │                                          │
│ theme    │                                          │
│ session  │                                          │
└──────────┴──────────────────────────────────────────┘
```

- **Left nav**: grouped sections — `content` (posts · photos · tags), `ops` (secrets; the
  future infra tab joins here). Section labels are the blog's `CardTitle` voice: mono,
  uppercase, `text-xs tracking-widest`. At `lg+` a persistent rail (collapsible to
  icons); **below `lg` the strip is gone — a hamburger in the topbar slides the same
  menu in as a left drawer** (X/Esc/backdrop dismiss, closes on navigation). The
  rail's base carries the **end session** row (owner call 2026-11-08): nav-row grammar —
  hairline separator, `LogOut` icon + label, danger tint ON HOVER ONLY (logout is the
  last thing you take, not the loudest) — and when the rail collapses the ICON STAYS
  VISIBLE with an `aria-label`: the old fade-to-`opacity-0` shipped an invisible
  focusable button in the tab order, an a11y trap wearing a style bug. One
  `navFooter(rail)` snippet serves rail, collapsed strip and drawer alike.
- **Top bar**: a three-zone flow grid — context left (hamburger below `lg`, then the
  breadcrumb, truncating BEFORE the middle zone), the **⌘K affordance centered** (a
  VS Code/Raycast convention — the shell _advertises_ the keyboard-first promise
  rather than burying it; it reserves its space, never floats over content), page
  actions right. The palette itself is global chrome, rendered from the §7 command
  registry.
- **Content area**: full-bleed; forms constrained to their measure (max ~72ch), lists
  allowed the width.

### 11.2 Type & voice

| role                 | face               | where                                                                                                                                                |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| chrome, labels, body | **Inter**          | everywhere by default                                                                                                                                |
| **entity titles**    | **Fraunces**       | table post titles, the editor's document title, page headers — and nowhere else. The author's voice greets you in the admin; one signature is enough |
| anything data-like   | **JetBrains Mono** | slugs, dates, readTime, tags, secret keys/versions/values, shortcut hints                                                                            |

Density: 13–14px base, table rows ≈40px, labels uppercase mono 12px. The instrument is
comfortable, not cozy: no 18px editor paragraphs pretending to be a novel.

Voice (owner call 2026-11-08): component copy is **normal** — buttons, labels, pills,
messages and empty states carry no decorative `;`. The semicolon lives only in the
**wordmark** (`mellon;`), same pen-word device as the public site's `gofar;`.

### 11.3 Color discipline — the wayfinding doctrine (owner amendment, 2026-11-08)

- **Whisper-indigo neutrals:** the whole surface scale is zinc shifted a hair
  toward indigo (`--background/--card/--muted/--border/--accent`), plus a
  dedicated `--chrome` for the shell (rail + topbar + drawer) — chrome recedes,
  content floats. Token NAMES remain the earendil contract; the VALUES are
  mellon's by owner decision (light/dark parity still mandatory, every pixel).
- **A hue cast, one hue one job:** `--brand` violet (published, primary verbs,
  focus, dashboard) · `--accent-blue` periwinkle (posts) · `--accent-teal`
  (photos / gallery-visible) · `--accent-amber` (drafts / secrets vault) ·
  `--accent-slate` (settings — deliberately quiet). Cast members sit at equal
  chroma/lightness so the family reads as one voice set.
- **Where color may live:** nav icons (72% opacity at rest, full + `color-mix`
  wash pill when active), status pills, keys/chips pressed states, selection
  tints. **Where it may not:** body/label text wholesale, backgrounds en masse,
  tables striped by hue. `red` remains EXCLUSIVELY destructive; green never;
  statuses speak the cast (published violet / draft amber / unpublished
  dashed-neutral).
- **The one gradient exception:** the login aura (`§11.4`), brand at 15% radial.
  Every other surface is flat.
- Anti-rules, as binding as the rules: `rounded-lg` is the roundest anything
  gets, shadows **only** on overlays (palette, menus, sheets), and motion lives
  in overlays (150–200ms transforms/opacity — the drawer transitions) plus the
  **rails**: sidebars fold to the side with a 200ms width transition and curtain
  the content behind them (owner call 2026-11-08 — "smooth where it moves, still
  where it reads"); list rows may crossfade 140ms on filter change. Buttons get
  one micro-interaction: `active:scale`. Forms themselves never animate.
  Reduced-motion: everything instant. If a screen starts resembling a
  ThemeForest preview, it is wrong.

### 11.4 Per-view anatomy

- **Lists** (posts/photos/tags): table + status pills; row actions revealed on hover **and
  on row focus** — the AGENTS §10.5 lesson, restated for keyboards: _"no mouse-only
  affordance in the admin either."_ Filter/tool rows use the `Pill` chip language.
- **Post editor**: split view — CodeMirror left, true-to-prod preview right (**toggle
  button + palette command**, owner call 2026-11-08); a collapsible **settings rail**
  (title/subtitle, slug — auto from title until authored, date, tags as a
  search-and-create combobox over the vocabulary, media — cover preview + set/change/
  clear and insert-image via the shared ImagePicker, export block, timeline of
  created/published/updated) at the content's right —
  Ghost's shape, not Notion's sprawl. The meta bar above the editor holds ONLY the
  preview toggle; the rail is headed **post** and its first labeled section,
  **actions**, carries the verbs — quiet `save draft`
  (outlined; ⌘Enter/⌘S), the one violet verb the state machine allows (`publish` /
  `unpublish`), and a quiet `delete`. (Owner call 2026-11-08: actions live with
  settings, like Ghost's publish box — but labeled as their own section; publish
  verbs are not "settings".)
  `/posts/new` opens the editor directly — no intermediate form. Below `lg`, a
  **thumb band** under the panes carries the pane controls — `[write] [preview]`
  tabs left (roving tabindex), `[wrap] [post]` right (the post chip summons the
  settings sheet) — instead of stacking or stretch-height rows; reading the
  render of a long post must never cost a scroll or a grip shift. Both panes
  stay mounted, so switching is instant and the hidden preview keeps
  rendering ahead of the visit. On `lg+` wrap lives in the meta band beside the
  eye toggle — same snippet, two bands. (Owner call 2026-11-08.)
  **The whole rail is palette-reachable** (control-center parity, §7): title/subtitle/
  date as `✎` edit buffers, slug only pre-creation, tags as a live toggle submenu with
  eager create, cover as the upload-then-set / pick-as-cover task, export as three
  plain commands. Every one writes through the rail's own setter — the palette is the
  keyboard for the same state, never a second copy. The read-only TIMELINE stays out
  by design: there is nothing to change.
- **Photos (the darkroom)**: presented as a working library, not a moodboard.
  Two views — tiles (the default; phones only ever see tiles) and a sortable
  table (`photo · alt · collection · gallery · size · created`, headers linking
  `?sort=&dir=` through the API). A right sidebar (inline at `lg+`, bottom sheet
  below, same curtain/collapse/snippet architecture as posts) holds **sort,
  date range, and collections (OR toggles)**; the always-visible strip keeps
  only the gallery axes + select-all, with a badge-counted filters key. Every tile and row carries the same two
  controls: an **eye key** toggling the `gallery` flag (uploads default OFF —
  publishing to the blog's Gallery is a deliberate act; the public list serves
  only gallery=true photos, collection-agnostic), and a single-select
  **collection combobox** (eager create, "uncategorized" clears). A **bulk
  bar** materializes only while a selection lives: set collection / in / out
  across N photos, optimistic with per-id overlays so the grid never reloads
  mid-cursor. Filters ride the URL like posts'; the vocabulary is admin-internal.
  The tile IMAGE and the table ALT cell are links to the photo's own page — the curation
  keys stay on top (absolute, later in DOM) so both doors coexist.
- **Photo detail** (`/photos/[id]`, owner calls 2026-11-08): the image's dedicated page.
  Left: a **`.photo-canvas` preview** — permanently dark inset (`#0b0b0f`, deliberately
  un-themed; a white photo must still read; lightbox backdrop, not a surface), image
  contained and centered. Right: the **hideable metadata pane** — the established curtain
  (`photoRail`, `w-80` ↔ `w-9` vertical-label strip, persisted; the collapsed label shows
  `· edit` while the form is dirty), and below `lg` the same snippet rides a **RailDrawer
  sheet** behind an Info key. The sheet UNMOUNTS when closed, so the draft form state
  lives in the PAGE — hiding the UI never hides the edits.
  Metadata is a **FORM WITH EXPLICIT SAVE** (owner correction: not auto-patched fields):
  an editable copy of `{alt, collection, gallery}` against a saved baseline; per-field
  dirty dots; `Save changes` (violet, disabled until dirty, **⌘S** like the editor)
  commits all three in one PATCH; success re-baselines + `saved` flash, failure KEEPS
  the edits (a save error never silently reverts you). Unsaved-guards lifted from the
  editor: `beforeunload` + `beforeNavigate` confirm.
  The pane also carries: **used in** — posts whose content embeds this src, loaded
  server-side WITH the photo (a delete warning that hydrates late is advice already
  acted upon), each linking into its post editor; read-only facts (dims, created,
  mono src + copy-link); and the pinned action band — `Save changes`,
  `Download` (blob save-as named from the alt text; open-in-tab as the honest
  cross-origin fallback), `Delete image` (danger-outline → red on hover).
  The pane is fully **⌘K-reachable** (kit-built, §7 parity): `Set alt text` seeded
  buffer, `Set collection` submenu (single-home: rows SET, `uncategorized` clears,
  `+ create` rides the local vocabulary), `Toggle gallery` with the live
  `in gallery`/`hidden` hint — all writing the DRAFT; the Save button arms dirty,
  nothing persists until ⌘S.
  Delete is **WARNED, NEVER BLOCKED** (owner ruling): the shared DeleteDialog —
  generalized to `{heading, description, confirmText, references?}`, one destructive
  grammar for posts and photos alike — names the consequence in plain words ("citing
  posts will show a broken picture"; "the file keeps being served until storage GC"),
  lists the referencing posts, and demands the PHOTO ID retyped. The mock keeps the
  bytes after the row dies: the Phase B GC-window, made tangible.
- **Secrets**: presented as what it is — a config file with version control. Masked mono
  values, reveal on press (never "show all values" as a resting state), **version history
  as a side sheet** (springs from the right, reusing the drawer motion), diff between
  versions, CAS-save. The masked-mono table is naturally beautiful in this palette; no
  decoration needed.
- **Command palette** (the §7 grammar, made visible): search row = `⌘` mark, an optional
  MODE PILL (icon + word — `› commands` `⌕ content` `# pages` `⌐ insert`, rendered as
  flex-centered Lucide SVGs at `leading-none`, brand-tinted mono micro-chip,
  aria-hidden because the input's own label speaks the mode), then the plain input,
  then the `esc` kbd. Results keep the hint column for state (toggles show
  `light/dark`/`on/off`, photos show dims, posts show status, tags show published
  counts). GROUP chips prefix each row only while MULTIPLE kinds share the plain
  list — a forced mode, a submenu, or the legend's own silence says what rows are.
  Submenu view: back row first (`← parent` · `esc` hint), children below in declared
  order — selection lands on the FIRST OPTION (back rows exit, so they never get the
  default highlight; task modes riding above a submenu have no back row and select
  from the top). The EDIT buffer mode has no list at all: the hint line IS the UI —
  live parse feedback for dates (`2026-11-09 — ⏎ saves`), commit state for text.
  Idle shows the legend footer (`› commands · ⌕ content · # pages`) — sigils
  documented, not folklore.
- **Empty states**: the `Watermark` ghost at 8–10% + one quiet sentence. Continuity, and
  the charm is free.
- **Settings**: max-width form, same voice (owner call 2026-11-08: the theme became an
  ACTUAL setting — an **appearance** segment `[☀ light | ☾ dark]` above the editor group,
  radiogroup semantics, writing through the ONE `setTheme()` (store + cookie + View
  Transition) that the topbar toggle and the palette command share; three doors, zero
  forked logic. The stale "theme follows the toggle in the top bar" footnote died with it
  — a control with documentation pretending to be a setting was the bug).
- **Login**: the brand moment — centered gate, the sanctioned aura radial behind
  it (§11.3), theme toggle reachable in the corner. Nothing else on the screen
  competes.

### 11.5 Acceptance test

Screenshot any mellon page beside gofar.id: it must read as **the same maker's tool** —
same zinc, same violet, same mono data, same restraint — while being unmistakably an
instrument, not an article. If either half fails, the page is not done.

## Setup wizard surfaces (2026-11-11)

`/setup` is the portal's bootstrap door (owner naming: setup, not password):
register mode while lumen reports the estate unclaimed (TOFU, dies on first
claim), change mode for must_change arrivals (admin temps and resets) —
login and the layout's whoami probe route into it; the 428 lock is honored
server-side, never merely styled. `/settings/users` (admin card + desk)
mints users and re-issues temps; the one-time reveal is exactly that — once.
Doctrine intact: the portal holds no credentials and decides nothing — every
rule the wizard renders is lumen's.
