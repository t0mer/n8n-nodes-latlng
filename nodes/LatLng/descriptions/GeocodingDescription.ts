import type { INodeProperties } from 'n8n-workflow';
import { latLonFields } from './common';

const show = (operation: string) => ({ resource: ['geocoding'], operation: [operation] });

export const geocodingOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['geocoding'] } },
		options: [
			{
				name: 'Forward',
				value: 'forward',
				description:
					'Find coordinates (latitude/longitude in degrees) and address details for an address or place name',
				action: 'Geocode an address',
			},
			{
				name: 'Reverse',
				value: 'reverse',
				description: 'Find the address (street, city, country, postcode) at a latitude/longitude',
				action: 'Reverse geocode coordinates',
			},
		],
		default: 'forward',
	},
];

export const geocodingFields: INodeProperties[] = [
	{
		displayName: 'Address or Place',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Dizengoff Square, Tel Aviv',
		description: 'Free-text address, place or landmark to look up',
		displayOptions: { show: show('forward') },
	},
	{
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1 },
		description: 'Maximum number of matches to return, best match first',
		displayOptions: { show: show('forward') },
	},
	...latLonFields(show('reverse'), 'the point to look up'),
];
