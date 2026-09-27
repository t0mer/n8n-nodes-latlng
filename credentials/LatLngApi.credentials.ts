import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LatLngApi implements ICredentialType {
	name = 'latLngApi';

	displayName = 'LatLng API';

	icon: Icon = {
		light: 'file:../nodes/LatLng/latlng.svg',
		dark: 'file:../nodes/LatLng/latlng.dark.svg',
	};

	documentationUrl = 'https://www.latlng.work/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key (Server Key)',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			hint: 'Starts with latlng_. Get it from https://dash.latlng.work.',
			description:
				'Server key used for geocoding, places and static maps. Do not use a Maps key (pk_latlng_…) here: server-only endpoints reject it with 403.',
		},
		// The Maps key is public, but it still spends the account's quota, so keep it masked.
		// eslint-disable-next-line @n8n/community-nodes/credential-unnecessary-password
		{
			displayName: 'Maps Key',
			name: 'mapsKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			hint: 'Starts with pk_latlng_. Optional, only needed for the Tiles and Dataset resources.',
			description: 'Public Maps key, sent as the key query parameter to the tiles host',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.latlng.work',
			url: '/v1/places/categories',
		},
	};
}
