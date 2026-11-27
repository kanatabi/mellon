import { describe, expect, it } from 'vitest';
import { isSameOriginPath, renderNotificationBody } from './render.ts';

// The CLIENT half of the two-gate rule (plan §1.4 rule 5): lumen sanitizes
// on write, mellon sanitizes again on render. These pin the allowlist and
// the tricks that must never survive the second gate.
describe('renderNotificationBody — the allowlist survives', () => {
	it('keeps the inline formatting tags', () => {
		const out = renderNotificationBody(
			'<b>a</b><strong>b</strong><i>c</i><em>d</em><u>e</u><s>f</s><code>g</code><br>'
		);
		expect(out).toBe(
			'<b>a</b><strong>b</strong><i>c</i><em>d</em><u>e</u><s>f</s><code>g</code><br>'
		);
	});

	it('keeps a same-origin href (path, query and hash)', () => {
		expect(renderNotificationBody('<a href="/tasks">open</a>')).toBe('<a href="/tasks">open</a>');
		expect(renderNotificationBody('<a href="/tasks?x=1#top">open</a>')).toContain(
			'href="/tasks?x=1#top"'
		);
	});

	it('keeps only color / background-color / font-weight on spans', () => {
		const out = renderNotificationBody(
			'<span style="color: red; background-color: #ffe; font-weight: 600; font-size: 40px; position: fixed">x</span>'
		);
		expect(out).toContain('style="color: red; background-color: #ffe; font-weight: 600"');
		expect(out).not.toContain('font-size');
		expect(out).not.toContain('position');
	});

	it('strips style from every element that is not a span', () => {
		expect(renderNotificationBody('<b style="color: red">x</b>')).not.toContain('style');
	});

	it('returns an empty string for an empty body', () => {
		expect(renderNotificationBody('')).toBe('');
	});
});

describe('renderNotificationBody — the strips', () => {
	it('removes scripts with their content, never leaking the code as text', () => {
		expect(renderNotificationBody('<b>safe</b><script>alert(1)</script>')).toBe('<b>safe</b>');
	});

	it('removes iframes and images entirely', () => {
		const out = renderNotificationBody(
			'<iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)">'
		);
		expect(out).toBe('');
	});

	it('removes event handlers from allowed elements', () => {
		const out = renderNotificationBody('<b onclick="alert(1)" title="x">x</b>');
		expect(out).toBe('<b>x</b>');
	});

	it.each([
		['absolute external', '<a href="https://evil.example">x</a>'],
		['protocol-relative', '<a href="//evil.example">x</a>'],
		['leading backslash', '<a href="/\\evil.example">x</a>'],
		['bare backslashes', '<a href="\\\\evil.example">x</a>'],
		['javascript scheme', '<a href="javascript:alert(1)">x</a>'],
		['data scheme', '<a href="data:text/html,<script>alert(1)</script>">x</a>']
	])('strips an unsafe href: %s', (_name, payload) => {
		const out = renderNotificationBody(payload);
		expect(out).not.toContain('href');
		expect(out).not.toContain('evil.example');
		expect(out).not.toContain('javascript:');
		expect(out).not.toContain('data:');
		// the anchor's text survives — the link is gone, the sentence is not
		expect(out).toContain('x');
	});

	it('strips control characters that URL parsing folds into slashes', () => {
		const out = renderNotificationBody('<a href="/\t/evil.example">x</a>');
		expect(out).not.toContain('href');
	});
});

// The click-through guard shares the same grammar as the sanitizer.
describe('isSameOriginPath', () => {
	it.each(['/', '/tasks', '/tasks?x=1', '/tasks#top'])('accepts %s', (href) => {
		expect(isSameOriginPath(href)).toBe(true);
	});

	it.each([
		'',
		'//evil.example',
		'///evil.example',
		'https://evil.example',
		'tasks',
		'/\\evil.example',
		'/\\/evil.example',
		'\\\\evil.example',
		'/\t/evil.example',
		'/\n/evil.example'
	])('rejects %s', (href) => {
		expect(isSameOriginPath(href)).toBe(false);
	});
});
