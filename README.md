# mellon

The private admin portal of the [`omicron`](https://github.com/kanatabi/omicron) workspace:
content management for [earendil](https://github.com/kanatabi/earendil) and basic env/secret
management for the cluster — one keyboard-first web app, talking only to
[lumen](https://github.com/kanatabi/lumen).

> _Speak, friend, and enter._ No public address; access via `kubectl port-forward`.

**Status: design only.** Read [`DESIGN.md`](DESIGN.md) first — the doctrine section is
load-bearing (UI-only, no credentials, relay-forwards-never-decides).

## When code lands

Mirror earendil's conventions: SvelteKit 3 + Svelte 5 runes + TS + Tailwind v4 +
`adapter-node`, Node 22, exact pins, gates in order:

```
npm run dev · npm run check · npm run lint · npm run test:unit · npm run build
```

**Real by default** (owner ruling 2026-11-09): the runtime has one data
source — lumen. Unset `API_BASE` falls back to `http://localhost:8080`;
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

## Repo bootstrap (remote not yet created)

This directory is currently a local git repo without a remote. To finish:

```bash
# 1. create the GitHub repo (private recommended — it documents admin paths)
gh repo create kanatabi/mellon --private --description "omicron: private admin portal (design stage)"

# 2. attach + push
git remote add origin git@github.com:kanatabi/mellon.git
git push -u origin main

# 3. register as a submodule in the superproject, then bump the pin there
cd .. && git submodule add git@github.com:kanatabi/mellon.git mellon
git commit -m "chore: register mellon submodule"
```
