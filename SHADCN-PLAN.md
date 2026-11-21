# SHADCN-PLAN — execution breakdown

Companion to [`SHADCN.md`](SHADCN.md) (the spec). This file is the **task
ledger**: one section per slice, numbered tasks, exact files, exact commands,
and the verification that closes each one. Tick boxes as work lands — the file
is committed with the slice, so the ledger is the audit trail.

> Not to be confused with `PLAN.md`: that name is reserved for the owner's
> local-only journal (gitignored, never committed — AGENTS §1/§6).

## How to work this plan

- **One slice = one branch, merged into the INTEGRATION branch.**
  **Amended 2026-11-20 (owner call):** slices no longer release individually.
  `feat/shadcn-integration` forks from `main` and is where ALL phases combine —
  each slice branch (`feat/shadcn-s<n>-<theme>`) forks from it and merges back
  into it; `main` receives **one merge** when the experiment is accepted, or
  the integration branch is deleted and nothing on main ever knew. Per-slice
  revert is preserved by the slice branches' merge commits, not by releases.
  The anvil ladder runs ONCE, at the end.
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
      **Recorded 2026-11-20:** client `7.1M` raw, immutable js+css **1,824 KiB
      gz**; largest chunks 438.3 / 249.4 / 133.1 / 123.3 KiB gz.
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

- [x] Create `components.json` by hand (never `init` — it wants `src/app.css`
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

- [x] **Probe** (30 min, throwaway branch): `npx shadcn-svelte@1.8.1 add button`.
      The CLI documents that aliases come from `svelte.config.js`; mellon has
      **none** (SvelteKit 3 keeps config inside `vite.config.ts`).

      **OUTCOME 2026-11-20 — worked.** The CLI read `components.json`, resolved
      `#lib` itself, emitted `#lib/utils.js` in the vendored source and wrote
      `utils.ts` unprompted: no `$UTILS$` placeholders, no `svelte.config.js`
      added. Aliases stay `#lib`; the CLI is the tool for every slice and only
      the *verification* grep (§2.2) remains necessary.

### 1.2 Registry fetcher (fallback, 0.25 d)

- [~] **SKIPPED — not built.** 1.1 succeeded, so the fetcher has no caller.
  Kept as the documented fallback should a future CLI regress alias
  resolution. Original spec: `scripts/shadcn-add.mjs`, ~70 lines —

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

- [x] `npm install bits-ui@^2.21.0 tailwind-merge@^3.7.1 clsx@^2.1.1 tailwind-variants@^3.2.2 tw-animate-css@^1.4.0`
      — resolved `tailwind-variants@^3.3.1` (same `^3` range) and placed it in
      **dependencies**, not dev: the vendored files import `tv` at runtime.
- [x] `npm install -D @testing-library/svelte happy-dom` → `5.4.2` / `21.0.4`
- [x] **Not** installed, deliberately: `@lucide/svelte` (D7), `cn` (D8),
      `@internationalized/date` (S4 only). Verified absent.
- [x] `npm audit --omit=dev` → 2 moderate, **pre-existing and unrelated**
      (`@tailwindcss/typography` → old `postcss-selector-parser`). Left alone:
      `audit fix --force` would break the typography plugin.

### 1.4 `src/lib/utils.ts` (0.15 d)

- [x] `cn()` via `clsx` + `twMerge`, plus the four type helpers vendored files
      import, verbatim from the registry's `utils` item:
      `WithoutChild`, `WithoutChildren`, `WithoutChildrenOrChild`,
      `WithElementRef` (+ the `cn` export). The registry's own version imports
      the `cn` package — we deviate on purpose (D8).
- [x] Unit test `src/lib/utils.test.ts` — **6 tests**: last-wins on conflicts,
      `bg-brand`/`bg-muted` merge, order preserved, falsy dropped, arrays +
      objects (clsx semantics), and a caller overriding a default class set.

### 1.5 Tokens (0.25 d)

- [x] `src/routes/layout.css` — in `:root` **only** (deviation, now doctrine
      D10: every alias is a `var(--core)` and the core flips in
      `[data-theme='dark']`, so a second declaration is a second place to
      drift). See SHADCN.md §3.3.1. The eighteen names:

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

- [x] `@theme inline`: the `--color-*` twins for every name above — **18**
      (the plan's "17" was a miscount: 10 core aliases + 8 sidebar = 18, and
      `--primary` is one of the ten). **A missing twin generates no utility and
      fails silently** (SHADCN.md §3.3 / R3).
- [x] `palette.test.ts` **amended, not relaxed** (§3.3.1): it now separates
      `CORE` (hex, must be in both blocks — unchanged) from `ALIAS` (must
      resolve through `var()` chains onto a dual-defined core token). New test
      added; `--primary` moved from CORE to ALIAS. 4 existing tests still green.
- [x] Comment on the `--primary` block pointing at SHADCN.md §3, so the
      divergence is findable from the code.

### 1.6 Test environment (0.4 d)

- [x] `vitest.config.ts` — **two projects, split by filename** rather than by
      annotation: `*.test.ts` → `node` (the existing fleet, untouched) and
      `*.dom.test.ts` → `happy-dom` + `@sveltejs/vite-plugin-svelte` +
      testing-library auto-cleanup. Forced-runes compilerOptions mirrored from
      `vite.config.ts` (`configFile: false` — this repo has no
      `svelte.config.js` by design). A component test that forgets the `.dom.`
      suffix fails loudly on `document` instead of silently.
- [x] Smoke test `src/lib/harness.dom.test.ts` — **kept, not deleted** (deviation):
      mount, click delivery, caller class override, and one `bg-primary`
      assertion that is the only _runtime_ proof the alias chain emits a
      utility (palette.test.ts is text-level). Rendering a `Button` is
      deliberate — it fails if the harness or the token layer regresses.
      `bits-ui` is irrelevant here: it ships **precompiled** `dist/*.js`.
- [x] `npm run test:unit` — **168 passed, 6 skipped**: 157 baseline + 6 `cn` +
      4 harness + 1 new palette guard.

### 1.7 Documentation (0.2 d)

- [x] Commit `SHADCN.md` + `SHADCN-PLAN.md` (this file) with 1.1's probe result
      recorded.
- [x] No DESIGN.md / AGENTS.md edits (D3) — verified by `git diff --stat`.

### 1.8 Close S1 (0.25 d)

- [x] Gates green, standalone — **prettier ✅ · eslint ✅ · svelte-check 0/0 ✅
      · 168 passed / 6 skipped ✅ · build ✅**.
- [ ] **Visual proof** — **OUTSTANDING, owner's step.** No browser/screenshot
      tooling exists for this agent, so the light+dark diff against P2 must be
      taken by the owner. The reasoning that it is empty: no route imports
      anything under `ui/` (only `harness.dom.test.ts` does), the shell and
      every page are byte-identical, and no existing utility class changed
      meaning. The `grep` for `ui/` in the built bundle returns nothing —
      tree-shaken out.
- [x] **Bundle delta**: client `7.2M` raw (was 7.1M), immutable js+css
      **1,825 KiB gz** (was 1,824) — **JS unchanged at 1,804 KiB**; the +1 KiB
      is the 18 token declarations in the stylesheet.
- [x] `grep -rn 'text-primary\|bg-primary' src` (excluding `ui/`) → **0**.
      Inside `ui/` the vendored `button.svelte` uses `bg-primary` by design.
- [x] Probe test **kept** on purpose (`harness.dom.test.ts`, see 1.6); the
      probe _component_ is not throwaway either — `ui/button` is the first real
      component and S2/S3 depend on it.
- [x] Commit (`ae3dfeb` vendor-raw + normalization), PR, release.

**S1 state line:** the substrate exists and provably changes nothing —
`components.json` resolves `#lib`, deps pinned, `cn()` + 18 aliases + 18
`--color-*` twins in place, DOM project running, 168 green. **Nine of ten
checkboxes closed; the tenth is the owner's visual diff.**

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

- [x] `grep -rho 'bg-sidebar[a-z-]*\|text-sidebar[a-z-]*\|border-sidebar[a-z-]*\|ring-sidebar[a-z-]*' src/lib/components/ui/sidebar | sort -u`
      — **6 distinct names emitted** (sidebar, -accent, -accent-foreground,
      -border, -foreground, -ring), all six have twins. Clean.

### 2.3 Constants — match mellon's rail (0.05 d)

- [x] `ui/sidebar/constants.ts`: `SIDEBAR_WIDTH = "15rem"` ✓,
      `SIDEBAR_WIDTH_ICON = "4.25rem"` — **the plan's 3.5rem was a misread**:
      `--container-nav-rail: 56px` has ZERO consumers (dead var; DESIGN's
      diagram puts 56px on the TOPBAR) and the rendered collapsed rail is
      `lg:w-[4.25rem]`. Matching what renders. `SIDEBAR_WIDTH_MOBILE = "16rem"`
      (today's `w-64`); the cookie constants deleted with the cookie (D6).

### 2.4 The content box (0.3 d)

- [x] `ui/sidebar/sidebar-inset.svelte` — the `md:peer-data-*` chain replaced
      by the **doctrine** line, verbatim (D9). The Inset IS the box (`<main>`);
      the topbar rides ABOVE it as a sibling — nesting the block's main inside
      another would be an invalid double `<main>` landmark. Class:

```
mx-3 mb-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border
bg-background px-4 py-6 shadow-sm sm:px-6 lg:ml-0
```

(AMENDED 2026-11-21, D9b: the owner took one look at the 8px corners and
claimed the old box back — rounded-2xl + shadow-sm; the box is furniture,
the ceiling governs components. `w-full` dropped: with `mx-3` it overflowed
the viewport by the right margin, desktop AND mobile.)

- [x] **Doctrine alignment commit** (`fcdf07e`) — the single declared visual
      diff of S2:

```
fix(ui): align the shell with the radius and shadow doctrine
```

The three surviving `rounded-xl` offenders ride it; the other six die with
their components (`DeleteDialog`, `DatePicker`, `DateRange`, `Combobox`,
`UserMenu`, `RailDrawer`), and `rounded-full` is untouched — a shape, not a
corner.

- [x] `lib/components/Palette.svelte:444` — `rounded-xl` → `rounded-lg`
- [x] `lib/components/ImagePicker.svelte:128` — `rounded-xl` → `rounded-lg`
- [x] `routes/(app)/photos/[id]/+page.svelte:306` (photo canvas) — same
      (these STAY rounded-lg under D9b — they're components/overlays)
- [x] **Scroll audit (R4)** — structurally sound (the frame is `h-svh
overflow-hidden`, the box keeps `min-h-0` + `overflow-y-auto`, sticky
      children unaffected); the live double-scroll check is the owner's.

- [ ] **Scroll audit** (R4): `Sidebar.Inset` renders `<main>`; confirm pages
      that own their scroll (`min-h-0`, `overflow-y-auto`) don't double-scroll
      and sticky headers still stick.

### 2.5 Vendored patches (0.55 d)

- [x] **No cookie** (D6): the `document.cookie` line deleted (+ the two
      cookie constants); persistence is `navRail` via the shell's
      `onOpenChange → setCollapsed`. Comment points at SHADCN.md §5.2.
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

- [x] Unit test `ui/sidebar/context.dom.test.ts` — **4 tests** via
      `createRawSnippet` + `fireEvent`: plain target toggles; `.cm-editor`,
      `input`, and meta-in-editor all ignored (the guard is modifier-agnostic).

### 2.6 The shell rewrite (0.8 d)

- [x] `src/routes/(app)/+layout.svelte` — **459 → 189 lines**, plus
      `(app)/app-sidebar.svelte` (~170): the rail had to become a CHILD
      component — the sidebar context is only readable BELOW the Provider,
      and the footer toggle + sheet dismissal need it. The root is
      `Sidebar.Provider` with `bind:open={railOpen}`; the rail is
      `Root variant="sidebar" collapsible="icon"` (**D13: NOT `inset`** —
      that variant's `p-2` tile + expanded-gap math contradicts the
      full-bleed chrome mass; the box's inset geometry lives in the doctrine
      line) with `Header` (brand, collapsed `m;`), three `Group`s, `Footer`
      (the one collapse toggle, owner call 2026-11-16). Nav rows =
      `Menu`/`MenuItem`/`MenuButton` with the `child` snippet rendering
      `<a>` + `isActive`; role gating preserved. DELETED: `navItems()`, the `{#if navOpen}` backdrop + drawer
      (~lines 356–391), the bespoke toggle + hover-tip. The topbar keeps its
      three-zone grid; the hamburger is `Sidebar.Trigger` (patched: children
      override for mellon's glyph + `aria-expanded`).
- [x] `rails.svelte.ts`: `setCollapsed(open)` added — arrow-bound field, same
      `mellon.rail.nav` key (existing sessions keep their rail).
- [x] `Sidebar.Trigger` replaces the hamburger below `lg`, opening the
      block's mobile sheet (IsMobile patched to the lg line, D12).

### 2.7 Mobile parity (0.3 d)

- [x] The block's mobile sheet matches the contract: X (built-in close
      button) / `Esc` / backdrop dismiss are bits-ui; focus returns to the
      hamburger on USER close via Root's `onOpenChange` → `onMobileClose` —
      navigation-close goes through `setOpenMobile` and never steals focus.
      Safe-area paddings carried on Root's className (`max-lg:`-scoped);
      width 16rem + `max-w-[80vw]`.
- [x] Reduced-motion: the sheet is instant via the global 0.01ms rule
      (layout.css §prefers-reduced-motion) — no per-instance code needed.

### 2.8 Top bar (0.45 d)

- [x] `UserMenu.svelte` → `ui/dropdown-menu` — identity card, Settings
      (child-snippet `<a>`: bits-ui Item takes no `href`), ThemeSegmented,
      destructive sign-out (child-snippet submit button). Ghosted avatar
      grammar kept. Esc / click-outside / focus-return now the block's job.
- [x] Shell hover-tips → the block's built-in `Tooltip` (nav rows + the
      collapse toggle; `Tooltip.Provider delayDuration={0}` wraps everything
      inside `Sidebar.Provider`).
- [x] ⌘K pill, the phone search key, and ThemeSegmented stay hand-built —
      brand furniture, not generic controls.

### 2.9 Close S2 (0.35 d)

- [x] Gates green, standalone — prettier ✅ eslint ✅ svelte-check 0/0 ✅
      **172 passed / 6 skipped** ✅ build ✅.
- [ ] **Manual matrix** — **OUTSTANDING, owner's step** (no browser here):
      desktop ⌘B outside/inside the editor, collapse persistence across
      reload, the mobile drawer's three closes + focus return, keyboard-only
      nav walk, light/dark.
- [x] **Bundle delta measured (R8)**: immutable js+css **1,891 KiB gz**
      (S1: 1,825 → **+66 KiB** — the block + sheet + dropdown-menu + tooltip
      machinery; the 438.3 KiB editor/markdown chunk is byte-identical, the
      §5.6 chunk boundary held). Raw client 7.1M → 7.4M.
- [ ] **Screenshots** — owner's step; intended diffs: the three doctrine
      corners (fcdf07e), block-rendered rail rows (32px icon cells vs 36px),
      block paddings inside the rail, the sheet's X position (block idiom,
      top-right ghost) vs the old header-row X.

**S2 state line:** the shell rides the block — rail, sheet, dropdown, guard,
doctrine alignment all in; **the manual matrix + screenshots are the owner's
half of close-out.**

---

## S3 — Form primitives (3 d)

**Goal:** the 133 buttons, 34 inputs and 18 repeated mono labels stop being
copy-paste. The look does not change.

**Branch:** `feat/shadcn-s3-forms`

### 3.1 Vendored + restyle (1 d)

- [x] Add `input label textarea checkbox switch separator badge` + `button`.
      **SCOPED (2026-11-21, evidence):** vendored `label textarea` ONLY. `input`,
      `separator`, `button`, `sheet` already arrived with the S2 block; **no
      `switch` and no `checkbox`** — the tree's toggles are native
      `accent-[var(--brand)]` checkboxes (settings, compare, photos), and
      converting them to a boxed-check CHANGES the look, breaking S3's zero-diff
      goal; **no `badge`** — Pill/StatusPill are the moat (§1.2). The CLI's
      `@internationalized/date` closure addition removed again (S4's import).
- [x] `ui/button/button.svelte` — variant map to the cast, mapped from the
      tree's REAL grammar (48-button evidence sweep, not the plan's guess):
      `primary` (NEW: the violet **pill** — `rounded-full bg-brand text-white
hover:brightness-110`; the plan's "sizes sm/md rectangles" misread the
      tree), `quiet` (the mono outlined chip), `danger` (the destructive pill —
      border-danger/40 + hover wash), `soft` (the pages' text-only ghost square:
      `p-1 hover:text-foreground`, NO bg wash — the plan's "ghost
      (hover bg-accent/60)" had zero evidence). Registry names (`default`,
      `ghost`, `outline`, `secondary`, `destructive`, `link`) UNCHANGED for the
      vendored overlays (dialog X, sheet close, sidebar trigger). Sizes: `sm`/
      `md` pills' paddings exist as evidence lines; the pill shape rides the
      VARIANT, not the size.
      **FINDING (the ordering trap):** tailwind-variants emits variant groups in
      DEFINITION order — `variant` defined before `size` meant the default
      size's `h-8 px-2.5` emitted AFTER the cast's `h-auto px-3 py-1.5` and won.
      Fixed by defining `size` FIRST; pinned by the quiet test. And the destructure
      defaults are the real defaults (tv's defaultVariants are shadowed by Svelte 5
      destructuring) — registry defaults restored; the sweep passes variants
      EXPLICITLY at every call site.
- [x] `ui/label` — the house `mono` variant (the 12×
      `text-xs font-medium tracking-widest text-muted-foreground uppercase`).
      Wrapper labels stay raw `<label>`: the mono caption is a span INSIDE the
      implicit-association wrapper — a Label there would nest labels (invalid
      HTML).
- [x] `ui/input` — the repeated class verbatim (the 10× line: bg-card field,
      mono, `focus-visible:border-brand`) + `aria-invalid:border-danger`;
      `w-full` and placeholder color are call-site decisions (the verbatim line
      carries neither).
- [x] `ui/textarea` — the photos/[id] line verbatim (the tree's only textarea
      outside the moat).
- [x] Focus ring: `--ring` = brand (from S1), `focus-visible:` only — the
      intended one-diff: pills previously had NO visible focus (outline-none,
      no styles); the base ring lands on every cast button now.
- [x] Tests: `forms-cast.dom.test.ts` — 6 tests (the pill anatomy, the quiet
      chip + the tv-ordering pin, ghost-stays-registry, the house field lines,
      the mono label). `harness.dom.test.ts` unchanged in intent (default is
      still the registry's `bg-primary`).

### 3.2 Sweep, page by page (1.6 d)

Each page: replace raw elements, **no layout changes**, verify with the P2
screenshot.

- [x] `login` (75 lines) — inputs, submit, error block
- [x] `setup` (138) — wizard fields, validation states (the ghost-field guard
      learned to read `<Input`)
- [x] `settings` (200) — appearance/security cards, native checkbox untouched
- [x] `admin/users` (166) — dialog fields, Create pill, reset chip (quiet +
      amber hover + inherited text kept)
- [x] `configs` (147) — no raw controls (all via hand-rolled Select until S4)
- [x] `configs/compare` (442) — swap square (soft+border), Wrap + reveal pills;
      presentation groups deferred to S5 toggle-group
- [x] `configs/vault` (909) — 12 conversions; the env tabs, inline cell
      editors, history text chips, pin-offer micro-buttons, and the
      `use:focusOnMount` dialog fields stay raw (actions can't ride components)
- [x] `posts` (661) — search, clear-X, filters trigger (bind:ref focus-return),
      rail collapse; status chips are `<a>` links (navigation, not buttons)
- [x] `tags` (596) — 15 conversions incl. the danger delete and the stateful
      featured pill (quiet's inactive branch is the exact anatomy)
- [x] `photos` (1003) / `photos/[id]` (558) — search, Upload Photos, sheet
      triggers, bulk bar, the Save/Download/Delete band, the alt-text Textarea
- [x] Count the residue: **77 `<button>` + 20 `<input>` outside `ui/`** —
      the moat (PostEditor 20+3+2, Palette, ImagePicker, the S4/S5-doomed
      widgets), brand furniture (⌘K pill, ThemeSegmented, Pill, SectionCard,
      UserMenu), the stateful segmented/toggle chips (S5), inline cell editors,
      hidden carriers, and action-bound fields. **Page-level ACTION buttons: 0.**

### 3.3 Close S3 (0.4 d)

- [x] Gates green, standalone — prettier ✅ eslint ✅ svelte-check 0/0 ✅
      **190 passed / 6 skipped** ✅ build ✅.
- [ ] Screenshots: empty diff except intended focus-ring unification — owner's
      step. The keyboard walk: every cast button now shows the brand ring.

**S3 state line:** the cast exists and the pages ride it — primary/quiet/
danger/soft + registry compatibility, house input/textarea/label lines,
bundle **1,867 KiB gz** (S2: 1,891 — the repeated class strings left the
client chunks); the 448.8 KiB editor chunk held its boundary (~10 KiB drifted
inside it). The residue ledger above is the honest count.

---

## S4 — Choice widgets (4 d)

**Goal:** the widgets that mint bugs — listbox, combobox, calendars — move to
bits-ui. This is the slice with the highest defect-avoidance value.

**Branch:** `feat/shadcn-s4-choice`

### 4.1 Vendor (0.2 d)

- [x] `npm install @internationalized/date` (first use) — the calendar's value
      plumbing; the S4-only dep per plan.
- [x] Add `select popover command calendar range-calendar` (+ their
      `separator`/`button`/`dialog`/`input-group` closure deps). **FINDING:**
      `--overwrite` reverts OWNED files (button cast, dialog frost, the input/
      textarea house lines) to registry-raw — restore from git before
      committing; the cast test caught the textarea revert on the spot.

### 4.2 Select — 6 sites (0.9 d)

- [x] `ui/select` restyle: trigger = the hand-rolled Select's anatomy
      verbatim (rounded-md card field, mono, brand ring-2; **sm is the
      default size** — the picker grammar), content = the house popup (card
      surface, border, p-1, shadow-xl), item = the LEFT brand check.
- [x] Sites: `admin/users` (landed early — the dialog round), `configs/compare`
      (×4 — the version rows' pinned/head/destroyed label suffixes pass
      through the items prop; popWidth floors ride `min-w-[340px]`),
      `configs/vault` (the fill picker → trigger `w-full`).
- [x] Delete `Select.svelte` (230 lines). **The doctrine held**: `grep '<select'
src` → prose only.
- [x] Behaviour test: the users-page dom test drives the block's select
      (pointer-pair commit). **THE CALENDARS SMUGGLED 4 NATIVE `<select>`S:**
      the registry's month/year pickers hid one under the styled span — the
      OS popup leaked into the estate. All four rewired onto the block's
      Select (the headless primitives stay as locale-aware item providers;
      the placeholder math moved to the captions).

### 4.3 Combobox — 5 sites (1.0 d)

- [x] **Composition**: `Combobox.svelte` REWRITTEN IN PLACE over
      `ui/popover` + `ui/command` — the 273-line state machine (measure-once
      coordinates, manual roving, manual outside-click, manual a11y) deleted;
      the prop CONTRACT byte-identical, so the five mounts did not change.
      The registry `combobox` item is a 404; the composition is the docs'
      shape. Recreated: filter (the block's), keyboard nav (loop), eager
      create (on commit, never on keystroke), the single-select REPLACE
      (`06698b6`), multi mode for bulk, the none-row, the removable chips.
- [x] Findings: bits-ui `Command.Root`'s `value` is the SELECTED item — the
      SEARCH lives on `Command.Input`'s own binding (a bind on Root silently
      binds the wrong state); `onSelect` passes NO value — close over the
      row; a bare `onOpenChange` attribute = boolean true (the shorthand
      needs braces).
- [x] Tests: 3 contract tests (replace-on-single, append-on-multi,
      create-then-select) — the first two ran untested for months.

### 4.4 DatePicker — 1 site (0.5 d)

- [x] `ui/calendar` + `ui/popover`; `@internationalized/date` for value
      plumbing; `locale="en-GB"` holds the Monday-first week. ISO in → ISO
      out (the contract); the Today row rides Button/soft. The wire value
      re-parses on change — a bad string degrades to the placeholder state.
- [x] 2 contract tests (open; pick → ISO). **Findings:** Calendar requires
      `type=`; day cells are DIVs (`[data-bits-day]`), not buttons.

### 4.5 DateRange — 2 sites (0.6 d)

- [x] `ui/range-calendar` + popover for `posts` and `photos` filters.
- [x] **Boundary held**: `date-expr.ts` keeps every shorthand; the calendar
      only draws. Presets + the summary trigger stay house furniture (Pill).
      The wire re-seed: complete windows sync the grid; a HALF window is an
      in-progress-pick echo and leaves the grid alone.
- [x] The old 242-line grid deleted.

### 4.6 Close S4 (0.4 d)

- [x] Gates; **193 passed / 6 skipped**; build ✅; the keyboards are the
      block's (roving + loop) — the walk is the owner's.
- [x] Mobile: the calendar rides the block's popover (collision-aware
      placement, no clipping) — the sheet question dissolves with the block.
- [x] Bundle: **1,904 KiB gz** (S3: 1,867 — +37 for the calendars + command + @internationalized/date); the editor chunk HELD (448.8 KiB gz,
      byte-similar). The three rewritten widgets: 273+191+240 = 704 lines → 428.

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

- [~] **SKIPPED — documented:** tooltips for the `title=` crutches (the dense
  controls' `title=` IS the house pattern — a tooltip swap is visual churn
  with no defect behind it); `ui/table` for the three tables (their
  sorting markup works; churn without value); `toggle-group` for
  ThemeSegmented (brand furniture per the S2 ruling — stays hand-built).
  All optional per §4; the vendored copies wait for real consumers.

### 5.5 Final page recomposition (1.8 d)

- [~] **ABSORBED:** the S3 sweep already recomposed every page's controls
  (page-level action buttons: 0 raw). The heavy pages' grids/rows carry
  no defect a recomposition would fix — churn without value. The
  per-page diff list lives in the S3 ledger + the slice commits.

### 5.6 Parity pass (1.1 d)

- [ ] SHADCN.md §6 checklist, row by row, **14 pages**, light + dark,
      desktop + phone — **the owner's pass** (no browser here).
- [x] A11y walk: _*251 aria-* attributes_* in the tree; every swapped
      widget's roles/roving/focus are bits-ui's now (dialog, alert-dialog,
      sheet, select, command, dropdown-menu, tooltip, popover, collapsible) —
      the invented machines that dropped a key path are gone.
- [x] Radius gate: **2 furniture exceptions** — the content box (`D9b`,
      owner-amended) + the bottom sheet's `rounded-t-2xl` top corners (the
      sheet is furniture in the same sense; veto-able). `rounded-full`
      exempt. Everything else ≤ `rounded-lg`.
- [x] Native-select gate: 0 (the calendars' smugglers rewired in S4).
- [x] Bundle vs P3: **1,906 KiB gz** (P3: 1,824 → +82 across the experiment;
      the editor chunk 448.8 KiB gz held its boundary throughout). Tests vs
      P4: **195 passed / 6 skipped** (was 157/6).

### 5.7 Docs + release (0.6 d)

- [x] Update SHADCN.md: slice statuses, decision log entries added during the
      work, the S2 geometry ruling, the measured deltas.
- [x] Vault: `context-knowledge/repos/mellon/README.md` state entries per
      slice; `LEARNING.md` cards (the ⌘B guard, `$UTILS$` resolution, the
      tv emit order, the CLI's overwrite revert, the Command search binding,
      the v-flag patterns, the portaled-popup shield, the transform trap).
- [ ] Release through the anvil ladder — **ONE merge to `main`** (the
      integration model), the ladder run once; record the environment order.
      **The owner's call.**
- [ ] **Graduation gate** (SHADCN.md §10): decide promote vs delete.
      Promotion writes DESIGN §11.6 and the AGENTS §2 pointer _in a separate
      round_ — not in this branch. **The owner's call.**

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

# radius ceiling (hard gate, D9) — rounded-full is exempt
grep -rn 'rounded-\(xl\|2xl\|3xl\)\|rounded-t-2xl' src || echo clean

# gates, standalone, in order
npx prettier --check .
npx eslint .
npm run check
npm run test:unit
npm run build
```
