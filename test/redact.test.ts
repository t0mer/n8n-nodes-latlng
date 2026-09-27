import { describe, expect, it } from 'vitest';
import { redactDeep, redactUrls } from '../nodes/LatLng/shared/redact';

/** Key-shaped fakes built at runtime, so no key-like literal is ever committed. */
const fakeKey = (prefix: string) => prefix + 'x'.repeat(32);

describe('redactUrls', () => {
	it('redacts key and api_key query values anywhere in a string', () => {
		expect(redactUrls('https://t.example/{z}/{x}/{y}.pbf?key=pk_latlng_abc123&style=dark')).toBe(
			'https://t.example/{z}/{x}/{y}.pbf?key=REDACTED&style=dark',
		);
		expect(redactUrls('GET /reverse?lat=1&api_key=latlng_abcdef failed')).toBe(
			'GET /reverse?lat=1&api_key=REDACTED failed',
		);
	});

	it('leaves other params alone', () => {
		expect(redactUrls('https://x/?monkey=1&keys=2')).toBe('https://x/?monkey=1&keys=2');
	});
});

describe('redactDeep', () => {
	it('redacts TileJSON tile URLs without mutating the input', () => {
		const tilejson = {
			tilejson: '3.0.0',
			tiles: ['https://tiles.latlng.work/v1/tiles/{z}/{x}/{y}.pbf?key=pk_latlng_secret'],
			vector_layers: [{ id: 'roads', minzoom: 0 }],
			maxzoom: 14,
		};
		const out = redactDeep(tilejson);
		expect(out.tiles[0]).toBe('https://tiles.latlng.work/v1/tiles/{z}/{x}/{y}.pbf?key=REDACTED');
		expect(out.vector_layers).toEqual([{ id: 'roads', minzoom: 0 }]);
		expect(out.maxzoom).toBe(14);
		expect(tilejson.tiles[0]).toContain('pk_latlng_secret');
		expect(JSON.stringify(out)).not.toContain('pk_latlng_secret');
	});
});

describe('bare and encoded keys', () => {
	it('redacts bare server and maps keys in free text', () => {
		expect(redactUrls(`Invalid API key ${fakeKey('latlng_')}`)).toBe('Invalid API key REDACTED');
		expect(redactUrls(`key ${fakeKey('pk_latlng_')} not allowed for domain`)).toBe(
			'key REDACTED not allowed for domain',
		);
	});

	it('keeps API values like latlng_places', () => {
		expect(redactUrls('source: latlng_places')).toBe('source: latlng_places');
	});

	it('redacts URL-encoded key params', () => {
		expect(redactUrls('u=https%3A%2F%2Fx%2Fa%3Fkey%3Dabc123%26z%3D1')).toBe(
			'u=https%3A%2F%2Fx%2Fa%3Fkey%3DREDACTED%26z%3D1',
		);
	});

	it('redacts a key stored in its own TileJSON field', () => {
		const fake = fakeKey('pk_latlng_');
		expect(redactDeep({ key: fake })).toEqual({ key: 'REDACTED' });
	});
});
