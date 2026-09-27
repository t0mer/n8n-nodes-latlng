import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { apiMessage } from '../nodes/LatLng/shared/errors';
import { cleanQs, latlngRequest } from '../nodes/LatLng/shared/transport';
import { fakeCtx } from './helpers';

const fail = (statusCode: number, body: unknown = {}) => ({ statusCode, body });

describe('latlngRequest', () => {
	it('uses the credential header for the api host and drops empty params', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { ok: true } }]);
		const res = await latlngRequest(
			ctx,
			{ host: 'api', path: '/api', qs: { q: 'x', lang: '' } },
			0,
		);
		expect(res.body).toEqual({ ok: true });
		expect(calls[0].credentialType).toBe('latLngApi');
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/api',
			qs: { q: 'x' },
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			timeout: 10000,
		});
		expect(calls[0].options.qs).not.toHaveProperty('key');
	});

	it('sends the maps key as a query param with a plain request', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: Buffer.from('pbf') }]);
		const res = await latlngRequest(
			ctx,
			{ host: 'tiles', path: '/v1/tiles/0/0/0.pbf', binary: true, mapsKey: 'pk_latlng_x' },
			0,
		);
		expect(calls[0].credentialType).toBeUndefined();
		expect(calls[0].options).toMatchObject({ qs: { key: 'pk_latlng_x' }, encoding: 'arraybuffer' });
		expect(Buffer.isBuffer(res.body)).toBe(true);
	});

	it.each([
		[401, 'Invalid API key'],
		[403, 'Key not allowed for this endpoint (server vs maps key, or domain restriction)'],
		[429, 'LatLng quota exceeded; resets daily on the free plan'],
	])('maps %i to a clear message', async (status, message) => {
		const { ctx } = fakeCtx([fail(status)]);
		const error = await latlngRequest(ctx, { host: 'api', path: '/x' }, 3).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe(message);
		expect(error.httpCode).toBe(String(status));
		expect(error.context.itemIndex).toBe(3);
	});

	it('includes the API message on 400', async () => {
		const { ctx } = fakeCtx([fail(400, { error: 'q is required' })]);
		const error = await latlngRequest(ctx, { host: 'api', path: '/api' }, 0).catch((e) => e);
		expect(error.message).toBe('Bad request: q is required');
	});

	it('parses error bodies returned as bytes for binary requests', async () => {
		const { ctx } = fakeCtx([fail(400, Buffer.from('{"message":"bad center"}'))]);
		const error = await latlngRequest(
			ctx,
			{ host: 'api', path: '/v1/static', binary: true },
			0,
		).catch((e) => e);
		expect(error.message).toBe('Bad request: bad center');
	});

	it('adds the error hint to the description', async () => {
		const { ctx } = fakeCtx([fail(414)]);
		const error = await latlngRequest(
			ctx,
			{ host: 'api', path: '/v1/static', errorHint: () => 'Try fewer markers.' },
			0,
		).catch((e) => e);
		expect(error.description).toContain('Try fewer markers.');
	});

	it('wraps network failures without leaking keys', async () => {
		const { ctx } = fakeCtx([
			new Error(
				'timeout of 10000ms exceeded for https://tiles.latlng.work/v1/metadata?key=pk_latlng_secret123',
			),
		]);
		const error = await latlngRequest(
			ctx,
			{ host: 'tiles', path: '/v1/metadata', mapsKey: 'k' },
			0,
		).catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toContain('key=REDACTED');
		expect(error.message).not.toContain('pk_latlng_secret123');
	});
});

describe('apiMessage', () => {
	it('prefers message over error, and handles plain text', () => {
		expect(apiMessage({ error: 'code', message: 'Human text' })).toBe('Human text');
		expect(apiMessage('Service Unavailable')).toBe('Service Unavailable');
		expect(apiMessage(undefined)).toBeUndefined();
	});
});

describe('cleanQs', () => {
	it('keeps zero and false, drops blanks', () => {
		expect(cleanQs({ a: 0, b: false, c: '', d: undefined, e: null, f: [] })).toEqual({
			a: 0,
			b: false,
		});
	});
});
