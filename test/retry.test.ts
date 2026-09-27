import { sleep } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { latlngRequest } from '../nodes/LatLng/shared/transport';
import { fakeCtx } from './helpers';

vi.mock('n8n-workflow', async (importOriginal) => ({
	...(await importOriginal<typeof import('n8n-workflow')>()),
	sleep: vi.fn(async () => {}),
}));

const ok = { statusCode: 200, body: { ok: true } };

describe('retry', () => {
	beforeEach(() => vi.mocked(sleep).mockClear());

	it('retries 429 and 5xx with 1 s then 3 s backoff', async () => {
		const { ctx, calls } = fakeCtx([
			{ statusCode: 429, body: {} },
			{ statusCode: 503, body: {} },
			ok,
		]);
		const res = await latlngRequest(ctx, { host: 'api', path: '/api' }, 0);
		expect(res.body).toEqual({ ok: true });
		expect(calls).toHaveLength(3);
		expect(vi.mocked(sleep).mock.calls).toEqual([[1000], [3000]]);
	});

	it('gives up after 2 retries', async () => {
		const { ctx, calls } = fakeCtx([
			{ statusCode: 500, body: {} },
			{ statusCode: 500, body: {} },
			{ statusCode: 500, body: {} },
		]);
		const error = await latlngRequest(ctx, { host: 'api', path: '/api' }, 0).catch((e) => e);
		expect(calls).toHaveLength(3);
		expect(error.message).toBe('LatLng server error (500)');
	});

	it.each([400, 401, 403, 404])('does not retry %i', async (status) => {
		const { ctx, calls } = fakeCtx([{ statusCode: status, body: {} }]);
		await latlngRequest(ctx, { host: 'api', path: '/api' }, 0).catch(() => undefined);
		expect(calls).toHaveLength(1);
		expect(sleep).not.toHaveBeenCalled();
	});
});
