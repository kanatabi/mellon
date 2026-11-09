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
