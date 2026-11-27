// The bell + panel contract: pull-on-open (never polled), sanitized body
// rendering, mark-read + same-origin click-through, mark-all, and the
// quiet empty/error states. The relay client is mocked — this file is
// about the UI's behavior, not the wire (api.test.ts owns the twin).
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '#lib/api/types.ts';
import NotificationBell from './NotificationBell.svelte';

const api = vi.hoisted(() => ({
	notifications: vi.fn(),
	notificationMarkRead: vi.fn(),
	notificationsMarkAllRead: vi.fn()
}));
const goto = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/client.ts', () => ({
	client: api,
	errorText: (e: unknown) => (e instanceof Error ? e.message : String(e))
}));
vi.mock('$app/navigation', () => ({ goto }));

function row(overrides: Partial<NotificationItem> = {}): NotificationItem {
	const now = Date.now();
	return {
		id: 'n1',
		app: 'tasks',
		type: 'project.invite',
		title: '📦 You have an invite',
		body: '<b>admin</b> invited you. <a href="/tasks">open tasks</a> <a href="https://evil.example">evil</a><script>alert(1)</script>',
		payload: { url: '/tasks' },
		readAt: null,
		expiresAt: new Date(now + 86_400_000).toISOString(),
		createdAt: new Date(now - 60_000).toISOString(),
		...overrides
	};
}

const page = () => ({
	items: [
		row(),
		row({
			id: 'n2',
			title: 'A quiet, already-read row',
			body: 'plain <code>body</code>',
			payload: {},
			readAt: new Date().toISOString()
		})
	],
	nextBefore: null
});

beforeEach(() => {
	api.notifications.mockReset();
	api.notificationMarkRead.mockReset();
	api.notificationsMarkAllRead.mockReset();
	goto.mockReset();
	api.notifications.mockResolvedValue(page());
	api.notificationMarkRead.mockResolvedValue(undefined);
	api.notificationsMarkAllRead.mockResolvedValue(1);
});

describe('the notifications bell + panel', () => {
	it('opens, fetches once per open, renders sanitized rows, marks read and navigates', async () => {
		const c = render(NotificationBell, { count: 1 });
		const trigger = screen.getByRole('button', { name: 'Notifications (1 unread)' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(c.container.querySelector('[data-slot="notification-badge"]')?.textContent?.trim()).toBe(
			'1'
		);

		await fireEvent.click(trigger);
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		expect(api.notifications).toHaveBeenCalledWith({ limit: 20 });

		const rows = await waitFor(() => {
			const found = document.querySelectorAll<HTMLElement>('[data-slot="notification-row"]');
			expect(found).toHaveLength(2);
			return [...found];
		});

		// The sanitized body: formatting stays, scripts/external links do not.
		expect(rows[0].textContent).toContain('📦 You have an invite');
		expect(rows[0].innerHTML).toContain('<b>admin</b>');
		expect(rows[0].innerHTML).not.toContain('<script');
		expect(rows[0].querySelector('a[href="/tasks"]')).toBeTruthy();
		expect(rows[0].querySelector('a[href="https://evil.example"]')).toBeNull();
		// Unread highlight only on the unread row.
		expect(rows[0].dataset.unread).toBe('true');
		expect(rows[1].dataset.unread).toBeUndefined();

		await fireEvent.click(rows[0]);
		await waitFor(() => expect(api.notificationMarkRead).toHaveBeenCalledWith('n1'));
		await waitFor(() => expect(goto).toHaveBeenCalledWith('/tasks'));
		// The badge decremented and the panel closed on the click-through.
		expect(c.container.querySelector('[data-slot="notification-badge"]')).toBeNull();
	});

	it('verifies a second open is a fresh fetch, and mark-all clears badge + rows', async () => {
		const c = render(NotificationBell, { count: 2 });
		const trigger = screen.getByRole('button', { name: 'Notifications (2 unread)' });

		await fireEvent.click(trigger);
		await waitFor(() => expect(api.notifications).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(document.querySelectorAll('[data-slot="notification-row"]')).toHaveLength(2)
		);

		// Close (the trigger is the toggle), then open again: a fresh page.
		await fireEvent.click(trigger);
		await waitFor(() =>
			expect(document.querySelector('[data-slot="notification-row"]')).toBeNull()
		);
		await fireEvent.click(trigger);
		await waitFor(() => expect(api.notifications).toHaveBeenCalledTimes(2));

		const markAll = await screen.findByRole('button', { name: /mark all read/i });
		await fireEvent.click(markAll);
		await waitFor(() => expect(api.notificationsMarkAllRead).toHaveBeenCalledTimes(1));

		expect(c.container.querySelector('[data-slot="notification-badge"]')).toBeNull();
		await waitFor(() => {
			for (const r of document.querySelectorAll<HTMLElement>('[data-slot="notification-row"]')) {
				expect(r.dataset.unread).toBeUndefined();
			}
		});
	});

	it('shows the quiet empty state', async () => {
		api.notifications.mockResolvedValue({ items: [], nextBefore: null });
		const c = render(NotificationBell, { count: 0 });
		expect(c.container.querySelector('[data-slot="notification-badge"]')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		expect(await screen.findByText("you're all caught up")).toBeTruthy();
	});

	it('shows the quiet inline error, never a thrown page', async () => {
		api.notifications.mockRejectedValue(new Error('the backend is unreachable'));
		render(NotificationBell, { count: 0 });

		await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		expect(await screen.findByText("couldn't load notifications")).toBeTruthy();
		expect(await screen.findByText('the backend is unreachable')).toBeTruthy();
		// Retry is a real button, not a hover-only affordance.
		expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
	});

	it('caps the badge at 99+ while keeping the true count in the label', () => {
		const c = render(NotificationBell, { count: 120 });
		expect(screen.getByRole('button', { name: 'Notifications (120 unread)' })).toBeTruthy();
		expect(c.container.querySelector('[data-slot="notification-badge"]')?.textContent?.trim()).toBe(
			'99+'
		);
	});
});
