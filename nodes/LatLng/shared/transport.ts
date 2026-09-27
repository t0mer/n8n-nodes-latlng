import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
} from 'n8n-workflow';
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

/** Sends one GET to LatLng and maps any non-2xx status to a NodeApiError. */
export async function latlngRequest<T = unknown>(
	ctx: IExecuteFunctions,
	req: LatLngRequest,
	itemIndex: number,
): Promise<LatLngResponse<T>> {
	const response = await send(ctx, req, itemIndex);
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
