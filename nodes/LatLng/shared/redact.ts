const KEY_PARAM = /([?&](?:key|api_key)=)[^&#\s"']*/gi;

/** Replaces the value of any `key` / `api_key` query parameter in a string with REDACTED. */
export function redactUrls(text: string): string {
	return text.replace(KEY_PARAM, '$1REDACTED');
}

/** Deep-copies a value, redacting `key=` values in every string (TileJSON echoes the key). */
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
