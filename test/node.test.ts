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
					{ resource: 'geocoding', operation: 'forward', query: 'one', simplify: false },
					{ resource: 'geocoding', operation: 'forward', query: 'two', simplify: false },
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
					{ resource: 'geocoding', operation: 'forward', query: 'good', simplify: false },
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
				simplify: false,
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

describe('place autosuggest and categories', () => {
	it('autosuggest hits the suggest host with bbox in lng,lat order and caps limit at 20', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { results: [] } }], {
			params: {
				resource: 'place',
				operation: 'autosuggest',
				query: 'Dizen',
				maxResults: 50,
				filters: {
					country: 'il',
					boundingBox: { box: { minLat: 32.0, minLon: 34.7, maxLat: 32.1, maxLon: 34.9 } },
				},
			},
		});
		await run(ctx);
		expect(calls[0].credentialType).toBe('latLngApi');
		expect(calls[0].options).toMatchObject({
			url: 'https://suggest.latlng.work/autosuggest',
			qs: { q: 'Dizen', country: 'il', bbox: '34.7,32,34.9,32.1', limit: 20 },
		});
	});

	it('autosuggest needs 2 characters', async () => {
		const { ctx } = fakeCtx([], {
			params: { resource: 'place', operation: 'autosuggest', query: 'D' },
		});
		await expect(run(ctx)).rejects.toThrow(/at least 2 characters/);
	});

	it('autosuggest rejects radius without a near point', async () => {
		const { ctx } = fakeCtx([], {
			params: {
				resource: 'place',
				operation: 'autosuggest',
				query: 'Di',
				filters: { radius: 100 },
			},
		});
		await expect(run(ctx)).rejects.toThrow(/Radius needs/);
	});

	it('getCategories calls the categories endpoint', async () => {
		const body = { categories: [{ name: 'cafe', count: 10 }] };
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body }], {
			params: { resource: 'place', operation: 'getCategories' },
		});
		const [out] = await run(ctx);
		expect(calls[0].options.url).toBe('https://api.latlng.work/v1/places/categories');
		expect(out).toEqual([{ json: { name: 'cafe', count: 10 }, pairedItem: { item: 0 } }]);
	});
});

describe('simplify and empty results', () => {
	const featureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [34.774, 32.0779] },
				properties: { name: 'Dizengoff Square', city: 'Tel Aviv', type: 'square' },
			},
			{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [34.78, 32.08] },
				properties: { name: 'Other' },
			},
		],
	};

	it('splits geocoding features into flat items with lat/lon', async () => {
		const { ctx } = fakeCtx([{ statusCode: 200, body: featureCollection }], {
			params: { resource: 'geocoding', operation: 'forward', query: 'x' },
		});
		const [out] = await run(ctx);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({
			json: {
				name: 'Dizengoff Square',
				lat: 32.0779,
				lon: 34.774,
				city: 'Tel Aviv',
				type: 'square',
			},
			pairedItem: { item: 0 },
		});
	});

	it('splits places into one item each', async () => {
		const places = [
			{ name: 'A', lat: 32.08, lon: 34.78, category: 'cafe', distance_m: 12 },
			{ name: 'B', lat: 32.09, lon: 34.79, category: 'cafe', distance_m: 40 },
		];
		const { ctx } = fakeCtx([{ statusCode: 200, body: { type: 'nearby', count: 2, places } }], {
			params: { resource: 'place', operation: 'nearby', latitude: 32.08, longitude: 34.78 },
		});
		const [out] = await run(ctx);
		expect(out.map((o) => o.json)).toEqual(places);
	});

	it('returns nothing for zero results by default', async () => {
		const { ctx } = fakeCtx([{ statusCode: 200, body: { results: [] } }], {
			params: { resource: 'place', operation: 'autosuggest', query: 'zzz' },
		});
		expect(await run(ctx)).toEqual([[]]);
	});

	it('returns a found:false item when Return Empty Item is on', async () => {
		const { ctx } = fakeCtx([{ statusCode: 200, body: { places: [] } }], {
			params: {
				resource: 'place',
				operation: 'search',
				query: 'zzz',
				maxResults: 3,
				options: { returnEmptyItem: true },
			},
		});
		const [out] = await run(ctx);
		expect(out).toEqual([
			{ json: { found: false, query: { q: 'zzz', limit: 3 } }, pairedItem: { item: 0 } },
		]);
	});

	it('returns the raw response as one item when Simplify is off', async () => {
		const { ctx } = fakeCtx([{ statusCode: 200, body: featureCollection }], {
			params: {
				resource: 'geocoding',
				operation: 'reverse',
				latitude: 32,
				longitude: 34,
				simplify: false,
			},
		});
		const [out] = await run(ctx);
		expect(out).toEqual([{ json: featureCollection, pairedItem: { item: 0 } }]);
	});
});

describe('rate limit info', () => {
	it('adds rateLimit from the response headers to every item', async () => {
		const { ctx } = fakeCtx(
			[
				{
					statusCode: 200,
					headers: { 'x-ratelimit-limit': '3000', 'x-ratelimit-remaining': '2987' },
					body: { places: [{ name: 'A' }, { name: 'B' }] },
				},
			],
			{
				params: {
					resource: 'place',
					operation: 'search',
					query: 'x',
					options: { includeRateLimit: true },
				},
			},
		);
		const [out] = await run(ctx);
		expect(out.map((o) => o.json.rateLimit)).toEqual([
			{ limit: 3000, remaining: 2987 },
			{ limit: 3000, remaining: 2987 },
		]);
	});

	it('uses null when the headers are missing and is off by default', async () => {
		const withOption = fakeCtx([{ statusCode: 200, body: { categories: [{ name: 'a' }] } }], {
			params: {
				resource: 'place',
				operation: 'getCategories',
				options: { includeRateLimit: true },
			},
		});
		const [out] = await run(withOption.ctx);
		expect(out[0].json.rateLimit).toEqual({ limit: null, remaining: null });

		const without = fakeCtx(
			[
				{
					statusCode: 200,
					headers: { 'x-ratelimit-limit': '1' },
					body: { categories: [{ name: 'a' }] },
				},
			],
			{ params: { resource: 'place', operation: 'getCategories' } },
		);
		const [plain] = await run(without.ctx);
		expect(plain[0].json).not.toHaveProperty('rateLimit');
	});
});
