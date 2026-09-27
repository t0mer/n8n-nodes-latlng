/** LatLng API hosts. Not user-configurable. */
export const HOSTS = {
	api: 'https://api.latlng.work',
	suggest: 'https://suggest.latlng.work',
	tiles: 'https://tiles.latlng.work',
} as const;

export type Host = keyof typeof HOSTS;

export const CREDENTIAL_TYPE = 'latLngApi';

export const DEFAULT_TIMEOUT_MS = 10000;
