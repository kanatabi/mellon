# SHADCN-PLAN — execution breakdown

Companion to [`SHADCN.md`](SHADCN.md) (the spec). This file is the **task
ledger**: one section per slice, numbered tasks, exact files, exact commands,
and the verification that closes each one. Tick boxes as work lands — the file
is committed with the slice, so the ledger is the audit trail.

> Not to be confused with `PLAN.md`: that name is reserved for the owner's
> local-only journal (gitignored, never committed — AGENTS §1/§6).

## How to work this plan

- **One slice = one branch = one release.** Branch `feat/shadcn-s<n>-<theme>`
  off `main`; PR reviewed; released through the anvil ladder. Never stack two
  slices on one branch — the whole point of five is that any slice can be
  reverted alone.
- **Two commits per slice minimum**: `vendor: add <items> (raw)` then
  `feat(ui): <slice> — <what it replaces>`. The raw commit makes the restyle
  reviewable as a diff-of-a-diff; squashing them hides the work.
- **Gates, standalone, in order** (never `&&`):
  `npx prettier --check .` → `npx eslint .` → `npm run check` →
  `npm run test:unit` → `npm run build`
- **Definition of done** for every task group: the slice's rows in
  SHADCN.md §6 are ticked, the ledger below is updated, and a vault state line
  is added to `context-knowledge/repos/mellon/README.md`.
- **Estimates are working days for one person**, including review time, not
  wall-clock promises.
- **Stop conditions**: if R1 (identity erosion) or R2 (portal geometry) shows
  up and cannot be settled in half a day, park the slice and report — the
  experiment is allowed to fail cheaply at every step.

---

## Preconditions (before S1)

- [ ] **P1** — branch protection / PR flow confirmed for `kanatabi/mellon`.
- [ ] **P2** — a recorded visual baseline: screenshots of all 14 routes, light
      and dark, desktop and phone, stored outside the repo (they are the
      "didn't change" proof for S1 and the "changed deliberately" proof later).
- [ ] **P3** — the bundle baseline recorded: shell chunk gz size and total
      client build size from `npm run build` (R8 measures against this).
- [ ] **P4** — `npm run test:unit` baseline: **157 passed, 6 skipped**.
- [ ] **P5** — a dev stack that can talk to lumen (`make dev` in `../lumen`, or
      the compose plane) for the pages that need live data. SQLite-only pages
      are not a thing here; assume lumen.

---

## S1 — Foundation (2 d, zero visual diff)

**Goal:** the substrate exists and provably changes nothing on screen. If S1
ships and nobody can tell, it succeeded.

**Branch:** `feat/shadcn-s1-foundation`

### 1.1 Alias probe + `components.json` (0.25 d)

- [ ] Create `components.json` by hand (never `init` — it wants `src/app.css`
      and would overwrite the palette; see SHADCN.md §3):

```json
{
	"$schema": "https://shadcn-svelte.com/schema.json",
	"tailwind": { "css": "src/routes/layout.css", "baseColor": "zinc" },
	"aliases": {
		"lib": "#lib",
		"utils": "#lib/utils",
		"components": "#lib/components",
		"ui": "#lib/components/ui",
		"hooks": "#lib/hooks"
	},
	"typescript": true,
	"registry": "https://shadcn-svelte.com/registry"
}
```

- [ ] **Probe** (30 min, throwaway branch): `npx shadcn-svelte@1.8.1 add button`.
      The CLI documents that aliases come from `svelte.config.js`; mellon has
      **none** (SvelteKit 3 keeps config inside `vite.config.ts`). Record the
      outcome in this file: - **works** → keep `components.json`, use the CLI for every slice. - **fails to resolve `#lib`** → switch aliases to `$lib` (SvelteKit's
      built-in) for the CLI's sake, keep the normalization step (§2.2) which
      rewrites them to `#lib` anyway. Do **not** add a `svelte.config.js`
      just to satisfy tooling. - **fails outright** → use the fallback fetcher (1.2).

### 1.2 Registry fetcher (fallback, 0.25 d)

- [ ] `scripts/shadcn-add.mjs` — a ~70-line, committed script (used instead of
      the CLI if 1.1 fails; harmless if not). Behaviour:

  - args: item names
  - fetch `https://shadcn-svelte.com/registry/<item>.json`
  - recurse `registryDependencies`
  - write `files[].content` to `src/lib/components/ui/<files[].target>`
    (hooks items go to `src/lib/hooks/`)
  - substitute the placeholders: `$UTILS$`, `$UI$`, `$HOOKS$`, `$LIB$`
  - rewrite `@lucide/svelte/icons/` to `lucide-svelte/icons/`
  - print the union of `dependencies` / `devDependencies` for review — never
    install automatically

- [ ] Verify against the known shape: `sidebar.json` carries 27 files and pulls
      `is-mobile, input, tooltip, skeleton, separator, button, sheet`.

### 1.3 Dependencies (0.1 d)

- [ ] `npm install bits-ui@^2.21.0 tailwind-merge@^3.7.1 clsx@^2.1.1 tailwind-variants@^3.2.2 tw-animate-css@^1.4.0`
- [ ] `npm install -D @testing-library/svelte happy-dom`
- [ ] **Not** installed, deliberately: `@lucide/svelte` (D7), `cn` (D8),
      `@internationalized/date` (S4 only — keep S1's surface minimal).

### 1.4 `src/lib/utils.ts` (0.15 d)

- [ ] `cn()` via `clsx` + `twMerge`, plus the five type helpers vendored files
      import, verbatim from the registry's `utils` item:
      `WithoutChild`, `WithoutChildren`, `WithoutChildrenOrChild`,
      `WithElementRef` (+ the `cn` export). The registry's own version imports
      the `cn` package — we deviate on purpose (D8).
- [ ] Unit test `src/lib/utils.test.ts`: merge order wins for conflicting
      utilities (`cn('px-2','px-4')` → `'px-4'`), custom colors survive
      (`cn('bg-brand','bg-muted')` → `'bg-muted'`).

### 1.5 Tokens (0.25 d)

- [ ] `src/routes/layout.css`, **both** theme blocks (`:root` and
      `[data-theme='dark']`):

```css
/* shadcn component vocabulary mapped onto mellon's tokens — SHADCN.md §3.
   --primary was declared-but-unused (0 consumers), so it becomes the action
   fill; ink is --foreground. */
--primary: var(--brand);
--primary-foreground: var(--background);
--secondary: var(--muted);
--secondary-foreground: var(--foreground);
--popover: var(--card);
--popover-foreground: var(--foreground);
--input: var(--border);
--ring: var(--brand);
--destructive: var(--danger);
--destructive-foreground: var(--background);
--sidebar: var(--chrome);
--sidebar-foreground: var(--foreground);
--sidebar-primary: var(--brand);
--sidebar-primary-foreground: var(--background);
--sidebar-accent: var(--accent);
--sidebar-accent-foreground: var(--foreground);
--sidebar-border: transparent; /* §11.1: one chrome mass — no internal borders */
--sidebar-ring: var(--brand);
```

- [ ] `@theme inline`: the `--color-*` twins for every name above (17 total,
      incl. the 8 `--color-sidebar-*`). **A missing twin generates no utility
      and fails silently** (SHADCN.md §3.3 / R3).
- [ ] Comment on the `--primary` block pointing at SHADCN.md §3.1, so the
      divergence is findable from the code.

### 1.6 Test environment (0.4 d)

- [ ] `vitest.config.ts`: add a second project/environment so **DOM tests need
      no annotation** while pure-lib tests stay fast:
      `browser`-ish project with `environment: 'happy-dom'`,
      `include: ['src/**/*.dom.test.ts']`, setup file registering
      `@testing-library/svelte` cleanup.
- [ ] Smoke test `src/lib/components/ui/__probe.dom.test.ts` — renders a
      vendored `Button` and asserts a click fires. **Delete it in 1.8**; it
      exists to prove the harness before anything depends on it.
- [ ] `npm run test:unit` still reports the same 157 + 6.

### 1.7 Documentation (0.2 d)

- [ ] Commit `SHADCN.md` + `SHADCN-PLAN.md` (this file) with 1.1's probe result
      recorded.
- [ ] No DESIGN.md / AGENTS.md edits (D3).

### 1.8 Close S1 (0.25 d)

- [ ] Gates green, standalone.
- [ ] **Visual proof**: re-screenshot a sample (login, dashboard, photos,
      vault) light+dark; diff against P2. Diff must be empty.
- [ ] `grep -rn 'text-primary\|bg-primary' src` → still 0.
- [ ] Remove the probe test; remove any probe component added by 1.1.
- [ ] Commit, PR, release.

---

## S2 — Chrome: the sidebar block (3.5 d)

**Goal:** the hand-built shell nav is replaced by `ui/sidebar`, and the
instrument still looks like itself. This is the riskiest slice; it is also the
easiest one to abandon cleanly.

**Branch:** `feat/shadcn-s2-chrome`

### 2.1 Vendor the block (0.2 d)

- [ ] Add: `sidebar dropdown-menu tooltip sheet separator skeleton input button`
      (the block pulls: `is-mobile`, `input`, `tooltip`, `skeleton`,
      `separator`, `button`, `sheet` — verify the resolved file list is the 53
      expected).
- [ ] Commit raw (see "How to work this plan").
- [ ] Normalization grep (SHADCN.md §2.2) → empty.

### 2.2 Verify the classes the block actually emits (0.15 d)

- [ ] `grep -rho 'bg-sidebar[a-z-]*\|text-sidebar[a-z-]*\|border-sidebar[a-z-]*\|ring-sidebar[a-z-]*' src/lib/components/ui/sidebar | sort -u`
      — every name must have a `--color-*` twin from 1.5. Any miss = silent
      invisibility (R3).

### 2.3 Constants — match mellon's rail (0.05 d)

- [ ] `ui/sidebar/constants.ts`:
      `SIDEBAR_WIDTH = "15rem"` (240px = today's `--container-nav`),
      `SIDEBAR_WIDTH_ICON = "3.5rem"` (56px = today's `--container-nav-rail`).
      16rem/3rem are the block's defaults and would silently widen the rail.

### 2.4 The content box (0.3 d)

- [ ] `ui/sidebar/sidebar-inset.svelte` — replace the
      `md:peer-data-[variant=inset]:*` chain with the **rendered contract**
      from `(app)/+layout.svelte` today:

```
mx-3 mb-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border
bg-background px-4 py-6 shadow-sm sm:px-6 lg:ml-0
```

- [ ] **Owner question, answer before coding**: the code uses `rounded-2xl` and
      `shadow-sm`, while DESIGN says `rounded-lg` is the ceiling and shadows
      belong to overlays. Choose (a) reproduce the code (pure parity, drift
      preserved), or (b) fix to the doctrine (deliberate 2-line visual diff).
      Record the choice in SHADCN.md §3.5 either way.
- [ ] **Scroll audit** (R4): `Sidebar.Inset` renders `<main>`; confirm pages
      that own their scroll (`min-h-0`, `overflow-y-auto`) don't double-scroll
      and sticky headers still stick.

### 2.5 Vendored patches (0.55 d)

- [ ] **No cookie** (D6): delete the
      `document.cookie = ${SIDEBAR_COOKIE_NAME}=…` line in
      `ui/sidebar/sidebar-provider.svelte`, with a comment pointing at
      SHADCN.md §5.2. Persistence is `navRail`.
- [ ] **⌘B guard** (D5): in `ui/sidebar/context.svelte.ts`,
      `handleShortcutKeydown` gains a focus guard:

```ts
// SHADCN.md §5.1 — vim's Ctrl+B is page-up; a keystroke in a text surface
// belongs to that surface. Focus decides.
function isTextSurface(t: EventTarget | null): boolean {
	if (!(t instanceof HTMLElement)) return false;
	return !!t.closest(
		'.cm-editor, input, textarea, select, [contenteditable="true"], [role="textbox"]'
	);
}
```

- [ ] Unit test `ui/sidebar/context.dom.test.ts`: `mod+b` with target inside
      `.cm-editor` does **not** call `setOpen`; with target on `<body>` it does.

### 2.6 The shell rewrite (0.8 d)

- [ ] `src/routes/(app)/+layout.svelte` (459 → ~300 lines): - `<Sidebar.Provider bind:open={!navRail.collapsed}>` at the root - `<Sidebar.Root variant="inset" collapsible="icon">` with
      `Header` (brand + `mellon;`), `Content` (three `Group`s: Content /
      Control Plane / Admin), `Footer` (collapse toggle), and `Inset`
      wrapping the topbar + `<main>` - nav items become `Sidebar.Menu` / `MenuItem` / `MenuButton` with the
      `child` snippet rendering `<a>`; active state via `isActive` - **role gating preserved**: the Admin group renders only for
      `data.principal?.role === 'admin'` (same condition as today) - **delete**: `navItems()` markup, the `{#if navOpen}` backdrop +
      `role="dialog"` drawer (lines ~356–391), the bespoke collapse toggle
      and its hover-tip, the `burger` state
- [ ] `rails.svelte.ts`: add `setCollapsed(open: boolean)` (the current `toggle`
      is a flip; `Provider` needs absolute values) — keep arrows-bound fields,
      keep the `mellon.rail.nav` localStorage key so existing sessions don't
      reset.
- [ ] `Sidebar.Trigger` replaces the hamburger (below `lg`), opening the
      block's mobile sheet.

### 2.7 Mobile parity (0.3 d)

- [ ] The block's mobile sheet must match today's contract: X / `Esc` /
      backdrop dismiss, focus returns to the trigger, `env(safe-area-inset-*)`
      padding preserved, width `w-64 max-w-[80vw]` equivalent.
- [ ] Reduced-motion: sheet instant (today's `reduced ? 0 : 240`).

### 2.8 Top bar (0.45 d)

- [ ] `UserMenu.svelte` → `ui/dropdown-menu` (identity, Settings, theme, End
      session). Keep the ghosted avatar grammar (`bg-brand/15 text-brand`).
- [ ] Shell hover-tip → `ui/tooltip` (the `Tooltip.Provider` already wraps
      children inside `Sidebar.Provider`, `delayDuration={0}`).
- [ ] ⌘K pill, the phone search key, and the theme toggle stay hand-built —
      they are brand furniture, not generic controls.

### 2.9 Close S2 (0.35 d)

- [ ] Gates green; manual matrix: desktop ⌘B outside/inside editor, collapse
      persist across reload, mobile drawer, keyboard-only nav walk,
      light/dark.
- [ ] **Bundle delta measured** (R8) and recorded here: shell chunk gz
      before → after.
- [ ] Screenshots attached; only the intended differences.

---

## S3 — Form primitives (3 d)

**Goal:** the 133 buttons, 34 inputs and 18 repeated mono labels stop being
copy-paste. The look does not change.

**Branch:** `feat/shadcn-s3-forms`

### 3.1 Vendored + restyle (1 d)

- [ ] Add `input label textarea checkbox switch separator badge` + `button`.
- [ ] `ui/button/button.svelte` — variant map to the cast, not to shadcn:
      `quiet` (outlined, `border-border`, foreground), `primary`
      (`bg-brand text-background` — the one violet verb), `danger`
      (`text-danger`, destructive copy only), `ghost` (hover `bg-accent/60`),
      `icon` (the 36px/40px square languages), `kbd`/`pill` if the sweep shows
      need. Sizes: `sm`/`md` matching current `px-3 py-2` / `px-4 py-2`.
- [ ] `ui/label` — add the house `mono` variant (the 18×
      `text-xs font-medium tracking-widest text-muted-foreground uppercase`).
- [ ] `ui/input` — adopt the repeated class verbatim, with `aria-invalid`
      styling on `--danger`:

  ```
  rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm
  outline-none focus-visible:border-brand
  ```

- [ ] Focus ring: `--ring` = brand, `focus-visible:` only (never `focus:`).

### 3.2 Sweep, page by page (1.6 d)

Each page: replace raw elements, **no layout changes**, verify with the P2
screenshot.

- [ ] `login` (75 lines) — inputs, submit, error block
- [ ] `setup` (138) — wizard fields, validation states
- [ ] `settings` (200) — appearance/security cards, toggles
- [ ] `admin/users` (166) — table rows, role selects (select swap is S4;
      keep the trigger styling aligned), dialogs' buttons
- [ ] `configs` (147) + `configs/compare` (442) — filter row, diff controls
- [ ] `configs/vault` (909) — env tabs, key rows, mask/copy keys, CAS save bar
- [ ] `posts` (661) — filter row, date range trigger (calendar in S4), bulk bar
- [ ] `tags` (596) — row dialogs, bulk actions
- [ ] `photos` (1003) — gallery strip, filter row, bulk bar, tile/row controls
- [ ] Count the residue: `<button` and `<input` should be ~0 outside
      `PostEditor`/`Palette`/`ImagePicker`, where bespoke grammar is intended.

### 3.3 Close S3 (0.4 d)

- [ ] Gates green; keyboard walk of every form; `aria-invalid` + error copy
      still verbatim (ghost-field).
- [ ] Screenshots: empty diff except intended focus-ring unification.

---

## S4 — Choice widgets (4 d)

**Goal:** the widgets that mint bugs — listbox, combobox, calendars — move to
bits-ui. This is the slice with the highest defect-avoidance value.

**Branch:** `feat/shadcn-s4-choice`

### 4.1 Vendor (0.2 d)

- [ ] `npm install @internationalized/date` (first use).
- [ ] Add `select popover command calendar range-calendar` (+ their
      `separator`/`button`/`dialog` deps).

### 4.2 Select — 6 sites (0.9 d)

- [ ] `ui/select` restyle: trigger = today's field anatomy, content = `--card`
      surface + `shadow-md` (overlay rule), item states on `--accent`.
- [ ] Sites: `admin/users`, `configs/compare`, `configs/vault`, `PostEditor`
      (×2 — status/collection style selectors), `tags`.
- [ ] Delete `Select.svelte` (201 lines). **Keep the doctrine**: no native
      `<select>` (`grep -c '<select' src` stays 0).
- [ ] Behaviour test: open → arrows → Enter commits → `Esc` closes → focus
      returns; long lists scroll to the active item.

### 4.3 Combobox — 5 sites (1.0 d)

- [ ] Composition: `ui/popover` + `ui/command` (registry `combobox` is a 404 —
      it is documented as a composition). Recreate the current contract:
      filter, keyboard nav, **eager create** (a new tag/collection is created on
      commit, not on keystroke), the single-select **replace** semantics from
      `06698b6`, and multi mode for bulk.
- [ ] Sites: `PostEditor` (tags), `photos` (collection per row/tile + bulk),
      `photos/[id]` (collection).
- [ ] Delete `Combobox.svelte` (273 lines).
- [ ] Tests: replace-on-single (the regression that shipped the fix), append on
      multi, create-then-select, `Esc` without commit leaves value untouched.

### 4.4 DatePicker — 1 site (0.5 d)

- [ ] `ui/calendar` + `ui/popover`; `@internationalized/date` for value
      plumbing. `PostEditor`'s publish-date field.
- [ ] Delete `DatePicker.svelte` (191 lines).

### 4.5 DateRange — 2 sites (0.6 d)

- [ ] `ui/range-calendar` + popover for `posts` and `photos` filters.
- [ ] **Boundary**: `date-expr.ts` keeps parsing every shorthand (`7d`,
      `last month`, …) and its tests stay the contract; the calendar only
      offers grid selection and shows what the parser resolved. Do not move
      expression logic into the widget.
- [ ] Delete `DateRange.svelte` (240 lines).

### 4.6 Close S4 (0.4 d)

- [ ] Gates; keyboard walk of all three widget families; mobile (calendar in a
      sheet, not a popover clipped by the box).
- [ ] Screenshots: only trigger chrome may differ.

---

## S5 — Overlays + final parity + release (6 d)

**Goal:** the remaining overlays, a page-by-page parity pass, and the graduation
decision.

**Branch:** `feat/shadcn-s5-overlays`

### 5.1 Vendor (0.2 d)

- [ ] Add `alert-dialog dialog sheet dropdown-menu tooltip toggle-group table`.

### 5.2 DeleteDialog → `ui/alert-dialog` (0.5 d)

- [ ] Sites: `PostEditor`, `photos/[id]`. Destructive grammar preserved: violet
      is _not_ used; `--danger` text, `Esc`/backdrop cancel, no autofocus on the
      destructive verb.
- [ ] Delete `DeleteDialog.svelte` (149 lines).

### 5.3 RailDrawer → `ui/sheet` (0.9 d)

- [ ] Sites: `PostEditor` (settings rail), `posts` (filters), `photos`
      (filters + detail meta), `photos/[id]` — 4 mounts.
- [ ] Preserve: the collapsed rail's vertical `· edit` dirty label, 200ms
      curtain, unmount-on-close (the draft state lives in the page), and the
      `lg+` inline behaviour (sheet only below `lg`).
- [ ] Delete `RailDrawer.svelte` (162 lines).

### 5.4 Remaining overlays (0.3 d)

- [ ] Tooltips anywhere the sweep found a `title=` crutch.
- [ ] `ui/table` where the three tables benefit (posts/tags/photos) — optional;
      skip if it would churn sorting markup.
- [ ] `toggle-group` for `ThemeSegmented` — optional, only if the theme round is
      otherwise static.

### 5.5 Final page recomposition (1.8 d)

The five heavy pages get their last pass — grids, rows, and filters built from
the new primitives rather than raw class soup:

- [ ] `photos` (1,003) · `configs/vault` (909) · `posts` (661) ·
      `tags` (596) · `photos/[id]` (558)
- [ ] Every page's diff is _deliberate_: list the intended visual changes in the
      PR body.

### 5.6 Parity pass (1.1 d)

- [ ] SHADCN.md §6 checklist, row by row, **14 pages**, light + dark, desktop +
      phone.
- [ ] A11y walk of the 247 `aria-*` paths currently in the tree; record any
      that moved to bits-ui (most did) and confirm no path was lost.
- [ ] `grep -rn 'rounded-xl\|rounded-2xl' src` — only the permitted set (the
      owner's S2 choice plus pre-existing owner-approved cases).
- [ ] Bundle measurement vs P3; test count vs P4.

### 5.7 Docs + release (0.6 d)

- [ ] Update SHADCN.md: slice statuses, decision log entries added during the
      work, the S2 geometry ruling, the measured deltas.
- [ ] Vault: `context-knowledge/repos/mellon/README.md` state entry;
      `LEARNING.md` cards for whatever the slices taught (the ⌘B/vim collision
      is a candidate; the `$UTILS$` placeholder discovery is another).
- [ ] Release through the anvil ladder; record the environment order.
- [ ] **Graduation gate** (SHADCN.md §10): decide promote vs delete. Promotion
      writes DESIGN §11.6 and the AGENTS §2 pointer _in a separate round_ — not
      in this branch.

---

## Rollback

| slice | revert cost                                                                                     |
| :---- | :---------------------------------------------------------------------------------------------- |
| S1    | trivial — `components.json`, utils, tokens, deps. Zero UI change to undo                        |
| S2    | revert the branch; the shell returns whole. The vendored `ui/sidebar` tree goes with it         |
| S3    | revert; pages return to raw elements                                                            |
| S4    | revert; the three old widgets return from git (`Select`, `Combobox`, `DatePicker`, `DateRange`) |
| S5    | revert; `DeleteDialog`/`RailDrawer` return                                                      |

Nothing in this plan changes the wire, the relay, the doctrine, or the
deployment — every slice reverts without touching lumen, vortex, or earendil.

## Appendix A — item list and known deps

Measured from `https://shadcn-svelte.com/registry/<item>.json` on 2026-11-20:

| item                                                                              |   files | deps                                                                | registry deps                                                 |
| :-------------------------------------------------------------------------------- | ------: | :------------------------------------------------------------------ | :------------------------------------------------------------ |
| `sidebar`                                                                         |      27 | —                                                                   | is-mobile, input, tooltip, skeleton, separator, button, sheet |
| `select`                                                                          |      12 | bits-ui, @internationalized/date, @lucide/svelte                    | separator                                                     |
| `command`                                                                         |      12 | bits-ui, @internationalized/date, @lucide/svelte                    | dialog                                                        |
| `dropdown-menu`                                                                   |      18 | bits-ui, @internationalized/date, @lucide/svelte                    | —                                                             |
| `dialog`                                                                          |      11 | bits-ui, @internationalized/date, @lucide/svelte                    | —                                                             |
| `alert-dialog`                                                                    |      12 | bits-ui, @internationalized/date                                    | button                                                        |
| `sheet`                                                                           |      11 | bits-ui, @internationalized/date, @lucide/svelte, tailwind-variants | —                                                             |
| `calendar` / `range-calendar`                                                     | 19 each | @internationalized/date, bits-ui, @lucide/svelte                    | button                                                        |
| `popover` / `tooltip`                                                             |  6 each | bits-ui, @internationalized/date                                    | —                                                             |
| `table`                                                                           |       9 | —                                                                   | —                                                             |
| `toggle` / `toggle-group`                                                         |   2 / 3 | bits-ui, tailwind-variants                                          | toggle                                                        |
| `button` / `badge`                                                                |  2 each | tailwind-variants                                                   | —                                                             |
| `input` / `label` / `textarea` / `checkbox` / `switch` / `separator` / `skeleton` |  2 each | bits-ui (except input/textarea/skeleton)                            | —                                                             |
| `is-mobile`                                                                       |       1 | —                                                                   | —                                                             |
| `utils`                                                                           |       1 | `cn@^0.3.0` (we deviate — D8)                                       | —                                                             |

`combobox` has **no registry item** (HTTP 404); it is the documented
`popover` + `command` composition.

## Appendix B — the two vendored patches, in full

**B1 — no cookie** (`ui/sidebar/sidebar-provider.svelte`, D6):

```ts
setOpen: (value: boolean) => {
	open = value;
	onOpenChange(value);
	// MELLON PATCH (SHADCN.md §5.2): no cookie. Rails persist in localStorage
	// (§11.1 / rails.svelte.ts) — nothing server-side reads this.
};
```

**B2 — ⌘B guard** (`ui/sidebar/context.svelte.ts`, D5): see task 2.5.

## Appendix C — command reference

```sh
# vendor an item (CLI path)
npx shadcn-svelte@1.8.1 add <item> [<item>…]

# vendor an item (fallback path, 1.2)
node scripts/shadcn-add.mjs <item> [<item>…]

# normalization must always be empty
grep -rn '\$UTILS\$\|\$UI\$\|\$HOOKS\$\|\$LIB\$\|@lucide/svelte\|\$lib' src/lib/components/ui

# no native select, ever
grep -rc '<select' src --include='*.svelte' | grep -v ':0' || echo clean

# gates, standalone, in order
npx prettier --check .
npx eslint .
npm run check
npm run test:unit
npm run build
```
