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

describe('static map', () => {
	const params = {
		resource: 'staticMap',
		operation: 'getImage',
		framing: 'center',
		latitude: 32.0779,
		longitude: 34.774,
		zoom: 15,
		width: 800,
		height: 500,
		style: 'light',
		format: 'png',
		binaryPropertyName: 'map',
		markers: { marker: [{ latitude: 32.0779, longitude: 34.774, color: '#e11d48', label: 'D' }] },
		paths: {
			path: [
				{
					weight: 4,
					color: '#2563eb',
					opacity: 0.5,
					points: {
						point: [
							{ latitude: 32.0779, longitude: 34.774 },
							{ latitude: 32.079, longitude: 34.7755 },
						],
					},
				},
			],
		},
	};

	it('returns the image as binary with request params in JSON', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const { ctx, calls } = fakeCtx(
			[{ statusCode: 200, headers: { 'content-type': 'image/png' }, body: png }],
			{ params },
		);
		const [out] = await run(ctx);
		expect(calls[0].credentialType).toBe('latLngApi');
		expect(calls[0].options).toMatchObject({
			url: 'https://api.latlng.work/v1/static',
			encoding: 'arraybuffer',
			qs: {
				center: '34.774,32.0779',
				zoom: 15,
				width: 800,
				height: 500,
				style: 'light',
				format: 'png',
				markers: '34.774,32.0779,e11d48,D',
				path: ['4:2563eb:0.5|34.774,32.0779|34.7755,32.079'],
			},
		});
		expect(out[0].binary?.map).toMatchObject({ fileName: 'latlng-map.png', mimeType: 'image/png' });
		expect(out[0].json).toMatchObject({ center: '34.774,32.0779', fileSize: 4 });
		expect(JSON.stringify(out[0].json)).not.toMatch(/key/i);
	});

	it('uses a .jpg name and the format mime type when the header is missing', async () => {
		const { ctx } = fakeCtx([{ statusCode: 200, body: Buffer.from('jpg') }], {
			params: { ...params, format: 'jpeg', markers: {}, paths: {} },
		});
		const [out] = await run(ctx);
		expect(out[0].binary?.map).toMatchObject({
			fileName: 'latlng-map.jpg',
			mimeType: 'image/jpeg',
		});
	});

	it('explains a 400 on a very long request', async () => {
		const marker = Array.from({ length: 300 }, (_, n) => ({
			latitude: 32 + n / 1000,
			longitude: 34.7,
			label: `M${n}`,
		}));
		const { ctx } = fakeCtx([{ statusCode: 400, body: { error: 'Bad Request' } }], {
			params: { ...params, markers: { marker }, paths: {} },
		});
		const error = await run(ctx).catch((e) => e);
		expect(error.message).toBe('Bad request: Bad Request');
		expect(error.description).toMatch(/use fewer markers or paths/);
	});

	it('validates before calling the API', async () => {
		const { ctx, calls } = fakeCtx([], { params: { ...params, zoom: 25 } });
		await expect(run(ctx)).rejects.toThrow(/Zoom/);
		expect(calls).toHaveLength(0);
	});
});

describe('tile and dataset', () => {
	const withMapsKey = { apiKey: 'latlng_test', mapsKey: 'pk_latlng_testkey' };

	it('requires a maps key and does not call the API without one', async () => {
		const { ctx, calls } = fakeCtx([], { params: { resource: 'tile', operation: 'getMetadata' } });
		await expect(run(ctx)).rejects.toThrow(/need a Maps key \(pk_latlng_…\)/);
		expect(calls).toHaveLength(0);
	});

	it('tile metadata passes the key as a query param and redacts it from TileJSON', async () => {
		const tilejson = {
			tilejson: '3.0.0',
			tiles: ['https://tiles.latlng.work/v1/tiles/{z}/{x}/{y}.pbf?key=pk_latlng_testkey'],
			maxzoom: 14,
		};
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: tilejson }], {
			params: { resource: 'tile', operation: 'getMetadata' },
			credentials: withMapsKey,
		});
		const [out] = await run(ctx);
		expect(calls[0].credentialType).toBeUndefined();
		expect(calls[0].options).toMatchObject({
			url: 'https://tiles.latlng.work/v1/metadata',
			qs: { key: 'pk_latlng_testkey' },
		});
		expect(out[0].json.tiles).toEqual([
			'https://tiles.latlng.work/v1/tiles/{z}/{x}/{y}.pbf?key=REDACTED',
		]);
		expect(JSON.stringify(out)).not.toContain('pk_latlng_testkey');
	});

	it('vector tile returns protobuf binary named z-x-y.pbf', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: Buffer.from([0x1a, 0x02]) }], {
			params: {
				resource: 'tile',
				operation: 'getTile',
				z: 14,
				x: 9774,
				y: 6649,
				binaryPropertyName: 'data',
			},
			credentials: withMapsKey,
		});
		const [out] = await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://tiles.latlng.work/v1/tiles/14/9774/6649.pbf',
			encoding: 'arraybuffer',
		});
		expect(out[0].binary?.data).toMatchObject({
			fileName: '14-9774-6649.pbf',
			mimeType: 'application/x-protobuf',
		});
		expect(out[0].json).toMatchObject({ z: 14, x: 9774, y: 6649, fileSize: 2 });
	});

	it.each([
		[{ z: 2, x: 4, y: 0 }, /Column \(X\) must be a whole number from 0 to 3 at zoom 2/],
		[{ z: 2, x: 0, y: -1 }, /Row \(Y\)/],
		[{ z: 1.5, x: 0, y: 0 }, /Zoom/],
	])('rejects tile coords %o', async (coords, pattern) => {
		const { ctx, calls } = fakeCtx([], {
			params: { resource: 'tile', operation: 'getTile', binaryPropertyName: 'data', ...coords },
			credentials: withMapsKey,
		});
		await expect(run(ctx)).rejects.toThrow(pattern);
		expect(calls).toHaveLength(0);
	});

	it('dataset tile uses the dataset path and caps zoom at 14', async () => {
		const ok = fakeCtx([{ statusCode: 200, body: Buffer.from('x') }], {
			params: {
				resource: 'dataset',
				operation: 'getTile',
				datasetId: 'ds_abc123',
				z: 3,
				x: 1,
				y: 2,
				binaryPropertyName: 'data',
			},
			credentials: withMapsKey,
		});
		await run(ok.ctx);
		expect(ok.calls[0].options.url).toBe(
			'https://tiles.latlng.work/v1/datasets/ds_abc123/3/1/2.pbf',
		);

		const tooDeep = fakeCtx([], {
			params: { resource: 'dataset', operation: 'getTile', datasetId: 'ds_1', z: 15, x: 0, y: 0 },
			credentials: withMapsKey,
		});
		await expect(run(tooDeep.ctx)).rejects.toThrow(/Zoom must be a whole number from 0 to 14/);
	});

	it('dataset metadata rejects unsafe IDs', async () => {
		const { ctx } = fakeCtx([], {
			params: { resource: 'dataset', operation: 'getMetadata', datasetId: '../x' },
			credentials: withMapsKey,
		});
		await expect(run(ctx)).rejects.toThrow(/Dataset ID may only contain/);
	});

	it('maps a 403 on the tiles host without echoing the key', async () => {
		const { ctx } = fakeCtx([{ statusCode: 403, body: { error: 'Secret keys are rejected' } }], {
			params: { resource: 'dataset', operation: 'getMetadata', datasetId: 'ds_1' },
			credentials: withMapsKey,
		});
		const error = await run(ctx).catch((e) => e);
		expect(error.message).toMatch(/^Key not allowed/);
		expect(JSON.stringify(error)).not.toContain('pk_latlng_testkey');
	});
});

describe('radius and bias validation', () => {
	it.each([20000, -5, 12.5])('rejects nearby radius %s set by an expression', async (radius) => {
		const { ctx, calls } = fakeCtx([], {
			params: { resource: 'place', operation: 'nearby', latitude: 32, longitude: 34, radius },
		});
		await expect(run(ctx)).rejects.toThrow(
			/Radius must be a whole number of meters from 1 to 5000/,
		);
		expect(calls).toHaveLength(0);
	});

	it('autosuggest sends the near point unswapped with radius', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { results: [] } }], {
			params: {
				resource: 'place',
				operation: 'autosuggest',
				query: 'Di',
				filters: { latitude: 32.08, longitude: 34.78, radius: 800 },
			},
		});
		await run(ctx);
		expect(calls[0].options.qs).toMatchObject({ lat: 32.08, lon: 34.78, radius: 800 });
	});
});

describe('coverage gaps', () => {
	const withMapsKey = { apiKey: 'latlng_test', mapsKey: 'pk_latlng_testkey' };

	it('dataset metadata calls /v1/datasets/{id}/metadata', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: { minzoom: 0, maxzoom: 14 } }], {
			params: { resource: 'dataset', operation: 'getMetadata', datasetId: 'ds_abc123' },
			credentials: withMapsKey,
		});
		const [out] = await run(ctx);
		expect(calls[0].options).toMatchObject({
			url: 'https://tiles.latlng.work/v1/datasets/ds_abc123/metadata',
			qs: { key: 'pk_latlng_testkey' },
		});
		expect(out[0].json).toEqual({ minzoom: 0, maxzoom: 14 });
	});

	it('continueOnFail turns validation and network errors into error items', async () => {
		const { ctx } = fakeCtx([new Error('getaddrinfo ENOTFOUND api.latlng.work')], {
			params: [
				{ resource: 'geocoding', operation: 'reverse', latitude: 99, longitude: 0 },
				{ resource: 'geocoding', operation: 'reverse', latitude: 1, longitude: 2 },
			],
			continueOnFail: true,
		});
		const [out] = await run(ctx);
		expect(out).toEqual([
			{ json: { error: expect.stringMatching(/^Latitude must be/) }, pairedItem: { item: 0 } },
			{
				// n8n substitutes its own wording for DNS failures.
				json: {
					error: expect.stringMatching(/Could not reach LatLng|connection cannot be established/),
				},
				pairedItem: { item: 1 },
			},
		]);
	});

	it('rate limit info keeps the binary data on static maps and tiles', async () => {
		const headers = { 'x-ratelimit-limit': '3000', 'x-ratelimit-remaining': '42' };
		const map = fakeCtx([{ statusCode: 200, headers, body: Buffer.from('png') }], {
			params: {
				resource: 'staticMap',
				operation: 'getImage',
				framing: 'center',
				latitude: 32,
				longitude: 34,
				zoom: 10,
				width: 100,
				height: 100,
				style: 'dark',
				format: 'png',
				binaryPropertyName: 'data',
				options: { includeRateLimit: true },
			},
		});
		const [mapOut] = await run(map.ctx);
		expect(mapOut[0].binary?.data).toMatchObject({ fileName: 'latlng-map.png' });
		expect(mapOut[0].json.rateLimit).toEqual({ limit: 3000, remaining: 42 });

		const tile = fakeCtx([{ statusCode: 200, headers, body: Buffer.from('pbf') }], {
			params: {
				resource: 'tile',
				operation: 'getTile',
				z: 0,
				x: 0,
				y: 0,
				binaryPropertyName: 'data',
				options: { includeRateLimit: true },
			},
			credentials: withMapsKey,
		});
		const [tileOut] = await run(tile.ctx);
		expect(tileOut[0].binary?.data).toMatchObject({ fileName: '0-0-0.pbf' });
		expect(tileOut[0].json.rateLimit).toEqual({ limit: 3000, remaining: 42 });
	});
});

describe('tile zoom', () => {
	it('caps base map tiles at the TileJSON maxzoom (15)', async () => {
		const { ctx, calls } = fakeCtx([], {
			params: {
				resource: 'tile',
				operation: 'getTile',
				z: 16,
				x: 0,
				y: 0,
				binaryPropertyName: 'data',
			},
			credentials: { apiKey: 'latlng_test', mapsKey: 'pk_latlng_testkey' },
		});
		await expect(run(ctx)).rejects.toThrow(/Zoom must be a whole number from 0 to 15/);
		expect(calls).toHaveLength(0);
	});
});

describe('static map framing', () => {
	it('bounding box framing does not read the hidden center fields', async () => {
		const { ctx, calls } = fakeCtx([{ statusCode: 200, body: Buffer.from('png') }], {
			params: {
				resource: 'staticMap',
				operation: 'getImage',
				framing: 'bbox',
				minLatitude: 32.07,
				minLongitude: 34.77,
				maxLatitude: 32.09,
				maxLongitude: 34.79,
				width: 400,
				height: 300,
				style: 'dark',
				format: 'png',
				binaryPropertyName: 'data',
			},
		});
		await run(ctx);
		expect(calls[0].options.qs).toMatchObject({ bbox: '34.77,32.07,34.79,32.09' });
		expect(calls[0].options.qs).not.toHaveProperty('center');
	});
});
