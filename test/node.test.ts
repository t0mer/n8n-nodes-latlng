import { NodeOperationError, type IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';
import { LatLng } from '../nodes/LatLng/LatLng.node';
import { fakeCtx } from './helpers';

vi.mock('n8n-workflow', async (importOriginal) => ({
	...(await importOriginal<typeof import('n8n-workflow')>()),
	sleep: vi.fn(async () => {}),
}));

const node = new LatLng();
const run = (ctx: IExecuteFunctions) => node.execute.call(ctx);

describe('LatLng node description', () => {
	it('is usable as a tool and uses the credential', () => {
		expect(node.description.usableAsTool).toBe(true);
		expect(node.description.credentials).toEqual([{ name: 'latLngApi', required: true }]);
	});
});

describe('router', () => {
	it('pairs every output item with its input item', async () => {
		const { ctx } = fakeCtx(
			[
				{ statusCode: 200, body: { a: 1 } },
				{ statusCode: 200, body: { a: 2 } },
			],
			{
				params: [
					{ resource: 'geocoding', operation: 'forward', query: 'one' },
					{ resource: 'geocoding', operation: 'forward', query: 'two' },
				],
			},
		);
		const [out] = await run(ctx);
		expect(out.map((o) => o.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('emits an error item per failed input with continueOnFail', async () => {
		const { ctx } = fakeCtx(
			[
				{ statusCode: 401, body: { error: 'invalid key' } },
				{ statusCode: 200, body: { ok: 1 } },
			],
			{
				params: [
					{ resource: 'geocoding', operation: 'forward', query: 'bad' },
					{ resource: 'geocoding', operation: 'forward', query: 'good' },
				],
				continueOnFail: true,
			},
		);
		const [out] = await run(ctx);
		expect(out).toEqual([
			{ json: { error: 'Invalid API key', statusCode: 401 }, pairedItem: { item: 0 } },
			{ json: { ok: 1 }, pairedItem: { item: 1 } },
		]);
	});

	it('throws validation errors with the item index', async () => {
		const { ctx, calls } = fakeCtx([], {
			params: { resource: 'geocoding', operation: 'reverse', latitude: 120, longitude: 34 },
		});
		const error = await run(ctx).catch((e) => e);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toMatch(/Latitude .* \[item 0\]/);
		expect(calls).toHaveLength(0);
	});
});

describe('geocoding', () => {
	it('forward sends q, limit and lang', async () => {
		const body = { type: 'FeatureCollection', features: [] };
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body }], {
			params: {
				resource: 'geocoding',
				operation: 'forward',
				query: '  Dizengoff Square, Tel Aviv ',
				maxResults: 1,
				options: { language: 'he' },
			},
		});
		const [out] = await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/api',
			qs: { q: 'Dizengoff Square, Tel Aviv', limit: 1, lang: 'he' },
		});
		expect(out[0].json).toEqual(body);
	});

	it('forward rejects a blank query', async () => {
		const { ctx } = fakeCtx([], {
			params: { resource: 'geocoding', operation: 'forward', query: '  ' },
		});
		await expect(run(ctx)).rejects.toThrow(/Address or Place needs a value/);
	});

	it('reverse sends lat and lon without swapping them', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { features: [] } }], {
			params: { resource: 'geocoding', operation: 'reverse', latitude: 32.08, longitude: 34.78 },
		});
		await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/reverse',
			qs: { lat: 32.08, lon: 34.78 },
		});
	});
});

describe('place search and nearby', () => {
	it('search sends q, bias point, filters and limit', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { places: [] } }], {
			params: {
				resource: 'place',
				operation: 'search',
				query: 'coffee',
				maxResults: 5,
				filters: { latitude: 32.08, longitude: 34.78, country: 'IL', category: 'cafe' },
			},
		});
		await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/v1/places/search',
			qs: { q: 'coffee', lat: 32.08, lon: 34.78, country: 'IL', category: 'cafe', limit: 5 },
		});
	});

	it('search rejects a half-set bias point', async () => {
		const { ctx } = fakeCtx([], {
			params: { resource: 'place', operation: 'search', query: 'x', filters: { latitude: 32 } },
		});
		await expect(run(ctx)).rejects.toThrow(/both Near Latitude and Near Longitude/);
	});

	it('nearby sends lat, lon, radius, category and limit', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { places: [] } }], {
			params: {
				resource: 'place',
				operation: 'nearby',
				latitude: 32.08,
				longitude: 34.78,
				radius: 500,
				maxResults: 5,
				filters: { category: 'cafe' },
			},
		});
		await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/v1/places/nearby',
			qs: { lat: 32.08, lon: 34.78, radius: 500, category: 'cafe', limit: 5 },
		});
		expect(calls[0].options.qs).not.toHaveProperty('country');
	});
});
