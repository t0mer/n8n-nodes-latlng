const KEY_PARAM = /([?&](?:key|api_key)=)[^&#\s"']*/gi;
const ENCODED_KEY_PARAM = /((?:%3F|%26)(?:key|api_key)%3D)(?:(?!%26|%23)[^&#\s"'])*/gi;
/** Bare LatLng keys: server keys `latlng_…` and maps keys `pk_latlng_…`. */
const BARE_KEY = /\b(?:pk_)?latlng_[A-Za-z0-9_-]+/g;

/** Replaces `key` / `api_key` query values and any bare LatLng key in a string with REDACTED. */
export function redactUrls(text: string): string {
	return text
		.replace(KEY_PARAM, '$1REDACTED')
		.replace(ENCODED_KEY_PARAM, '$1REDACTED')
		.replace(BARE_KEY, 'REDACTED');
}

/** Deep-copies a value, redacting keys in every string (TileJSON echoes the key). */
export function redactDeep<T>(value: T): T {
	if (typeof value === 'string') return redactUrls(value) as T;
	if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
	if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
		return out as T;
	}
	return value;
}
