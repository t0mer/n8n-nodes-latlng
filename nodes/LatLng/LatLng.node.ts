import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { route } from './actions/router';
import { optionsCollection, resourceProperty } from './descriptions/common';
import { geocodingFields, geocodingOperations } from './descriptions/GeocodingDescription';

export class LatLng implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LatLng',
		name: 'latLng',
		icon: { light: 'file:latlng.svg', dark: 'file:latlng.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Geocode addresses, reverse geocode coordinates, search places and render static maps with LatLng (OpenStreetMap data)',
		defaults: { name: 'LatLng' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'latLngApi', required: true }],
		properties: [resourceProperty, ...geocodingOperations, ...geocodingFields, optionsCollection],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return route.call(this);
	}
}
