// Live smoke test against the real LatLng API. Not part of `npm test` or CI.
// Reads keys from .env, calls each operation once (≤ 15 calls), writes sanitized responses to
// test/fixtures/live/ and prints pass/fail per operation plus X-RateLimit-Remaining.
// Plain .mjs on purpose: the node lint rules (no process/console) apply to every .ts file.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'test/fixtures/live');

function loadEnv() {
	let text;
	try {
		text = readFileSync(join(root, '.env'), 'utf8');
	} catch {
		console.error('Missing .env with LATLNG_API_KEY (see CLAUDE.md, section 2).');
		process.exit(2);
	}
	const env = {};
	for (const line of text.split('\n')) {
		const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/);
		if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return env;
}

const env = loadEnv();
const apiKey = env.LATLNG_API_KEY;
const mapsKey = env.LATLNG_MAPS_KEY || '';
const datasetId = env.LATLNG_DATASET_ID || '';
if (!apiKey) {
	console.error('LATLNG_API_KEY is not set in .env');
	process.exit(2);
}
const secrets = [apiKey, mapsKey].filter(Boolean);

/** Removes key values from any string: literal key values and key=/api_key= params. */
function sanitize(value) {
	if (typeof value === 'string') {
		let s = value.replace(/([?&](?:key|api_key)=)[^&#\s"']*/gi, '$1REDACTED');
		for (const secret of secrets) s = s.split(secret).join('REDACTED');
		return s;
	}
	if (Array.isArray(value)) return value.map(sanitize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
	}
	return value;
}

const HOSTS = {
	api: 'https://api.latlng.work',
	suggest: 'https://suggest.latlng.work',
	tiles: 'https://tiles.latlng.work',
};

let calls = 0;
let remaining = '?';
const results = [];

async function call(name, host, path, params, { auth = 'server', binary = false } = {}) {
	const url = new URL(HOSTS[host] + path);
	for (const [k, v] of params) url.searchParams.append(k, String(v));
	const headers = {};
	if (auth === 'server') headers['X-Api-Key'] = apiKey;
	if (auth === 'mapsHeader') headers['X-Api-Key'] = mapsKey;
	if (auth === 'mapsQuery') url.searchParams.set('key', mapsKey);
	calls++;
	let status = 0;
	let fixture;
	try {
		const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
		status = res.status;
		remaining = res.headers.get('x-ratelimit-remaining') ?? remaining;
		const contentType = res.headers.get('content-type') ?? '';
		const buf = Buffer.from(await res.arrayBuffer());
		const isJson = contentType.includes('json') || (!binary && buf[0] === 0x7b);
		let body;
		if (isJson) {
			try {
				body = JSON.parse(buf.toString('utf8'));
			} catch {
				body = buf.toString('utf8').slice(0, 500);
			}
		} else {
			body = { binary: true, bytes: buf.length, magic: buf.subarray(0, 8).toString('hex') };
		}
		fixture = sanitize({
			request: { host, path, params: Object.fromEntries(params), auth },
			status,
			contentType,
			rateLimit: {
				limit: res.headers.get('x-ratelimit-limit'),
				remaining: res.headers.get('x-ratelimit-remaining'),
			},
			body,
		});
	} catch (error) {
		fixture = sanitize({ request: { host, path }, error: String(error?.message ?? error) });
	}
	writeFileSync(join(outDir, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n');
	const ok = status >= 200 && status < 300;
	results.push({ name, status: ok ? 'PASS' : 'FAIL', detail: String(status || fixture.error) });
	return { ok, status, fixture };
}

function skip(name, reason) {
	results.push({ name, status: 'SKIP', detail: reason });
}

mkdirSync(outDir, { recursive: true });
const LAT = 32.0779;
const LON = 34.774;

await call('geocode-forward', 'api', '/api', [
	['q', 'Dizengoff Square, Tel Aviv'],
	['limit', 1],
]);
await call('geocode-reverse', 'api', '/reverse', [
	['lat', LAT],
	['lon', LON],
]);
await call('place-search', 'api', '/v1/places/search', [
	['q', 'cafe'],
	['lat', LAT],
	['lon', LON],
	['limit', 3],
]);
await call('place-nearby', 'api', '/v1/places/nearby', [
	['lat', LAT],
	['lon', LON],
	['radius', 500],
	['category', 'cafe'],
	['limit', 3],
]);
const suggest = [
	['q', 'Dizengoff'],
	['lat', LAT],
	['lon', LON],
	['limit', 3],
];
const viaServer = await call('place-autosuggest', 'suggest', '/autosuggest', suggest);
if (!viaServer.ok && mapsKey) {
	await call('place-autosuggest-mapskey', 'suggest', '/autosuggest', suggest, {
		auth: 'mapsHeader',
	});
}
await call('place-categories', 'api', '/v1/places/categories', []);
await call(
	'static-map',
	'api',
	'/v1/static',
	[
		['center', `${LON},${LAT}`],
		['zoom', 15],
		['width', 400],
		['height', 300],
		['style', 'light'],
		['markers', `${LON},${LAT},#e11d48,A|34.7755,32.0790,#2563eb,B`],
		['path', `3:2563eb:0.8|${LON},${LAT}|34.7755,32.0790`],
	],
	{ binary: true },
);
if (mapsKey) {
	await call('tiles-metadata', 'tiles', '/v1/metadata', [], { auth: 'mapsQuery' });
	await call('tiles-tile', 'tiles', '/v1/tiles/14/9774/6649.pbf', [], {
		auth: 'mapsQuery',
		binary: true,
	});
	if (datasetId) {
		const id = encodeURIComponent(datasetId);
		await call('dataset-metadata', 'tiles', `/v1/datasets/${id}/metadata`, [], {
			auth: 'mapsQuery',
		});
	} else {
		skip('dataset-metadata', 'LATLNG_DATASET_ID not set');
	}
} else {
	skip('tiles-metadata', 'LATLNG_MAPS_KEY not set');
	skip('tiles-tile', 'LATLNG_MAPS_KEY not set');
	skip('dataset-metadata', 'LATLNG_MAPS_KEY not set');
}

for (const r of results) console.log(`${r.status.padEnd(4)} ${r.name.padEnd(28)} ${r.detail}`);
console.log(`calls: ${calls}  X-RateLimit-Remaining: ${remaining}`);
const failed = results.filter(
	(r) =>
		r.status === 'FAIL' &&
		!(
			r.name === 'place-autosuggest' &&
			results.some((x) => x.name === 'place-autosuggest-mapskey' && x.status === 'PASS')
		),
);
process.exit(failed.length ? 1 : 0);
