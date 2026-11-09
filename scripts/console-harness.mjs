// Console behaviour harness (owner round: preload storm, keyed editor,
// viewport-locked shell, error boundary). Dev-only proof tool — needs a
// reachable lumen (:8080) and a chromium binary. Run: npm run test:console
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

async function loadPlaywright() {
	const paths = [
		'playwright-core',
		process.env.PW_CORE_PATH,
		`${process.env.HOME}/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs`
	].filter(Boolean);
	for (const p of paths) {
		try {
			return (await import(p)).default ?? (await import(p));
		} catch {
			/* next */
		}
	}
	console.log('playwright-core unavailable — skipping console harness');
	process.exit(0);
}

const pw = await loadPlaywright();
if (!pw.chromium) {
	console.log('no chromium export — skipping');
	process.exit(0);
}

const LUMEN = process.env.LUMEN_URL ?? 'http://localhost:8080';
const PORT = 5193;
const DEAD_PORT = 5194;
const BASE = `http://localhost:${PORT}`;

const session = await (
	await fetch(`${LUMEN}/admin/session`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			username: process.env.DEV_USER ?? 'gofar',
			password: process.env.DEV_PASSWORD ?? 'mellon-dev-password'
		})
	})
).json();
if (!session.token) throw new Error(`lumen login failed: ${JSON.stringify(session)}`);

function startVite(port, apiBase) {
	return spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
		env: { ...process.env, API_BASE: apiBase },
		stdio: 'ignore',
		detached: true
	});
}

const vite = startVite(PORT, LUMEN);
const viteDead = startVite(DEAD_PORT, 'http://localhost:9998');
const cleanup = () => {
	for (const c of [vite, viteDead]) {
		try {
			process.kill(-c.pid, 'SIGTERM');
		} catch {
			/* gone */
		}
	}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) {
	try {
		const r = await fetch(`${BASE}/healthz`);
		if (r.ok) break;
	} catch {
		await sleep(500);
	}
}

const browser = await pw.chromium.launch({
	executablePath: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(
		existsSync
	)
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
	{
		name: 'mellon_session',
		value: session.token,
		domain: 'localhost',
		path: '/',
		httpOnly: true,
		sameSite: 'Strict'
	}
]);
const page = await ctx.newPage();

let failures = 0;
const check = (name, ok, detail = '') => {
	console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
	if (!ok) failures++;
};

// --- T1: hover sweep must NOT fetch route data (tap-preload) ---
const dataReqs = [];
page.on('request', (r) => {
	if (r.url().includes('__data.json')) dataReqs.push(r.url());
});
await page.goto(`${BASE}/posts`, { waitUntil: 'networkidle' });
dataReqs.length = 0;
const links = await page.locator('main a[href^="/posts/"]').all();
for (const l of links) await l.hover();
await sleep(400);
check('T1 hover sweep fetches zero __data.json', dataReqs.length === 0, `saw ${dataReqs.length}`);

// --- T2: palette navigation repaints the editor (keyed remount) ---
// query chosen so row 0 CANNOT be the current post (the engine legitimately
// matches "queue" inside the observability post's body — first probe learned
// that the hard way); rows sort alphabetically within groups, by design.
await page.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
const titleBefore = await page.locator('h1').first().textContent();
await page.keyboard.press('Control+k');
await sleep(300);
await page.keyboard.type('field guide');
await sleep(700);
await page.keyboard.press('Enter');
await page
	.waitForURL('**/posts/a-small-field-guide-to-idempotency', { timeout: 5000 })
	.catch(() => {});
const titleAfter = await page.locator('h1').first().textContent();
check(
	'T2 palette nav switches the rendered post',
	page.url().includes('a-small-field-guide-to-idempotency') && titleAfter !== titleBefore,
	`${titleBefore?.trim()} -> ${titleAfter?.trim()}`
);

// --- T3: dirty editor + palette jump => confirm dialog guards ---
const urlAtT3 = page.url();
await page.locator('.cm-content').click();
await page.keyboard.type(' x');
await sleep(200);
let dialogSeen = null;
page.once('dialog', async (d) => {
	dialogSeen = d.message();
	await d.dismiss();
});
await page.keyboard.press('Control+k');
await sleep(200);
await page.keyboard.type('owns the clock');
await sleep(700);
await page.keyboard.press('Enter');
await sleep(600);
check(
	'T3a unsaved-changes confirm fires on SPA nav',
	dialogSeen !== null,
	dialogSeen ?? 'no dialog'
);
check('T3b dismissing keeps the editor', page.url() === urlAtT3, page.url());
// and accepting DOES move (keyed remount carries us to the new post)
page.once('dialog', async (d) => await d.accept());
await page.keyboard.press('Control+k');
await sleep(200);
await page.keyboard.type('owns the clock');
await sleep(700);
await page.keyboard.press('Enter');
await page.waitForURL('**/posts/one-service-owns-the-clock', { timeout: 5000 }).catch(() => {});
check(
	'T3c accepting navigates + remounts',
	page.url().includes('one-service-owns-the-clock'),
	page.url()
);

// --- T4: viewport-locked shell — wheel inside editor scrolls the PANE ---
await page.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
const toolbarBox = await page
	.locator('header')
	.first()
	.boundingBox()
	.catch(() => null);
const box = await page.locator('.cm-scroller').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 200);
await page.mouse.wheel(0, 1200);
await sleep(400);
const state = await page.evaluate(() => ({
	y: window.scrollY,
	cm: document.querySelector('.cm-scroller')?.scrollTop ?? 0,
	body: document.scrollingElement?.scrollTop ?? 0
}));
check('T4a window never scrolls', state.y === 0 && state.body === 0, JSON.stringify(state));
check('T4b editor pane scrolls internally', state.cm > 0, `scrollTop ${state.cm}`);
const toolbarAfter = await page
	.locator('header')
	.first()
	.boundingBox()
	.catch(() => null);
check(
	'T4c chrome stays put',
	toolbarBox && toolbarAfter && Math.abs(toolbarBox.y - toolbarAfter.y) < 0.5
);
await page.screenshot({ path: '/tmp/opencode/shots/shell-locked.png' });

// --- T6/T7: sidebars own their scroller — never crop, never push the page ---
for (const [label, path] of [
	['desk', '/posts'],
	['photos', '/photos']
]) {
	await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
	const rail = page.locator('main aside').first();
	const box = await rail.boundingBox();
	if (!box) {
		check(`T-${label} rail present`, false, 'no aside found');
		continue;
	}
	const before = await page.evaluate(() => {
		const a = document.querySelector('main aside');
		return { ch: a.clientHeight, sh: a.scrollHeight, bottom: a.getBoundingClientRect().bottom };
	});
	await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 20, 400));
	await page.mouse.wheel(0, 400);
	await sleep(300);
	const st = await page.evaluate(() => {
		const a = document.querySelector('main aside');
		return { top: a.scrollTop, y: window.scrollY, body: document.scrollingElement?.scrollTop ?? 0 };
	});
	check(
		`T-${label}: rail is viewport-bounded`,
		before.bottom <= 901,
		`bottom ${Math.round(before.bottom)}`
	);
	check(
		`T-${label}: rail scrolls internally when taller`,
		before.sh <= before.ch + 2 || st.top > 0,
		`scrollTop ${st.top}, ch ${before.ch} sh ${before.sh}`
	);
	check(`T-${label}: page still does not scroll`, st.y === 0 && st.body === 0, JSON.stringify(st));
}

// editor inspector rail: inner w-72 column must scroll on its own
await page.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
const railBox = await page.locator('section > div:last-child').boundingBox();
await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + 400);
await page.mouse.wheel(0, 400);
await sleep(300);
const editorRail = await page.evaluate(() => {
	const wrap = document.querySelector('section > div:last-child');
	const rail = wrap.querySelector('.overflow-y-auto');
	return { top: rail?.scrollTop ?? -1, y: window.scrollY };
});
check(
	'T-editor: inspector scrolls independently',
	editorRail.top > 0 && editorRail.y === 0,
	JSON.stringify(editorRail)
);

// --- T-pane: collapsible sections — pill, persistence, keyboard move, pinned wall ---
await page.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
const panes = async () =>
	page.evaluate(() =>
		[...document.querySelectorAll('[data-pane]')].map((e) => e.getAttribute('data-pane'))
	);
await page.locator('[aria-label="Collapse tags"]').click();
await sleep(300);
const list = await panes();
check(
	'T-pane1 collapse turns the card into a pill',
	list.includes('tags') && (await page.locator('[aria-label^="Expand tags"]').count()) === 1
);
await page.reload({ waitUntil: 'networkidle' });
check(
	'T-pane2 collapsed state survives reload (persisted)',
	(await page.locator('[aria-label^="Expand tags"]').count()) === 1
);
await page.locator('[aria-label^="Expand tags"]').click();
// keyboard move: focus the title pane, Alt+Down swaps it with subtitle
await page.locator('[data-pane="title"]').focus();
await page.keyboard.press('Alt+ArrowDown');
await sleep(250);
const moved = await page.evaluate(
	() => getComputedStyle(document.querySelector('[data-pane="title"]')).order
);
const movedSubtitle = await page.evaluate(
	() => getComputedStyle(document.querySelector('[data-pane="subtitle"]')).order
);
check(
	'T-pane3 Alt+Down reorders (order map swaps)',
	moved === '2' && movedSubtitle === '1',
	`title order ${moved}, subtitle ${movedSubtitle}`
);
// pinned wall: Alt+Up on the first movable pane is a no-op
await page.locator('[data-pane="subtitle"]').focus();
await page.keyboard.press('Alt+ArrowUp');
await sleep(250);
const order0 = await page.evaluate(
	() => getComputedStyle(document.querySelector('[data-pane="subtitle"]')).order
);
check('T-pane4 first movable cannot pass the pin', order0 === '1', `subtitle order ${order0}`);
check(
	'T-pane6 drag ghost slot is provisioned (hidden until a drag)',
	(await page.locator('aside [data-pane-ghost]').count()) === 1
);
check(
	'T-pane5 ACTIONS pane is not draggable',
	(await page.locator('[data-pane="actions"]').getAttribute('draggable')) !== 'true'
);

// --- T-pane7..: perf contract + rail cosmetics (owner round 2) ---
check(
	'T-pane7 rail scrollbar is invisible (no bar paints)',
	await page.evaluate(
		() => getComputedStyle(document.querySelector('aside.rail-scroll')).scrollbarWidth === 'none'
	)
);
{
	// shimmer lifecycle, HOST-AGNOSTIC: discover the CURRENT cover URL from
	// the SSR HTML first — the old test pinned unsplash and silently stopped
	// gating the moment the owner re-set the cover to picsum. Fresh context:
	// a warm HTTP cache answers without touching the network, and then the
	// "loading" window simply does not exist.
	const html0 = await (
		await fetch(`${BASE}/posts/observability-is-a-contract`, {
			headers: { cookie: `mellon_session=${session.token}` }
		})
	).text();
	const coverUrl = html0.match(/src="(https:[^"]+)"[^>]*alt="Cover preview"/)?.[1];
	const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await c2.addCookies([
		{
			name: 'mellon_session',
			value: session.token,
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Strict'
		}
	]);
	const pg = await c2.newPage();
	let releaseCover;
	const gate = new Promise((r) => (releaseCover = r));
	await pg.route(coverUrl ?? '**no-such-cover**', async (route) => {
		await gate;
		await route.continue();
	});
	await pg.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'domcontentloaded' });
	await sleep(500); // cover in flight (blocked at the gate); media pane open by default
	const shimmerLoading = await pg.locator('aside .thumb-shimmer').count();
	releaseCover();
	await pg
		.waitForFunction(() => !document.querySelector('aside .thumb-shimmer'), { timeout: 20000 })
		.catch(() => {});
	const shimmerDecoded = await pg.locator('aside .thumb-shimmer').count();
	check(
		'T-pane8 cover shimmers while loading, stops when decoded',
		!!coverUrl && shimmerLoading === 1 && shimmerDecoded === 0,
		`cover=${coverUrl ? 'found' : 'NOT FOUND'} loading=${shimmerLoading} decoded=${shimmerDecoded}`
	);
	await pg.unroute(coverUrl ?? '**no-such-cover**');
	// warm-cache reload: the img NEVER fires onload — the img.complete effect
	// is the only thing that can stop the sweep there
	await pg.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
	await sleep(400);
	check(
		'T-pane8b warm-cache reload decodes without a stuck shimmer',
		(await pg.locator('aside .thumb-shimmer').count()) === 0
	);
	await c2.close();
}

{
	// synthetic drag sweep: lift → open slot → steady moves must measure ZERO
	// rects (the cache is the point), and the drag image must be a slim bar.
	const perf = await page.evaluate(async () => {
		const raf = () => new Promise((r) => requestAnimationFrame(r));
		const aside = document.querySelector('aside.rail-scroll');
		const media = aside.querySelector('[data-pane="media"]');
		const dt = new DataTransfer();
		let dragImages = 0;
		const sdi = DataTransfer.prototype.setDragImage;
		DataTransfer.prototype.setDragImage = function (...a) {
			dragImages++;
			return sdi.apply(this, a);
		};
		media.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
		await new Promise((r) => setTimeout(r, 300)); // lift FLIP + anim window done
		const exp = aside.querySelector('[data-pane="export"]').getBoundingClientRect();
		const y = exp.top + exp.height * 0.25;
		aside.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientY: y, dataTransfer: dt }));
		await raf();
		await new Promise((r) => setTimeout(r, 300)); // preview FLIP + anim window done
		// one warm hover: the preview's own FLIP invalidates the cache once —
		// absorb that rebuild, then measure the STEADY state
		aside.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientY: y, dataTransfer: dt }));
		await raf();
		await raf();
		const orig = Element.prototype.getBoundingClientRect;
		let rectReads = 0;
		Element.prototype.getBoundingClientRect = function (...a) {
			rectReads++;
			return orig.apply(this, a);
		};
		for (let i = 0; i < 3; i++) {
			aside.dispatchEvent(
				new DragEvent('dragover', { bubbles: true, clientY: y + i, dataTransfer: dt })
			);
			await raf();
			await raf();
		}
		const steadyRectReads = rectReads;
		Element.prototype.getBoundingClientRect = orig;
		DataTransfer.prototype.setDragImage = sdi;
		aside.dispatchEvent(new DragEvent('drop', { bubbles: true, clientY: y + 2, dataTransfer: dt }));
		await new Promise((r) => setTimeout(r, 150));
		const order = JSON.parse(localStorage.getItem('mellon.sections.post')).order;
		return {
			steadyRectReads,
			dragImages,
			landed: order.indexOf('media') === order.indexOf('export') - 1
		};
	});
	check(
		'T-pane9 steady dragover reads zero layout rects (slot cache works)',
		perf.steadyRectReads === 0,
		JSON.stringify(perf)
	);
	check(
		'T-pane10 drag uses the slim captured bar (setDragImage)',
		perf.dragImages === 1,
		JSON.stringify(perf)
	);
	check(
		'T-pane11 synthetic drag lands media right before export',
		perf.landed,
		JSON.stringify(perf)
	);
}

// --- T-touch: long-press lifts a pane into drag mode (HTML5 DnD has no
// touch support — Pointer Events drive the SAME FLIP machine) ---
{
	const touch = await page.evaluate(async () => {
		const nap = (ms) => new Promise((r) => setTimeout(r, ms));
		const aside = document.querySelector('aside.rail-scroll');
		const title = aside.querySelector('[data-pane="title"]');
		const r = title.getBoundingClientRect();
		const pt = (type, clientY, clientX = r.left + 20) =>
			new PointerEvent(type, {
				bubbles: true,
				pointerId: 7,
				pointerType: 'touch',
				clientX,
				clientY
			});
		title.dispatchEvent(pt('pointerdown', r.top + 10));
		await nap(520); // past the long-press threshold
		const lifted =
			title.style.display === 'none' && !!document.querySelector('[data-pane-drag-bar]');
		const expEl = aside.querySelector('[data-pane="export"]');
		// land where the finger can actually rest: in-view (a parked finger
		// below the rail's edge triggers autoscroll and slides the slot away)
		expEl.scrollIntoView({ block: 'center', behavior: 'instant' });
		await nap(60);
		const exp = expEl.getBoundingClientRect();
		const y = exp.top + exp.height * 0.25;
		aside.dispatchEvent(pt('pointermove', y));
		await nap(150); // a touch tick previews the slot under the finger
		const ghostOpen = !aside.querySelector('[data-pane-ghost]').classList.contains('hidden');
		aside.dispatchEvent(pt('pointerup', y));
		await nap(150);
		const barGone = !document.querySelector('[data-pane-drag-bar]');
		const order = JSON.parse(localStorage.getItem('mellon.sections.post')).order;
		return {
			lifted,
			ghostOpen,
			barGone,
			landed: order.indexOf('title') === order.indexOf('export') - 1
		};
	});
	check(
		'T-touch1 long press lifts the pane (gap closes, bar appears)',
		touch.lifted,
		JSON.stringify(touch)
	);
	check('T-touch2 finger hover opens the ghost slot', touch.ghostOpen, JSON.stringify(touch));
	check(
		'T-touch3 release lands the pane and cleans up the bar',
		touch.barGone && touch.landed,
		JSON.stringify(touch)
	);
	const tap = await page.evaluate(async () => {
		const nap = (ms) => new Promise((r) => setTimeout(r, ms));
		const aside = document.querySelector('aside.rail-scroll');
		const date = aside.querySelector('[data-pane="date"]');
		const r = date.getBoundingClientRect();
		const mk = (type) =>
			new PointerEvent(type, {
				bubbles: true,
				pointerId: 9,
				pointerType: 'touch',
				clientX: r.left + 20,
				clientY: r.top + 10
			});
		date.dispatchEvent(mk('pointerdown'));
		await nap(120); // under the threshold
		date.dispatchEvent(mk('pointerup'));
		await nap(80);
		return date.style.display !== 'none' && !document.querySelector('[data-pane-drag-bar]');
	});
	check('T-touch4 a short tap never arms a drag', tap);
}

// --- T-tab: the EDITOR COLUMN (container), not the viewport, decides
// side-by-side vs tabs — at 1280 the rails+nav leave the split unreadable,
// and the owner wants tab view there with the sidebar inline as-is ---
{
	const mode = async (w, h) => {
		const c = await browser.newContext({ viewport: { width: w, height: h } });
		await c.addCookies([
			{
				name: 'mellon_session',
				value: session.token,
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				sameSite: 'Strict'
			}
		]);
		const pg = await c.newPage();
		await pg.goto(`${BASE}/posts/observability-is-a-contract`, { waitUntil: 'networkidle' });
		const out = await pg.evaluate(() => ({
			pane: getComputedStyle(document.querySelector('#pane-write')).position,
			tabs: !!document.querySelector('[role="tablist"]')?.getBoundingClientRect().width,
			rail: (document.querySelector('aside.rail-scroll')?.getBoundingClientRect().width ?? 0) > 100
		}));
		await c.close();
		return out;
	};
	const wide = await mode(1440, 900);
	check(
		'T-tab1 1440: side-by-side panes, tab strip off, rail inline',
		wide.pane === 'static' && !wide.tabs && wide.rail,
		JSON.stringify(wide)
	);
	const mid = await mode(1280, 800);
	check(
		'T-tab2 1280: TAB view for editor/preview — sidebar still inline',
		mid.pane === 'absolute' && mid.tabs && mid.rail,
		JSON.stringify(mid)
	);
	const phone = await mode(390, 844);
	check(
		'T-tab3 phone: tab view, rail as sheet (unchanged)',
		phone.pane === 'absolute' && phone.tabs && !phone.rail,
		JSON.stringify(phone)
	);
}

// --- T-secrets: the secrets editor must render, not scream. (The first
// cut had a self-rearming $effect — rows written then read in the same run —
// effect_update_depth_exceeded killed the page AFTER SSR's 200, so the root
// error boundary inherited status 200: the owner's "INTERNAL 200".) ---
{
	const sp = await ctx.newPage();
	const errs = [];
	sp.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));
	await sp.goto(`${BASE}/secrets`, { waitUntil: 'networkidle' });
	await sleep(400);
	check(
		'T-secrets1 secrets page renders rows, no error boundary',
		(await sp.locator('text=Something went sideways').count()) === 0 &&
			(await sp.locator('main input').count()) >= 2,
		`inputs=${await sp.locator('main input').count()}`
	);
	check('T-secrets2 mount converged with zero console errors', errs.length === 0, errs[0] ?? '');
	const saveBtn = sp.locator('button:has-text("save as")');
	const armedBefore = await saveBtn.isEnabled().catch(() => true);
	// TYPE INTO A VALUE FIELD — nth-based selectors broke when the search
	// bar joined main (it correctly does NOT arm SAVE — pin by aria-label).
	const valInput = sp.locator('input[aria-label^="value of "]').first();
	await valInput.click({ clickCount: 3 });
	await valInput.type('-X');
	await sleep(200);
	const armedAfter = await saveBtn.isEnabled().catch(() => false);
	check(
		'T-secrets3 typing arms SAVE (dirty survives the resync guard)',
		!armedBefore && armedAfter,
		`before=${armedBefore} after=${armedAfter}`
	);
	await sp.close();
}

// --- T-plane: the secrets CONTROL PLANE end-to-end through the real UI
// (onboard → mirror fan-out → search → pin intent → restore overlay →
// add-env). The dev plane persists, so the app name is RUN-FRESH (no
// teardown by design — D5 refuses destroy-grants; FORCE=1 make seed resets) ---
{
	const APP = 'harness-' + Date.now().toString(36);
	const hp = await ctx.newPage();
	await hp.goto(`${BASE}/secrets`, { waitUntil: 'networkidle' });
	await hp.locator('[aria-label="Onboard app"]').click();
	await hp.locator('input[placeholder="credit"]').fill(APP);
	await hp.locator('form button[type="submit"]', { hasText: 'onboard' }).click();
	await hp.waitForFunction((a) => document.body.innerText.includes(`kv / ${a} / dev`), APP, {
		timeout: 15000
	});
	check(
		`T-plane1 onboard ${APP}: dialog → trio tabs (D4)`,
		(await hp
			.locator(
				'[aria-label="Environment dev"], [aria-label="Environment staging"], [aria-label="Environment production"]'
			)
			.count()) === 3
	);
	// structural save in dev ⇒ the MIRROR lands on siblings (empty value)
	await hp.locator('button:has-text("+ key")').click();
	const KEY = 'NEW_KEY_1';
	await hp.locator(`input[aria-label="value of ${KEY}"]`).fill('HARNESS-SAVED-VALUE');
	await hp.locator(`button:has-text("save as v2")`).click();
	await hp.waitForFunction(() => document.body.innerText.includes('saved as version 2'), null, {
		timeout: 15000
	});
	await hp.locator('[aria-label="Environment staging"]').click();
	await hp.waitForFunction(
		(a) => document.body.innerText.includes(`kv / ${a} / staging · v2`),
		APP,
		{ timeout: 15000 }
	);
	const stagedVal = await hp.locator(`input[aria-label="value of ${KEY}"]`).inputValue();
	check(
		'T-plane2 key-set mirror fanned out to staging — empty value, own version bump',
		stagedVal === '' && (await hp.locator(`input[aria-label="key ${KEY}"]`).count()) === 1,
		`staged value "${stagedVal}"`
	);
	// search (D3): key match keeps the row, garbage empties it, clear restores
	await hp.locator('[aria-label="Search keys and values"]').fill('newk');
	await hp.waitForFunction(
		(k) => document.querySelectorAll(`input[aria-label="key ${k}"]`).length === 1,
		KEY,
		{ timeout: 5000 }
	);
	await hp.locator('[aria-label="Search keys and values"]').fill('zzzz');
	const emptyState = await hp.locator('text=no keys match').count();
	await hp.locator('[aria-label="Clear search"]').click();
	const restored = await hp.locator(`input[aria-label="key ${KEY}"]`).count();
	check(
		'T-plane3 fuzzy search filters rows, empty state, clear restores',
		emptyState === 1 && restored === 1
	);
	// pin = intent (D1): badge appears on dev, disappears on unpin
	await hp.locator('[aria-label="Environment dev"]').click();
	await hp.waitForFunction(() => document.body.innerText.includes(' / dev ·'), null, {
		timeout: 10000
	});
	await hp.locator('button:has-text("history")').click();
	await hp.locator(`[aria-label="Pin v2"]`).click();
	await hp.waitForFunction(() => document.body.innerText.includes('pinned v2'), null, {
		timeout: 10000
	});
	check('T-plane4 pin records intent — badge in the header', true);
	await hp.locator(`[aria-label="Unpin v2"]`).click();
	await hp.waitForFunction(() => !document.body.innerText.includes('pinned v2'), null, {
		timeout: 10000
	});
	check('T-plane5 unpin clears the intent', true);
	// restore (D2): overlay v2's values onto the CURRENT shape → dirty → save
	await hp.locator('button:has-text("close")').first().click();
	await hp.locator(`input[aria-label="value of ${KEY}"]`).fill('DRIFTED-VALUE');
	await hp.locator('button:has-text("save as v3")').click();
	await hp.waitForFunction(() => document.body.innerText.includes('saved as version 3'), null, {
		timeout: 15000
	});
	await hp.locator('button:has-text("history")').click();
	await hp.locator('button[aria-label^="Restore v2"]').click();
	await hp.waitForFunction(() => document.body.innerText.includes('overlaid'), null, {
		timeout: 10000
	});
	check(
		'T-plane6 restore v2 overlays values onto current keys (dirty armed)',
		(await hp.locator('button:has-text("save as v4")').isEnabled()) === true
	);
	// add-env: the late env gets the canonical union — never a smaller shape
	// (the history drawer is a modal covering the right edge — close it
	// honestly like a user does, or the +env click hits the drawer)
	await hp.locator('aside[aria-label="Version history"] button:has-text("close")').click();
	await hp.waitForFunction(
		() => !document.querySelector('aside[aria-label="Version history"]'),
		null,
		{ timeout: 5000 }
	);
	await hp.locator('[aria-label="Add environment"]').click();
	await hp.locator('input[placeholder="lab"]').fill('lab');
	await hp.locator('form button[type="submit"]', { hasText: 'add env' }).click();
	// the UI stays on the CURRENT env after adding (no surprise travel); the
	// proof is the tab arriving, then the seeded shape when we visit it
	await hp.waitForFunction(() => !!document.querySelector('[aria-label="Environment lab"]'), null, {
		timeout: 15000
	});
	await hp.locator('[aria-label="Environment lab"]').click();
	await hp.waitForFunction((a) => document.body.innerText.includes(`kv / ${a} / lab`), APP, {
		timeout: 15000
	});
	check(
		'T-plane7 add-env seeded the canonical key set (union, empty values)',
		(await hp.locator(`input[aria-label="key ${KEY}"]`).count()) === 1 &&
			(await hp.locator(`input[aria-label="value of ${KEY}"]`).inputValue()) === ''
	);
	// palette verbs (DESIGN §7): the page registers; the shell composes.
	// HARDENED LESSONS: target the palette BY ITS aria-label ('[role="dialog"]
	// input' is ambiguous — a still-open page dialog wins the selector and
	// keystrokes land in the wrong input); close the onboard dialog with its
	// CANCEL button (explicit), not Escape (focus-dependent); and let the
	// reactive list settle before counting (plane10's rows>0 non-vacuity
	// guard is what exposed all of this).
	const openPalette = async () => {
		await hp.keyboard.press('Control+k');
		const input = hp.locator('[aria-label="Command palette"] input').first();
		await input.waitFor({ state: 'visible', timeout: 4000 });
		await input.click();
		return input;
	};
	const pal = await openPalette();
	await pal.fill('onboard');
	await sleep(200);
	const onboardRow = await hp.locator('[role="option"]', { hasText: 'Onboard app…' }).count();
	await hp.keyboard.press('Enter');
	await hp
		.waitForFunction(() => !!document.querySelector('[aria-label="Onboard app namespace"]'), null, {
			timeout: 5000
		})
		.catch(() => {});
	const dialogUp = await hp.locator('[aria-label="Onboard app namespace"]').count();
	await hp.locator('[aria-label="Onboard app namespace"] button', { hasText: 'cancel' }).click();
	await hp.waitForFunction(
		() => !document.querySelector('[aria-label="Onboard app namespace"]'),
		null,
		{ timeout: 4000 }
	);
	check(
		'T-plane8 palette lists secrets verbs — Onboard runs through the dialog',
		onboardRow >= 1 && dialogUp === 1,
		`row=${onboardRow} dialog=${dialogUp}`
	);
	const pal2 = await openPalette();
	await pal2.fill('pin');
	await sleep(200);
	const pinRow = await hp.locator('[role="option"]', { hasText: /Pin v|Unpin v/ }).count();
	await hp.keyboard.press('Escape');
	check('T-plane9 palette carries the live pin verb (stateToggle)', pinRow >= 1, `rows=${pinRow}`);
	// leaving the page must clear the verbs (the registration contract)
	await hp.goto(`${BASE}/posts`, { waitUntil: 'networkidle' });
	const pal3 = await openPalette();
	// non-vacuity measured BEFORE filtering: an empty query must show the
	// base rows; then `onboard` may legitimately match NOTHING on /posts —
	// that empty list is the proof, not a failure
	const anyRows = await hp.locator('[aria-label="Command palette"] [role="option"]').count();
	await pal3.fill('onboard');
	await sleep(200);
	const ghosts = await hp.locator('[role="option"]', { hasText: 'Onboard app…' }).count();
	await hp.keyboard.press('Escape');
	check(
		'T-plane10 leaving secrets unregisters its palette verbs',
		ghosts === 0 && anyRows > 0,
		`ghosts=${ghosts} rows=${anyRows}`
	);
	await hp.close();
}

// --- T-cmp: version compare — seeded via API (fresh app), driven via UI ---
{
	const APP = 'cmp-' + Date.now().toString(36);
	const auth = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
	await fetch(`${LUMEN}/admin/bao/apps`, {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ app: APP })
	});
	await fetch(`${LUMEN}/admin/bao/${APP}/dev`, {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({
			data: { GONE: 'was-here-before', SAME: '12345', CHANGED: 'short-a' },
			cas: 1
		})
	});
	await fetch(`${LUMEN}/admin/bao/${APP}/dev`, {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({
			data: { SAME: '12345', CHANGED: 'short-b', NEW: 'brand-new-secret-value' },
			cas: 2
		})
	});
	const cp = await ctx.newPage();
	await cp.goto(`${BASE}/secrets/compare?app=${APP}&env=dev&from=2&to=3`, {
		waitUntil: 'networkidle'
	});
	await cp.waitForTimeout(600);
	// split is the default presentation; values are MASKED — the bytes must not appear
	const masked = await cp.evaluate(() => document.body.innerText);
	check(
		'T-cmp1 split view aligns AND masks by default',
		masked.includes('GONE=') &&
			!masked.includes('was-here-before') &&
			!masked.includes('brand-new-secret-value')
	);
	await cp.locator('button[aria-label="Show all values"]').click();
	await cp.waitForTimeout(200);
	const revealed = await cp.evaluate(() => document.body.innerText);
	check(
		'T-cmp2 show-values reveals both panes (display-only switch)',
		revealed.includes('was-here-before') && revealed.includes('brand-new-secret-value')
	);
	await cp.locator('button:has-text("table")').click();
	await cp.waitForTimeout(250);
	const tbl = await cp.evaluate(() => document.body.innerText);
	check(
		'T-cmp3 table view: per-key statuses + honest changed count',
		tbl.includes('changed') &&
			tbl.includes('added') &&
			tbl.includes('removed') &&
			tbl.includes('3 of 4 keys changed'),
		tbl.match(/\d of 4 keys changed/)?.[0] ?? 'no count'
	);
	// raw json is DISABLED in table mode (table is parsed by nature) —
	// leave table first: the honest choreography the UI enforces
	await cp.locator('button:has-text("inline")').click();
	await cp.locator('button:has-text("raw json")').click();
	await cp.waitForTimeout(250);
	const raw = await cp.evaluate(() => document.body.innerText);
	check(
		'T-cmp4 raw JSON mode diffs the serialized shape (braces visible)',
		raw.includes('{') && raw.includes('}')
	);
	// presentation/content persist across reload (localStorage preference)
	await cp.reload({ waitUntil: 'networkidle' });
	await cp.waitForTimeout(400);
	const persisted = await cp.evaluate(() =>
		document
			.querySelector('[aria-label="Presentation"] button[aria-pressed="true"]')
			?.textContent?.trim()
	);
	check(
		'T-cmp5 presentation preference survives reload',
		persisted === 'inline',
		`after reload: ${persisted}`
	);
	// the nav child + canonical env order on the editor (lumen has the trio)
	const navHasCompare = await cp.locator('a[href="/secrets/compare"]').count();
	await cp.goto(`${BASE}/secrets`, { waitUntil: 'networkidle' });
	await cp.waitForTimeout(400);
	const envOrder = await cp.evaluate(() =>
		[
			...document.querySelectorAll(
				'aside [aria-label^="Environment"], button[aria-label^="Environment"]'
			)
		].map((e) => e.getAttribute('aria-label').replace('Environment ', ''))
	);
	const editorEnvOrder = await cp.evaluate(() => {
		const pills = [...document.querySelectorAll('button')].filter((b) =>
			['dev', 'staging', 'production'].includes(b.textContent?.trim() ?? '')
		);
		return pills.map((b) => b.textContent.trim());
	});
	check(
		'T-cmp6 nav carries compare; env pills are dev → staging → production',
		navHasCompare >= 1 && editorEnvOrder.join(',') === 'dev,staging,production',
		editorEnvOrder.join(',') + ` | ${envOrder.join(',')}`
	);
	// mobile: the header stacks, nothing overflows horizontally
	const mp = await ctx.newPage();
	await mp.setViewportSize({ width: 390, height: 844 });
	await mp.goto(`${BASE}/secrets`, { waitUntil: 'networkidle' });
	await mp.waitForTimeout(400);
	const overflow = await mp.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	check(
		'T-cmp7 mobile secrets editor has zero horizontal overflow',
		overflow === 0,
		`overflow=${overflow}px`
	);
	// MOBILE SPLIT: panes stack top-to-bottom (owner screenshot) — 'to'
	// sits BELOW 'from', not beside it
	await mp.goto(`${BASE}/secrets/compare?app=${APP}&env=dev&from=2&to=3`, {
		waitUntil: 'networkidle'
	});
	await mp.waitForTimeout(400);
	await mp.locator('button:has-text("split")').click();
	await mp.waitForTimeout(250);
	const fromBox = await mp.locator('p:has-text("— from")').boundingBox();
	const toBox = await mp.locator('p:has-text("— to")').boundingBox();
	check(
		'T-cmp8 mobile split STACKS panes vertically',
		!!fromBox && !!toBox && toBox.y > fromBox.y + 60 && Math.abs(toBox.x - fromBox.x) < 8,
		JSON.stringify({
			from: fromBox && [Math.round(fromBox.x), Math.round(fromBox.y)],
			to: toBox && [Math.round(toBox.x), Math.round(toBox.y)]
		})
	);
	// wrap toggle: on by default (whitespace-pre-wrap rows), flips to nowrap
	const wrapOn = await mp.locator('[aria-label="Wrap long lines"]').getAttribute('aria-pressed');
	const rowCls = await mp.evaluate(
		() =>
			document.querySelector('.grid [class*="break-words"]')?.className ??
			document.querySelector('.grid [class*="whitespace-pre"]')?.className ??
			''
	);
	await mp.locator('[aria-label="Wrap long lines"]').click();
	await mp.waitForTimeout(200);
	const wrapOff = await mp.locator('[aria-label="Wrap long lines"]').getAttribute('aria-pressed');
	check(
		'T-cmp9 wrap defaults ON and flips (rows follow)',
		wrapOn === 'true' && rowCls.includes('break-words') && wrapOff === 'false',
		`on=${wrapOn} cls=${rowCls ? 'wrapped' : 'EMPTY'} off=${wrapOff}`
	);
	await mp.close();
	await cp.close();
}

// --- T5: error boundary with a dead backend ---
const page2 = await ctx.newPage();
await page2
	.goto(`http://localhost:${DEAD_PORT}/posts`, { waitUntil: 'networkidle', timeout: 20000 })
	.catch(() => {});
const errText = await page2.locator('body').textContent();
check(
	'T5 dead-lumen renders the error panel',
	/lumen is not answering|Something went sideways/i.test(errText ?? ''),
	(errText ?? '').slice(0, 90)
);
await page2.screenshot({ path: '/tmp/opencode/shots/error-503.png' });

await browser.close();
console.log(`\nconsole harness: ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
