# mellon

The private admin portal of the [`omicron`](https://github.com/kanatabi/omicron) workspace:
content management for [earendil](https://github.com/kanatabi/earendil) and basic env/secret
management for the cluster — one keyboard-first web app, talking only to
[lumen](https://github.com/kanatabi/lumen).

> _Speak, friend, and enter._ Public at `console.gofar.id` — TLS at the shared
> Traefik edge, sessions minted by lumen, go-live is HUMAN-GATE #10. `kubectl port-forward`
> remains break-glass.

Read [`DESIGN.md`](DESIGN.md) first — the doctrine section is
load-bearing (UI-only, no credentials, relay-forwards-never-decides). The
working guide for agents is [AGENTS.md](AGENTS.md).

## When code lands

Mirror earendil's conventions: SvelteKit 3 + Svelte 5 runes + TS + Tailwind v4 +
`adapter-node`, Node 22, exact pins, gates in order:

```
npm run dev · npm run check · npm run lint · npm run test:unit · npm run build
```

**Real by default** (owner ruling 2026-11-09): the runtime has one data
source — lumen. **Dual upstreams** (lumen role split, 2026-11-13): the
cluster wires `ADMIN_URL` (control plane — sessions, users, TOFU, Bao) and
`CMS_URL` (this env's content lumen); which call goes where is one auditable
table in `src/lib/api/routing.ts`, and unknown paths refuse loudly. Legacy
`API_BASE` still feeds both planes (single-binary), and unset everywhere
falls back to `http://localhost:8080`;
`src/lib/api/fetch-adapter.ts` maps every `AdminApi` method 1:1 onto the
§8/§9 wire, the browser never sees lumen or the token, and the fixture
twin lives on ONLY in test scope (`api.test.ts` imports it directly — the
runtime graph never does). Start the backend first: `cd ../lumen && make dev`
(portal login: `gofar` / `mellon-dev-password`, the dev placeholder).

Makefile included: `make help` lists the verbs — `make dev` (readyz-gated
real mode, `LUMEN=`/`PORT=` overridable, reuses a live server), `make live`
(the gated acceptance suite vs a running lumen: login, drafts-at-the-door,
CAS 409s, multipart upload, secrets relay, instant revocation),
check/lint/test/build.

Branch-per-milestone, PR-reviewed — never commit directly to `main`.

