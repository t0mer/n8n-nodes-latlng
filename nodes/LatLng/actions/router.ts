import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { Handler } from './common';
import * as geocoding from './geocoding';
import * as place from './place';
import * as staticMap from './staticMap';

const HANDLERS: Record<string, Record<string, Handler>> = {
	geocoding: { forward: geocoding.forward, reverse: geocoding.reverse },
	place: {
		autosuggest: place.autosuggest,
		getCategories: place.getCategories,
		nearby: place.nearby,
		search: place.search,
	},
	staticMap: { getImage: staticMap.getImage },
};

function toNodeError(ctx: IExecuteFunctions, error: unknown, itemIndex: number) {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(ctx.getNode(), error as Error, { itemIndex });
}

export async function route(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		let failure: unknown;
		try {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			const handler = HANDLERS[resource]?.[operation];
			if (!handler) {
				throw new NodeOperationError(
					this.getNode(),
					`Unsupported operation "${operation}" for resource "${resource}"`,
					{ itemIndex: i },
				);
			}
			for (const item of await handler(this, i)) {
				returnData.push({ ...item, pairedItem: { item: i } });
			}
		} catch (error) {
			failure = error;
		}
		if (failure === undefined) continue;

		const nodeError = toNodeError(this, failure, i);
		if (!this.continueOnFail()) throw nodeError;
		const statusCode = nodeError instanceof NodeApiError ? Number(nodeError.httpCode) : undefined;
		returnData.push({
			json: { error: nodeError.message, ...(statusCode ? { statusCode } : {}) },
			pairedItem: { item: i },
		});
	}

	return [returnData];
}
