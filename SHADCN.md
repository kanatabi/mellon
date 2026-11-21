# SHADCN — the component-substrate experiment

> **STATUS: EXPERIMENT — owner-approved 2026-11-20. NOT DOCTRINE.**
>
> [`DESIGN.md`](DESIGN.md) remains authoritative for look, behaviour, and
> doctrine (§2 the doctrine itself, §11 the instrument's anatomy). This file is
> the spec for the **component layer** while the experiment runs; the task
> breakdown lives in [`SHADCN-PLAN.md`](SHADCN-PLAN.md).
>
> Two exits only:
>
> - **Graduate** — the surviving rules move into DESIGN.md as §11.6, this file
>   and the plan are deleted, and `AGENTS.md` §2 gains the pointer.
> - **Abandon** — both files are deleted **with** `src/lib/components/ui/`, and
>   the deleted hand-rolled components come back from git.
>
> Until then: no cross-links from DESIGN.md or AGENTS.md, because an experiment
> that edits the constitution stops being an experiment.

---

## 0. Why we are doing this

Mellon's UI layer is ~4,200 lines of **invented** state machines: a listbox, a
combobox with eager-create, two calendars, a focus-trapping dialog, a sheet, a
hover menu, a dropdown. Every one of them re-solves problems that
[bits-ui](https://bits-ui.com) (via shadcn-svelte) has already solved with
tests, a11y audits, and years of bug reports — and each has already produced at
least one bug here (the combobox append-instead-of-replace, the vim mode badge,
the theme wash).

The case is **not** "less code" — see §4.3, the vendored footprint is _larger_.
The case is: behaviour we don't have to invent, and a house-style surface we
keep designing.

## 1. Scope

### 1.1 Moves to shadcn/bits-ui

| mellon component                                              |                          lines | becomes                                                                         |
| :------------------------------------------------------------ | -----------------------------: | :------------------------------------------------------------------------------ |
| `Select`                                                      |                            201 | `ui/select` (bits-ui)                                                           |
| `Combobox`                                                    |                            273 | `ui/popover` + `ui/command` composition                                         |
| `DatePicker`                                                  |                            191 | `ui/calendar` + `ui/popover`                                                    |
| `DateRange`                                                   |                            240 | `ui/range-calendar` + `ui/popover` (expression parsing STAYS in `date-expr.ts`) |
| `DeleteDialog`                                                |                            149 | `ui/alert-dialog`                                                               |
| `RailDrawer`                                                  |                            162 | `ui/sheet` (or the sidebar block's mobile sheet)                                |
| `UserMenu`                                                    |                            118 | `ui/dropdown-menu`                                                              |
| `ThemeSegmented` (optional)                                   |                             41 | `ui/toggle-group`                                                               |
| the shell's nav / mobile drawer / collapse toggle / hover-tip | ~150 of `(app)/+layout.svelte` | `ui/sidebar` block                                                              |
| every `<button>` / `<input>` / label class                    |                              — | `ui/button`, `ui/input`, `ui/label`, `ui/field` anatomy                         |

### 1.2 Never moves (the moat)

| stays                                                        | lines | why                                                                    |
| :----------------------------------------------------------- | ----: | :--------------------------------------------------------------------- |
| `PostEditor.svelte`                                          | 1,329 | the product; no catalog has an entry for it                            |
| `Palette.svelte`                                             |   555 | modes, tasks, keybinds, eager actions — cmdk would lose the contract   |
| `ImagePicker.svelte`                                         |   286 | library + upload + insert-in-post choreography                         |
| `CodeMirrorEditor.svelte`                                    |   275 | CodeMirror is its own island (§11.3 syntax palette)                    |
| `Pill`, `StatusPill`, `SubCrumb`, `SectionCard`, `Watermark` |   272 | these _are_ the language; they have no generic counterpart             |
| all relay/wire code (`#lib/api/**`)                          |     — | untouched by any of this — shadcn is a UI dependency, never a data one |

`PostEditor` **call sites** change (it renders `Select`, `DatePicker`,
`Combobox`, `DeleteDialog`, `RailDrawer`); its own logic does not.

## 2. Target architecture

```
src/lib/
├── utils.ts                    ← cn() + the five type helpers the registry imports
├── hooks/
│   └── is-mobile.svelte.ts     ← sidebar block dependency
└── components/
    ├── ui/                     ← VENDORED, owned, restyled (never shipped raw)
    │   ├── sidebar/  select/  command/  calendar/  range-calendar/
    │   ├── dialog/  alert-dialog/  sheet/  dropdown-menu/  popover/  tooltip/
    │   └── button/  input/  label/  textarea/  checkbox/  switch/
    │       separator/  skeleton/  badge/  table/  toggle/  toggle-group/
    └── …                       ← the moat (§1.2), unchanged
```

### 2.1 Three laws of vendored code

1. **We own it.** Files under `ui/` are ordinary source: restyle, patch, delete
   sub-parts. There is no upgrade path and no expectation of one.
2. **Never shipped raw.** Every item is `add`ed, **normalized**, **restyled**,
   then reviewed. An unmodified shadcn file in the tree is a bug — it means the
   preset pass was skipped.
3. **Upstream is a starting point, not an authority.** When a vendored file and
   a DESIGN rule disagree, DESIGN wins and the file changes (`--sidebar-border:
transparent` is the canonical example: the block draws borders, the shell
   forbids them).

### 2.2 Normalization (mechanical, scripted)

The registry uses placeholders the CLI substitutes. Because mellon's alias is
`#lib` (a package.json `imports` entry, load-bearing for the runtime image) and
`$lib` is not used anywhere, **every** vendored file is normalized:

| from                          | to                                                               |
| :---------------------------- | :--------------------------------------------------------------- |
| `$UTILS$`                     | `#lib/utils`                                                     |
| `$UI$`                        | `#lib/components/ui`                                             |
| `$HOOKS$`                     | `#lib/hooks`                                                     |
| `$LIB$`                       | `#lib`                                                           |
| `@lucide/svelte/icons/<name>` | `lucide-svelte/icons/<name>` (we already ship `lucide-svelte@1`) |

Verification is one grep per slice: `grep -rn '\$UTILS\$\|\$UI\$\|\$HOOKS\$\|@lucide/svelte\|\$lib' src/lib/components/ui` → empty.

**Probe result (S1, 2026-11-20): the CLI does the substitution itself.** With
no `svelte.config.js` present, `shadcn-svelte@1.8.1 add button` resolved the
`#lib` alias from `components.json` and wrote `#lib/utils.js` into the vendored
source unprompted — zero placeholders, no post-processing. So the table above
is a **verification** step, not an edit step, and the fallback registry fetcher
(plan 1.2) is dead code: not built. Note it emits `#lib/utils.**js**`, which
resolves to `utils.ts` through the `imports` map — expected, not a typo.

### 2.3 Footprint — the honest number

Measured from the registry (`registry/{item}.json` → `files[]`), the full item
set in this plan is **≈190 files / ≈8,000 lines** vendored, against
**≈1,500 lines** deleted. **The tree gets bigger, roughly 5× in the UI layer.**

That is the trade: fewer invented state machines, more small declarations we
own. Anyone selling this as a line-count reduction has not counted. The thing
that shrinks is `git blame` on accessibility bugs.

## 3. Tokens

### 3.1 The `--primary` handover (measured: zero consumers)

shadcn's `--primary` means **action fill**. Mellon's `--primary` means **ink**,
inherited from earendil's token contract. Measured in this repo:

```
text-primary / bg-primary / border-primary / ring-primary / fill-primary → 0 uses
text-foreground                                                        → 181 uses
```

So ink is already spoken as `--foreground` everywhere, and `--primary` is a
declared-but-unused name. The handover is therefore free:

```css
--primary: var(--brand); /* shadcn: action fill */
--primary-foreground: var(--background);
```

`DESIGN.md` is **not** edited for this (owner ruling 2026-11-20: experiment).
If the experiment graduates, §3's token contract gains the amendment; if it
fails, the two lines above are reverted and nothing else notices.

### 3.2 The nine core aliases

`--secondary`, `--secondary-foreground`, `--popover`, `--popover-foreground`,
`--primary-foreground`, `--input`, `--ring`, `--destructive`,
`--destructive-foreground` — all mapped onto existing mellon tokens
(`--muted`, `--card`, `--border`, `--brand`, `--danger`, `--background`).

### 3.3 The eight sidebar tokens

| token                               | value                                 | note                                             |
| :---------------------------------- | :------------------------------------ | :----------------------------------------------- |
| `--sidebar`                         | `var(--chrome)`                       | the wall behind the lit panel                    |
| `--sidebar-foreground`              | `var(--foreground)`                   |                                                  |
| `--sidebar-primary` / `-foreground` | `var(--brand)` / `var(--background)`  |                                                  |
| `--sidebar-accent` / `-foreground`  | `var(--accent)` / `var(--foreground)` | hover wash                                       |
| `--sidebar-border`                  | `transparent`                         | **§11.1: one chrome mass — no internal borders** |
| `--sidebar-ring`                    | `var(--brand)`                        |                                                  |

Plus the Tailwind v4 mapping in `@theme inline` — a token without a
`--color-*` twin generates no utility, and the failure is silent:

```css
--color-sidebar: var(--sidebar);
--color-sidebar-foreground: var(--sidebar-foreground);
--color-sidebar-primary: var(--sidebar-primary);
--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
--color-sidebar-accent: var(--sidebar-accent);
--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
--color-sidebar-border: var(--sidebar-border);
--color-sidebar-ring: var(--sidebar-ring);
```

Same requirement for the nine core aliases (`--color-popover`, `--color-input`,
`--color-ring`, `--color-destructive`, `--color-secondary`, …). **Built and
guarded in S1**: `palette.test.ts` now walks every alias's `var()` chain and
asserts it lands on a dual-defined core token, so a typo'd referent fails the
suite instead of silently rendering the wrong color.

### 3.3.1 Aliases are declared ONCE, in `:root` (S1 finding)

The plan called for the eighteen aliases in **both** theme blocks. They are in
`:root` only, and that is deliberately stronger, not weaker: every alias is a
`var(--core)` reference, and every `--core` it points at already flips inside
`[data-theme='dark']`. So `--primary: var(--brand)` is `#7c3aed` in light and
`#a78bfa` in dark with **no second declaration** — one place to edit, one place
to diverge.

What this cost: `palette.test.ts` (the "every token in BOTH blocks" guard) had
to learn the difference between a **literal** and an **alias**. Its new rule:

- `CORE` tokens (hex literals) must still appear in both blocks — unchanged.
- `ALIAS` tokens must appear in `:root` and **resolve** (`var(--x)` chains
  followed transitively) to a `CORE` token, or be a theme-agnostic literal
  (`--sidebar-border: transparent`). `--primary` moved from CORE to ALIAS.

The alternative — duplicating aliases into the dark block — would satisfy the
old guard while creating exactly the drift the guard exists to prevent.

### 3.4 What we deliberately do NOT adopt

| not adopted                                   | why                                                                                                                               |
| :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| shadcn's `oklch()` palette                    | mellon's whisper-indigo hex values are the design; only the _names_ are borrowed                                                  |
| `.dark` class switching                       | we use `data-theme` + `@custom-variant dark`; vendored `dark:` utilities work unchanged                                           |
| `--chart-*`, `--sidebar-*` extras beyond §3.3 | no charts; sidebar needs exactly the eight                                                                                        |
| the `cn` npm package (`cn@0.3.0`)             | we implement `cn` with `clsx` + `tailwind-merge` (auditable, no new unknown) and copy the five type helpers vendored files import |
| `SIDEBAR_COOKIE_*` persistence                | §4.3 — localStorage is the rails' documented decision                                                                             |

### 3.5 Geometry and motion policy

- **Radius ceiling is `rounded-lg` for COMPONENTS** (DESIGN §11.3). Vendored
  defaults use `rounded-md` (fine) and `rounded-xl` (reduced at restyle time).
  D9's original sweep gave the tree's ten `rounded-xl`/`rounded-t-2xl`
  instances three fates: six die with the components that own them, three
  (`Palette`, `ImagePicker`, the photo canvas) are edited in S2 — and the
  box was aligned too, until the owner AMENDED it (2026-11-21, D9b): the
  content box is FURNITURE, not a component, and keeps its designed
  `rounded-2xl` + `shadow-sm`. `rounded-full` is **exempt**: 123 uses
  (avatars, pills, dots, the ⌘K pill) are a shape, not a corner radius.
- **Motion stays 150/200ms** and overlays only. `tw-animate-css` is added so
  `animate-in`-style classes in vendored files resolve; any vendored transition
  slower than 200ms is retuned in review. Measured 2026-11-20: the tree has
  **zero** offenders.
- **The content box geometry is the OLD SHIPPED LINE, restored by owner
  amendment (D9b, 2026-11-21)** — D9's original `rounded-lg`-no-shadow ruling
  applied the component ceiling to furniture, and the owner's eye said no:

  ```
  mx-3 mb-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border
  bg-background px-4 py-6 shadow-sm sm:px-6 lg:ml-0
  ```

  Flush top/left at `lg`, the 16px corners, the soft float back. The line
  rides `Sidebar.Inset` (the `md:peer-data-[variant=inset]:*` chain is gone)
  MINUS `w-full` — with `mx-3`, `w-full` overflowed the viewport by the
  right margin and the box touched the screen edge (desktop AND mobile).
  The flex-col stretch sizes the box minus the margins.

## 4. Component policy

| shadcn item                                                |         files | use it?                                                     | where                                                                             |
| :--------------------------------------------------------- | ------------: | :---------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `sidebar`                                                  | 27 (+7 items) | **yes** — the block                                         | the shell (§11.1)                                                                 |
| `button`                                                   |             2 | yes — variant map, not the default look                     | 133 call sites                                                                    |
| `input` `label` `textarea` `checkbox` `switch` `separator` |        2 each | yes                                                         | the 34 inputs, 18 mono labels                                                     |
| `select`                                                   |            12 | yes                                                         | 6 sites (admin/users, configs/compare, configs/vault, PostEditor)                 |
| `popover` + `command`                                      |        6 + 12 | yes — Combobox is a composition (registry `combobox` = 404) | 5 sites                                                                           |
| `calendar` `range-calendar`                                |       19 each | yes — the grid only; `date-expr.ts` keeps parsing           | 3 sites                                                                           |
| `alert-dialog`                                             |            12 | yes                                                         | DeleteDialog ×2 (destructive semantics fit)                                       |
| `sheet`                                                    |            11 | yes                                                         | RailDrawer ×4 (keep the collapsed `· edit` label)                                 |
| `dropdown-menu`                                            |            18 | yes                                                         | UserMenu ×1 (+ future row menus)                                                  |
| `tooltip`                                                  |             6 | yes                                                         | the shell's hand-rolled hover-tip                                                 |
| `badge` `skeleton` `table` `toggle` `toggle-group`         |           2–9 | optional, per slice                                         | where current markup repeats                                                      |
| `form`/`field`/`data-table`                                |             — | **no**                                                      | superlative layers over what we already have; add only if a slice proves the need |

## 5. Interaction rules that survive the port

1. **⌘B is guarded** (owner ruling 2026-11-20). The block binds `mod+b`
   globally; under `@replit/codemirror-vim`, **Ctrl+B is page-up in normal
   mode**. The patch: ignore the shortcut when the event target is inside
   `.cm-editor`, `input`, `textarea`, `select`, `[contenteditable]`, or
   `[role="textbox"]`. Focus decides, not the modifier.
2. **Rails persist in localStorage, never a cookie.** The block's provider
   writes `sidebar:state` on every toggle; that line is removed, and the
   provider is driven by `navRail` (`src/lib/rails.svelte.ts`, 34 lines,
   documented decision 2026-11-08: nothing server-side reads it).
3. **No native `<select>`, ever** (current count: 0 — keep it at 0).
4. **Keyboard-first** (DESIGN §2.4): every swapped widget keeps — or improves —
   its current key contract. `Esc` closes, arrows traverse, `Enter` commits,
   `Tab` never traps, focus returns to the trigger.
5. **Ghost-field untouched**: this experiment never formats, parses, or
   paraphrases a wire value. `axe` on a relayed error is still lumen's copy.
6. **The editor chunk boundary stays** (AGENTS §5): no vendored import may pull
   the markdown/preview stack into the shell chunk.
7. **Two sanctioned surfaces untouched**: no new ingress, no public API — this
   is a client-side dependency change only.

## 6. Parity checklist — run before calling any slice done

Each slice's PR description carries this table with its own rows ticked.

- [ ] **Gates**, standalone and in order: `prettier` → `eslint` → `svelte-check` → `test:unit` → `build` (never chained)
- [ ] **Visual no-op or deliberate diff**: the changed screenshots are attached; anything not intended to change did not change
- [ ] **Light + dark**, every touched page (`data-theme` flip, not just the toggle)
- [ ] **Keyboard-only walk** of the touched surface (Tab / Shift-Tab / Esc / Enter / arrows), focus visible on every stop
- [ ] **Mobile pass** (< `lg`): thumb band, sheets, safe-area insets, no horizontal scroll
- [ ] **Geometry**: one chrome mass, no internal borders, box flush top/left at `lg`, ring on x/bottom
- [ ] **Motion**: 150/200ms, overlays only, `prefers-reduced-motion` instant
- [ ] **Radius ceiling (hard gate)**: `grep -rn 'rounded-\(xl\|2xl\|3xl\)\|rounded-t-2xl' src` → **0 outside the content box** (`sidebar-inset.svelte`'s `rounded-2xl` is the owner-amended exception, D9b). `rounded-full` is exempt
- [ ] **⌘K palette** still opens everywhere and reaches the swapped controls
- [ ] **Normalization grep** empty (§2.2)
- [ ] **No new dependency** beyond the slice's declared list
- [ ] `SHADCN-PLAN.md` checkboxes updated; vault state line written

## 7. Slice ledger

| slice | theme                                                              |   estimate | status                                  |
| :---- | :----------------------------------------------------------------- | ---------: | :-------------------------------------- |
| S1    | Foundation — tokens, `cn`, test env, docs. Zero visual diff        |        2 d | **built** (visual diff pending owner)   |
| S2    | Chrome — the sidebar block replaces the hand-built shell nav       |      3.5 d | **built** (manual matrix pending owner) |
| S3    | Form primitives — Button/Input/Label/Textarea/Checkbox/Switch      |        3 d | **built** (screenshots pending owner)   |
| S4    | Choice widgets — Select, Combobox (Popover+Command), calendars     |        4 d | **built** (keyboard walk pending owner) |
| S5    | Overlays + parity + release — Dialog, Sheet, DropdownMenu, Tooltip |        6 d | **built** (parity + release = owner)    |
|       | **total**                                                          | **18.5 d** |                                         |

Sequence is load-bearing: **S1 first** because it installs the test net and the
tokens that every later slice needs; **S2 second** because it is the largest
single visual change and the cheapest moment to abandon the experiment is
before the content pages are touched.

## 8. Risk register

| #   | risk                                                                                                                             | trigger                                                 | mitigation                                                                                                                            |
| :-- | :------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Identity erosion** — vendored defaults leak through and the console starts looking like every other admin                      | a screen fails §11.5 beside gofar.id                    | §2.1 law 2: restyle is a review gate, not a suggestion                                                                                |
| R2  | **Portal geometry** — overlays mount to `<body>` and detach from the content box                                                 | a popover/select on a rail field floats outside the box | per-overlay `portalProps`/`forceMount` decision recorded in the slice; dialogs may escape, field popovers must anchor                 |
| R3  | **Silent token miss** — a class resolves to nothing because the `--color-*` twin is missing (§3.3)                               | invisible border/text in a vendored component           | **S1 done**: all 18 `--color-*` twins added, `palette.test.ts` gates the pairs, `harness.dom.test.ts` asserts `bg-primary` at runtime |
| R4  | **Double scroll** — `Sidebar.Inset` is a `<main>`; pages own their scroll                                                        | two scrollbars, sticky headers break                    | S2 task 2.4 includes the scroll audit before restyle                                                                                  |
| R5  | **vim/⌘B theft**                                                                                                                 | Ctrl+B pages up in normal mode today                    | §5.1 guard, with a unit test for the predicate                                                                                        |
| R6  | **A11y regressions with no net**                                                                                                 | swapped widget drops a key path                         | S1 installs `@testing-library/svelte` + happy-dom; every swap lands with at least one behaviour test                                  |
| R7  | **Review fatigue** — ~190 vendored files swamp the diff                                                                          | PR is unreviewable                                      | normalization and restyle are scripted and committed as **two** commits per slice (vendored-raw, then normalized+restyled)            |
| R8  | **Dependency creep** — bits-ui + tailwind-variants + tw-animate-css + @internationalized/date                                    | bundle grows                                            | measure shell chunk gz before/after S2; record the delta in the plan; the editor chunk must not move                                  |
| R9  | **Alias friction** — the CLI wants `svelte.config.js` aliases and mellon has none (SvelteKit 3 keeps config in `vite.config.ts`) | `add` fails to resolve `#lib`                           | **RESOLVED in S1**: the CLI reads `components.json` and resolves `#lib` correctly with no `svelte.config.js`; no fetcher needed       |

## 9. Decision log

| #   | date       | decision           | ruling                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :-- | :--------- | :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 2026-11-20 | Migration shape    | **A2** — shadcn substrate, mellon preset. Not A1 (default look), not a full rewrite of every page                                                                                                                                                                                                                                                                                                                                            |
| D2  | 2026-11-20 | Shell              | **adopt the `sidebar` block** (`variant="inset"`, `collapsible="icon"`) rather than keep the hand-built nav                                                                                                                                                                                                                                                                                                                                  |
| D3  | 2026-11-20 | Documentation      | **no DESIGN.md edits** while experimental; this file + the plan are the record                                                                                                                                                                                                                                                                                                                                                               |
| D4  | 2026-11-20 | Slicing            | **five slices**, each independently releasable, each carrying its own pages                                                                                                                                                                                                                                                                                                                                                                  |
| D5  | 2026-11-20 | ⌘B                 | **guard** on text surfaces; vim keeps Ctrl+B inside the editor                                                                                                                                                                                                                                                                                                                                                                               |
| D6  | 2026-11-20 | Persistence        | keep `navRail` localStorage; the vendored cookie line is removed                                                                                                                                                                                                                                                                                                                                                                             |
| D7  | 2026-11-20 | Icon library       | rewrite `@lucide/svelte` → `lucide-svelte` (already shipped, v1) instead of adding a second icon package                                                                                                                                                                                                                                                                                                                                     |
| D8  | 2026-11-20 | `cn`               | implement with `clsx` + `tailwind-merge`; do not add the `cn` npm package                                                                                                                                                                                                                                                                                                                                                                    |
| D9  | 2026-11-20 | Drift vs doctrine  | **doctrine wins.** The content box drops `rounded-2xl` + `shadow-sm`; the radius ceiling is a hard exit gate repo-wide. Six of the ten `rounded-xl` offenders die with their components; `Palette`, `ImagePicker` and the photo canvas are edited in S2                                                                                                                                                                                      |
| D9b | 2026-11-21 | Box = furniture    | **owner amendment:** the content box keeps its designed `rounded-2xl` + `shadow-sm` — the ceiling and the no-shadow rule govern COMPONENTS, not the box. The gate scopes accordingly; `w-full` dropped from the Inset (the `mx-3` right margin overflowed the viewport)                                                                                                                                                                      |
| D10 | 2026-11-20 | Alias declarations | aliases live in `:root` **only** — all eighteen are `var(--core)` and the core flips in the dark block, so duplicating them would only create drift. `palette.test.ts` taught the literal/alias distinction instead of being relaxed                                                                                                                                                                                                         |
| D11 | 2026-11-20 | Registry access    | the CLI works (`#lib` resolves from `components.json`, no `svelte.config.js`); the fallback fetcher is **not built**. Test harness is filename-split: `*.test.ts` → node, `*.dom.test.ts` → happy-dom + forced runes                                                                                                                                                                                                                         |
| D12 | 2026-11-20 | Breakpoint         | the block's mobile/desktop line moves **768 → 1024 (lg)** — mellon's rail starts at lg (owner call 2026-11-08); below it the hamburger + sheet own nav. `hooks/is-mobile` + `sidebar.svelte`'s `md:` classes patched together; keeping 768 would strand the hamburger at 768–1024                                                                                                                                                            |
| D13 | 2026-11-20 | Sidebar variant    | **`variant="sidebar"`, not `inset`** — the inset variant's `p-2` chrome tile + expanded-gap math contradict the full-bleed ONE-chrome-mass shell (§11.1); the box's inset geometry lives entirely in the doctrine line on `Sidebar.Inset`, with the topbar as a sibling above it (no nested `<main>` landmark)                                                                                                                               |
| D14 | 2026-11-21 | The quiet chip     | **owner call ("I don't like this kind of button"):** the transparent text-chip read as bare text. The `quiet` variant carries the select-trigger's anatomy — `bg-card` + `border-border` (the picker-pill look) — so secondary actions read as controls; the dialog Cancels keep their designed borderless-text look via explicit overrides. Cast test asserts the surface AND the absence of `bg-transparent`                               |
| D15 | 2026-11-21 | Native `confirm()` | **banned** — the OS dialog is the same leak class as the native `<select>` (unthemeable, custom copy ignored). The house `Confirm` (over `ui/alert-dialog`) replaces every call: the vault's key drop, the tags vocabulary delete, and the three unsaved-changes guards (`beforeNavigate` cancels + asks + re-navigates past the latch; `beforeunload` stays native — the browser owns that chrome). The vault gained the guard it never had |

## 10. Exit gate

The experiment ends at S5. It graduates only if **all** hold:

1. ~~All five slices shipped through the anvil ladder, production included.~~
   **AMENDED 2026-11-20 (the integration model):** the slices merge into
   `feat/shadcn-integration` only; `main` receives ONE merge and the ladder
   runs ONCE, at the end, if the owner accepts the experiment.
2. §6 parity checklist ticked for every route (14 pages) — the owner's
   screenshot pass.
3. `ui/` contains no unmodified vendored file, no `rounded-xl` above the
   ceiling, no motion over 200ms. **Verified 2026-11-21**: the radius gate
   holds two furniture exceptions (the content box per D9b + the bottom
   sheet's top corners, veto-able); no vendored file ships raw; motion is
   the block's 150–200ms overlays only.
4. The shell is ≤ ~300 lines and its nav is the block. **Verified: 189
   lines** (+ `app-sidebar.svelte`).
5. Measured cost recorded: bundle delta (P3 1,824 → 1,906 KiB gz), test
   count delta (P4 157 → 195), and the number of bugs found per slice (the
   ledger + the vault's lesson ledger carry them).
6. Owner screenshot pass: every page still reads as _the same maker's tool_
   beside gofar.id (§11.5). **Outstanding — the graduation decision itself.**

Then, and only then: DESIGN §11.6 is written, `AGENTS.md` §2 gains the pointer,
the vault note is updated as **state**, and this file is deleted.
