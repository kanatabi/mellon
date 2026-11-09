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

**Two data modes (the Phase C seam):** unset `API_BASE` = the mock twin
(dev, unit tests, CI — zero backend needed). `npm run dev:lumen` points
`API_BASE=http://localhost:8080` at a RUNNING lumen (`cd ../lumen && make
dev`) and the same UI talks the real §8/§9 wire — `src/lib/api/fetch-
adapter.ts` maps every AdminApi method 1:1, the browser still never sees
lumen or the token. The live acceptance suite for that transport is
gated like earendil's: `LUMEN_URL=http://localhost:8080 npm run test:unit`
(`src/lib/api/api.live.test.ts` — login, drafts-at-the-door, CAS 409s,
multipart upload, secrets relay, instant revocation).

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
