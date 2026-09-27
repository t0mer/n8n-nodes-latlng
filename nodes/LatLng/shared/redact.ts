const KEY_PARAM = /([?&](?:key|api_key)=)[^&#\s"']*/gi;

/** Replaces the value of any `key` / `api_key` query parameter in a string with REDACTED. */
export function redactUrls(text: string): string {
	return text.replace(KEY_PARAM, '$1REDACTED');
}
