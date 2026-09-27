import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';
import { httpError, networkError } from './errors';
import { CREDENTIAL_TYPE, DEFAULT_TIMEOUT_MS, HOSTS, type Host } from './hosts';

export interface LatLngRequest {
	host: Host;
	path: string;
	qs?: IDataObject;
	/** Return the body as a Buffer (images, vector tiles). */
	binary?: boolean;
	timeout?: number;
	/** When set, authenticate with `?key=` (tiles host) instead of the server-key header. */
	mapsKey?: string;
	/** Extra text appended to the error description on failure. */
	errorHint?: (statusCode: number) => string | undefined;
}

export interface LatLngResponse<T = unknown> {
	body: T;
	headers: IDataObject;
	statusCode: number;
}

/** Drops empty values so optional fields left blank are not sent. */
export function cleanQs(qs: IDataObject = {}): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		out[key] = value;
	}
	return out;
}

export function buildOptions(req: LatLngRequest): IHttpRequestOptions {
	const qs = cleanQs(req.qs);
	if (req.mapsKey) qs.key = req.mapsKey;
	return {
		method: 'GET',
		url: `${HOSTS[req.host]}${req.path}`,
		qs,
		arrayFormat: 'repeat',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: req.timeout ?? DEFAULT_TIMEOUT_MS,
		...(req.binary ? { encoding: 'arraybuffer' as const, json: false } : { json: true }),
	};
}

async function send(
	ctx: IExecuteFunctions,
	req: LatLngRequest,
	itemIndex: number,
): Promise<IN8nHttpFullResponse> {
	const options = buildOptions(req);
	try {
		return (
			req.mapsKey
				? await ctx.helpers.httpRequest(options)
				: await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_TYPE, options)
		) as IN8nHttpFullResponse;
	} catch (error) {
		throw networkError(ctx.getNode(), error, itemIndex);
	}
}

/** Waits before retry 1 and 2. Kept short: every retry spends quota. */
export const RETRY_DELAYS_MS = [1000, 3000];

export const isRetryable = (statusCode: number) => statusCode === 429 || statusCode >= 500;

/**
 * Sends a GET to LatLng, retrying 429 and 5xx up to twice, and maps any final non-2xx status
 * to a NodeApiError.
 */
export async function latlngRequest<T = unknown>(
	ctx: IExecuteFunctions,
	req: LatLngRequest,
	itemIndex: number,
): Promise<LatLngResponse<T>> {
	let response = await send(ctx, req, itemIndex);
	for (const delay of RETRY_DELAYS_MS) {
		if (!isRetryable(response.statusCode)) break;
		await sleep(delay);
		response = await send(ctx, req, itemIndex);
	}
	const { statusCode } = response;
	if (statusCode >= 400) {
		throw httpError(
			ctx.getNode(),
			statusCode,
			response.body,
			itemIndex,
			req.errorHint?.(statusCode),
		);
	}
	let body = response.body as unknown;
	if (req.binary && !Buffer.isBuffer(body)) body = Buffer.from(body as ArrayBuffer);
	return { body: body as T, headers: response.headers ?? {}, statusCode };
}
