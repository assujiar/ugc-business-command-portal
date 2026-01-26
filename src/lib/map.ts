/**
 * Map Utility Module
 *
 * Provides functions to generate static map URLs for location previews.
 * Supports multiple map providers with fallback options.
 */

export type MapProvider = 'mapbox' | 'osm'

/**
 * Map configuration from environment variables
 */
const getMapConfig = () => ({
  provider: (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProvider) || 'osm',
  mapboxBaseUrl: process.env.NEXT_PUBLIC_MAPBOX_STATIC_URL ||
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
  osmBaseUrl: process.env.NEXT_PUBLIC_OSM_STATIC_URL ||
    'https://tile.openstreetmap.org'
})

/**
 * Generates a Mapbox static map URL
 */
function getMapboxStaticUrl(
  lat: number,
  lng: number,
  options: { width?: number; height?: number; zoom?: number } = {}
): string {
  const config = getMapConfig()
  const { width = 400, height = 200, zoom = 16 } = options

  if (!config.mapboxToken) {
    console.warn('Mapbox token not configured, falling back to OSM')
    return getOsmStaticUrl(lat, lng, options)
  }

  // Mapbox Static Images API format:
  // /pin-s+color(lng,lat)/lng,lat,zoom/widthxheight
  return `${config.mapboxBaseUrl}/pin-s+ff0000(${lng},${lat})/${lng},${lat},${zoom}/${width}x${height}?access_token=${config.mapboxToken}`
}

/**
 * Generates an OpenStreetMap static map URL using tile.openstreetmap.org
 * Since the old staticmap.openstreetmap.de service is unreliable,
 * we use a placeholder approach that links to Google Maps instead
 */
function getOsmStaticUrl(
  lat: number,
  lng: number,
  options: { width?: number; height?: number; zoom?: number } = {}
): string {
  // Use a data URI placeholder since tile.openstreetmap.org requires a tile-based approach
  // This returns an empty string to trigger the fallback placeholder UI
  return ''
}

/**
 * Generates a static map URL for the given coordinates
 *
 * @param lat - Latitude coordinate
 * @param lng - Longitude coordinate
 * @param options - Optional configuration for map size and zoom level
 * @returns URL string for the static map image, or empty string if no provider available
 *
 * @example
 * const mapUrl = getStaticMapUrl(-6.2088, 106.8456)
 * // With Mapbox: https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+ff0000(106.8456,-6.2088)/106.8456,-6.2088,16/400x200?access_token=...
 * // Without Mapbox: '' (empty, triggering fallback UI)
 */
export function getStaticMapUrl(
  lat: number,
  lng: number,
  options: {
    width?: number
    height?: number
    zoom?: number
    provider?: MapProvider
  } = {}
): string {
  const config = getMapConfig()
  const provider = options.provider || config.provider

  // Validate coordinates
  if (!isValidCoordinate(lat, lng)) {
    console.warn('Invalid coordinates provided to getStaticMapUrl:', { lat, lng })
    return ''
  }

  switch (provider) {
    case 'mapbox':
      return getMapboxStaticUrl(lat, lng, options)
    case 'osm':
    default:
      // If Mapbox token is available, use it as fallback
      if (config.mapboxToken) {
        return getMapboxStaticUrl(lat, lng, options)
      }
      return getOsmStaticUrl(lat, lng, options)
  }
}

/**
 * Validates latitude and longitude coordinates
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Generates a Google Maps URL for the given coordinates
 * Used as a fallback link when static map preview is not available
 */
export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/**
 * Checks if the map feature is enabled (i.e., a valid provider is configured)
 */
export function isMapEnabled(): boolean {
  const config = getMapConfig()
  return Boolean(config.mapboxToken)
}
