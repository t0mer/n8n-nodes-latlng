import type { INodeProperties } from 'n8n-workflow';

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Geocoding',
			value: 'geocoding',
			description: 'Convert addresses to coordinates and back',
		},
	],
	default: 'geocoding',
};

/** Latitude/longitude pair as two separate number fields. */
export function latLonFields(
	show: NonNullable<INodeProperties['displayOptions']>['show'],
	purpose: string,
): INodeProperties[] {
	return [
		{
			displayName: 'Latitude',
			name: 'latitude',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
			description: `Latitude of ${purpose}, in decimal degrees (-90 to 90)`,
			displayOptions: { show },
		},
		{
			displayName: 'Longitude',
			name: 'longitude',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
			description: `Longitude of ${purpose}, in decimal degrees (-180 to 180)`,
			displayOptions: { show },
		},
	];
}

export const optionsCollection: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	options: [
		{
			displayName: 'Language',
			name: 'language',
			type: 'string',
			default: '',
			placeholder: 'e.g. en',
			description:
				'Preferred language for result names, as a two-letter code (e.g. en, de, fr, he)',
			displayOptions: { show: { '/resource': ['geocoding'], '/operation': ['forward'] } },
		},
		{
			displayName: 'Timeout',
			name: 'timeout',
			type: 'number',
			default: 10000,
			typeOptions: { minValue: 1 },
			description: 'Request timeout in milliseconds',
		},
	],
};
