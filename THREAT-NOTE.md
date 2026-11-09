# THREAT-NOTE — portal sessions & the secrets plane (HUMAN-GATE #5)

> **Status: owner re-review pending.** This is the standalone detailing of the
> GATE #5 threat note prepared 2026-11-09 (journal record: `mellon/PLAN.md`
> Phase B entry). It was ack'd provisionally by the owner's merge instruction
> ("A. ack, please create a separate detailing on this. I will review it again
> later") — production seeding and the console launch (GATE #10) still wait on
> the final read-through of this document.

## 0. Scope

Everything that touches **who may act as admin**, **what credentials exist
where**, and **what a breach of each surface buys an attacker**. Three systems
are in scope: mellon (public portal UI), lumen (§8 session mint + §9 secrets
relay), OpenBao (KV v2 plane). Out of scope: infrastructure attacks on the VPS
themselves (INFRA doc), content-plane read-only abuse (earendil serves public
data only).

## 1. Assets, ranked

| #   | Asset                                          | Why it matters                                                      |
| :-- | :--------------------------------------------- | :------------------------------------------------------------------ |
| A1  | **OpenBao root / all kv secrets**              | Every app's credentials, prod included                              |
| A2  | **The admin identity itself** (session bearer) | Full write authority over published content + read of secret VALUES |
| A3  | lumen's `fzr-portal` AppRole secret-id         | The only path from lumen to Bao — a forged AppRole role             |
| A4  | Content integrity (silent post/photo edits)    | Public trust in gofar.id                                            |
| A5  | The JWT signing key                            | Mints unlimited A2 bearers                                          |

## 2. Placement — who holds what, and where it is generated

| Credential              | Lives in                                                                                                                 | Never in                                        | Minted/rotated by                                                                           |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------------------------------------------ |
| Admin password          | **only as an argon2id hash** in `users.passhash` (lumen DB)                                                              | git, env, Bao, any log                          | `cmd/userctl` (password travels via `LUMEN_PASSWORD` env, never argv)                       |
| Session JWT             | **browser cookie only** (HttpOnly, `SameSite=Strict`, `Secure` over TLS); mellon SSR reads it to relay, JS never sees it | mellon source, git, logs                        | lumen `POST /admin/session` — HS256, claims `{sub, iat, exp, tv, jti}`, 12h, **no refresh** |
| JWT signing key         | OpenBao `lumen/{env}` → ESO-rendered pod env                                                                             | git, compose (dev placeholder only)             | bootstrap-generated                                                                         |
| Bao role-id / secret-id | **lumen pod env only** (ESO, from `bao-approle-credentials`)                                                             | mellon (any layer), git, lumen logs             | §5.6 seed; AppRole TTL ≤ 1h prod (5m dev), re-login agent-side                              |
| Secret VALUES           | OpenBao KV v2                                                                                                            | **any log at any hop** (mellon, lumen, CI); git | portal CAS writes via lumen relay only                                                      |

The load-bearing sentence of the design: **the portal UI holds NOTHING** —
mellon is a relay that adds no credentials of its own; lumen is the only door
to Bao; Bao audits the truth of every access.

## 3. Vectors, mitigations, proof

### V1 — Credential stuffing on the public login (`console.gofar.id`)

The attack surface the amendment created: one known-ish username, one public URL.

- **Cost per guess:** argon2id `m=64MiB, t=3, p=2` (OWASP-side) — a GPU does not
  get bulk parallelism on memory-hard hashing.
- **Rarity of guesses:** throttle (`internal/throttle`) — per-IP **and** per-account,
  exponential (3 free, then 1s→2s→4s…, capped 15m), `Retry-After` honored.
  Edge rate-limit middleware (INFRA Phase 3) is the coarse first layer.
- **Enumeration shut:** wrong-password and unknown-user answer one indistinguishable
  401 body; 400 pre-throttle empty-credentials is a client-error class, not a
  credential event.
- **Proof:** `admin_integration_test.go` — "wrong password and unknown user are one
  indistinguishable message"; "throttle starves credential stuffing" (12 guesses →
  429); live captures in the Postman catalog (identical 401 bodies, 429 + Retry-After).
- **Residual:** throttle state is per-replica in-memory (see R1).

### V2 — Stolen session bearer (XSS, laptop compromise, cookie theft)

The honest answer, written plainly: **a live mellon session bearer IS an admin.**
It can do everything the owner can, **including reading secret VALUES** through
the §9 relay — masking is UI-only by doctrine (the editor must be able to copy
a real value; a hidden-in-DOM value is theater).

- **Window:** 12h hard expiry, no refresh tokens (re-login is the design —
  rotation machinery is not worth its own theft surface at this scale).
- **Kill switch:** `DELETE /admin/session` bumps `users.token_version`; every
  verification checks signature **AND the live row** — logout kills all
  outstanding tokens instantly, across replicas, no cache to invalidate.
- **Proof:** the battery's login→use→logout→**replay-the-same-token→401**;
  forged `alg:none` token refused at library config (`session_test.go`); the
  Postman catalog preserves the replay example.
- **Owner action on suspicion:** press logout in the console — or `userctl`
  password rotation (preserves `token_version`; explicit revocation is logout's job).

### V3 — Direct assault on Bao from outside

- lumen, Meilisearch and Bao have **no public address, ever** (INFRA §2; the
  console amendment did not touch this). Browser traffic rides same-origin
  relays; there is literally no route to the plane from a client.
- AppRole `bound_cidr_list` pins lumen's pod CIDRs **at prod seed** (dev is
  unbound — R2). Even a leaked secret-id cannot login from elsewhere.

### V4 — Compromise of lumen's own env (AppRole identity extraction)

Buying: the §9 surface **as scoped by the `fzr-portal` policy** — read/write
under `kv/` only, **no `sys/`, no enumeration beyond the mount, no admin token**.
Attack requires already owning a pod network position (same attackers who could
read the DB or the signing key — no new class).

- **Shrink:** secret-id TTL ≤ 1h prod + agent re-login; role has no `sys` rights;
  the relay's FOUR operations are the whole surface by construction (no route to
  sys/ exists in `internal/httpapi/admin_bao.go`).
- **Detect:** Bao audit devices log every relay operation (the trail of record —
  lumen logs op+path+version+key-counts, never payloads; redaction is TESTED:
  `bao_integration_test.go` captures the slog stream during reads/writes of a
  marked value and demands its absence).

### V5 — Lost-update / confused-deputy on secret writes

- CAS on every write (`cas` must equal current version; `cas: 0` is create-only;
  stale → 409, never silent clobber); `cas_required` set on the mount at bootstrap.
- Portal doctrine: no destructive path — the UI's delete affordances stop at the
  KV version list; soft-deleting a kv path is not exposed at all (versions are
  kept; purge is a root-level operator action outside the portal).

### V6 — Silent content mutation (attacker with A2 buys A4)

- All writes are `rev`-CAS-checked (no lost updates between two admin sessions);
  publish is the §2 transaction (derivations are server-owned, the attacker still
  cannot make §1 serve drafts — status is a state machine, leak rules enforced at
  the DB edge regardless of index state).
- Detection: Bao-independent — post `updated_at`/`rev` visible on the desk;
  git is not the content store, so there is no PR trail (honest gap, see R4).

## 4. Residual risks (accepted, with rationale)

- **R1 — per-replica throttle.** Two lumen replicas = 2× the guess budget.
  Chosen over a Postgres-backed limiter: stateless scale honesty at blog
  traffic; the durable variant is a drop-in if the console ever earns the
  attention. Documented, not hidden.
- **R2 — dev plane divergence.** compose's AppRole is CIDR-unbound and the dev
  OpenBao has in-memory storage + a throwaway root token. Never reachable from
  outside the laptop; production seeds are the §5.6 procedure (CIDR-bound,
  audit devices ON — GATE #10 item).
- **R3 — the 12h bearer is admin-equal by design** (V2). Accepted because the
  alternative (value-blind relay responses) breaks the portal's actual job.
  Mitigated by instant revocation + re-login, not by pretense.
- **R4 — no content change-audit trail in git.** Bao audits secrets; lumen
  logs operations (`session.grant/deny/revoke`, `bao.*`); post writes carry
  timestamps + rev but no per-field history. If this ever matters, an
  `post_revisions` table is the known answer — deliberately not built yet.
- **R5 — strict CSP deferred** (mellon): inline `style=` hue attributes are how
  the wayfinding ships today; a tight `style-src` breaks it. The palette +
  masked-value UI never interpolates user content into markup; XSS is treated
  as _possible_, which is exactly why V2's mitigation is revocation, not trust.

## 5. What finalizing this gate means

The owner's final read-through of this document is what unblocks (in order):

1. **Prod seeding** — §5.6 Bao seed (incl. `SESSION_JWT_SECRET`, media keys,
   `bao-approle-credentials`) and ESO wiring; nothing may go in-cluster before.
2. **GATE #10 run** — the console pre-launch checklist (edge middlewares,
   throttle + argon2id live, `tv`-revocation proven end-to-end through the
   portal, `Secure` cookie over TLS, Bao audit devices ON).
3. Any line in this note the owner rejects is a **design change**, not a
   footnote — V2/R3 are the load-bearing ones.

## 6. Evidence index

| Claim                                           | Where it is proven                                                 |
| :---------------------------------------------- | :----------------------------------------------------------------- |
| alg:none / garbage / expired tokens refused     | `lumen/internal/session/session_test.go`                           |
| tv revocation kills live tokens (over-the-wire) | `admin_integration_test.go` + live battery run 2×                  |
| one indistinguishable auth-failure body         | same test, response-equality assert                                |
| throttle engages with Retry-After               | same suite + Postman catalog 429 capture                           |
| values never in lumen logs                      | `bao_integration_test.go` slog-capture redaction proof             |
| CAS conflicts are 409, never clobbers           | same test + driftcheck walks on OpenBao                            |
| relay surface = 4 operations, no sys/           | `internal/httpapi/admin_bao.go` (mount table) + §9 contract        |
| drafts never on §1 surfaces                     | earendil `contract.spec.ts` (13/13 live) + Postman leak examples   |
| dev plane == prod product                       | compose `ghcr.io/openbao/openbao:2.5.3` + battery re-run `938ce69` |
