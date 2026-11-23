import { describe, expect, it } from 'vitest';
import { GENERAL_BODY_LIMIT, MAX_UPLOAD_BYTES, MULTIPART_SLACK, formatBytes } from './upload.ts';

describe('upload ceilings', () => {
	it('the photo ceiling equals lumen media.MaxBytes (100 MiB)', () => {
		expect(MAX_UPLOAD_BYTES).toBe(104857600);
		expect(MULTIPART_SLACK).toBe(1024 * 1024);
		expect(GENERAL_BODY_LIMIT).toBe(16 * 1024 * 1024);
		expect(GENERAL_BODY_LIMIT).toBeLessThan(MAX_UPLOAD_BYTES); // the guard must bite BEFORE the relay's
	});
});

describe('formatBytes', () => {
	it('bytes stay integers with the B label', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1)).toBe('1 B');
		expect(formatBytes(1023)).toBe('1023 B');
	});
	it('crosses into KB at 1024, one decimal while small', () => {
		expect(formatBytes(1024)).toBe('1.0 KB');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(9 * 1024)).toBe('9.0 KB');
		expect(formatBytes(10 * 1024)).toBe('10.0 KB');
		expect(formatBytes(99 * 1024)).toBe('99.0 KB');
		expect(formatBytes(100 * 1024)).toBe('100 KB');
	});
	it('MB rounds to one decimal (the base64-era example)', () => {
		expect(formatBytes(33636879)).toBe('32.1 MB');
	});
	it('the 100 MiB ceiling renders without decimals', () => {
		expect(formatBytes(MAX_UPLOAD_BYTES)).toBe('100 MB');
	});
	it('GB labels the big ones', () => {
		expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
		expect(formatBytes(5.5 * 1024 ** 3)).toBe('5.5 GB');
	});
	it('never exceeds the GB label (no TB units)', () => {
		expect(formatBytes(4096 * 1024 ** 3)).toBe('4096 GB');
	});
});
