import { vi } from 'vitest';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

export const NODE: INode = {
	id: '1',
	name: 'LatLng',
	type: 'CUSTOM.latLng',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export type FakeResponse = { statusCode: number; headers?: IDataObject; body: unknown } | Error;

export interface FakeOptions {
	params?: Record<string, unknown> | Array<Record<string, unknown>>;
	items?: number;
	continueOnFail?: boolean;
	credentials?: IDataObject;
}

/** IExecuteFunctions stand-in. HTTP responses are served from a queue; calls are recorded. */
export function fakeCtx(responses: FakeResponse[] = [], opts: FakeOptions = {}) {
	const queue = [...responses];
	const calls: Array<{ credentialType?: string; options: IHttpRequestOptions }> = [];
	const serve = async (options: IHttpRequestOptions, credentialType?: string) => {
		calls.push({ credentialType, options });
		const next = queue.shift();
		if (!next) throw new Error('no more fake responses');
		if (next instanceof Error) throw next;
		return { headers: {}, ...next };
	};
	const itemCount = opts.items ?? (Array.isArray(opts.params) ? opts.params.length : 1);
	const paramsFor = (i: number) =>
		(Array.isArray(opts.params) ? opts.params[i] : opts.params) ?? {};
	const ctx = {
		getNode: () => NODE,
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		continueOnFail: () => opts.continueOnFail ?? false,
		getCredentials: async () => opts.credentials ?? { apiKey: 'latlng_test', mapsKey: '' },
		getNodeParameter(name: string, i: number, fallback?: unknown) {
			const [head, ...rest] = name.split('.');
			let value: unknown = paramsFor(i)[head];
			for (const key of rest) value = (value as Record<string, unknown> | undefined)?.[key];
			return value === undefined ? fallback : value;
		},
		helpers: {
			httpRequestWithAuthentication: vi.fn(async (type: string, options: IHttpRequestOptions) =>
				serve(options, type),
			),
			httpRequest: vi.fn(async (options: IHttpRequestOptions) => serve(options)),
			prepareBinaryData: vi.fn(async (data: Buffer, fileName?: string, mimeType?: string) => ({
				data: data.toString('base64'),
				fileName,
				mimeType,
			})),
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, calls };
}
