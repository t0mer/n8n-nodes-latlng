import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { redactUrls } from './redact';

const STATUS_MESSAGES: Record<number, string> = {
	401: 'Invalid API key',
	403: 'Key not allowed for this endpoint (server vs maps key, or domain restriction)',
	414: 'Request URL too long: use fewer markers or paths, or a simpler GeoJSON overlay',
	429: 'LatLng quota exceeded; resets daily on the free plan',
};

/** Pulls a human-readable message out of an error body (JSON object, JSON text or raw bytes). */
export function apiMessage(body: unknown): string | undefined {
	let value = body;
	if (value instanceof ArrayBuffer) value = Buffer.from(value);
	if (Buffer.isBuffer(value)) value = value.toString('utf8');
	if (typeof value === 'string') {
		const text = value.trim();
		if (!text) return undefined;
		try {
			value = JSON.parse(text);
		} catch {
			return redactUrls(text.slice(0, 300));
		}
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		for (const field of ['message', 'error', 'detail']) {
			if (typeof record[field] === 'string' && record[field]) {
				return redactUrls(record[field] as string);
			}
		}
	}
	return undefined;
}

/** Maps a failed LatLng response to a NodeApiError. Never includes the request URL. */
export function httpError(
	node: INode,
	statusCode: number,
	body: unknown,
	itemIndex: number,
	hint?: string,
): NodeApiError {
	const detail = apiMessage(body);
	let message = STATUS_MESSAGES[statusCode];
	if (!message && statusCode === 400) message = `Bad request: ${detail ?? 'invalid parameters'}`;
	if (!message && statusCode >= 500) message = `LatLng server error (${statusCode})`;
	if (!message) message = `LatLng request failed with status ${statusCode}`;
	const description = [statusCode === 400 ? undefined : detail, hint].filter(Boolean).join(' ');
	return new NodeApiError(node, { message, statusCode } as JsonObject, {
		message,
		description: description || undefined,
		httpCode: String(statusCode),
		itemIndex,
	});
}

/** Wraps a transport failure (timeout, DNS, TLS) without leaking the request URL or config. */
export function networkError(node: INode, error: unknown, itemIndex: number): NodeApiError {
	const raw = error instanceof Error ? error.message : String(error);
	const message = `Could not reach LatLng: ${redactUrls(raw)}`;
	return new NodeApiError(node, { message } as JsonObject, { message, itemIndex });
}
