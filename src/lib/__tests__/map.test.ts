/**
 * Unit tests for the map utility module
 */

import {
  getStaticMapUrl,
  getGoogleMapsUrl,
  isValidCoordinate,
  isMapEnabled,
} from '../map'

// Mock process.env
const originalEnv = process.env

describe('map utility', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('isValidCoordinate', () => {
    it('should return true for valid coordinates', () => {
      expect(isValidCoordinate(-6.2088, 106.8456)).toBe(true)
      expect(isValidCoordinate(0, 0)).toBe(true)
      expect(isValidCoordinate(90, 180)).toBe(true)
      expect(isValidCoordinate(-90, -180)).toBe(true)
    })

    it('should return false for invalid latitude', () => {
      expect(isValidCoordinate(91, 0)).toBe(false)
      expect(isValidCoordinate(-91, 0)).toBe(false)
    })

    it('should return false for invalid longitude', () => {
      expect(isValidCoordinate(0, 181)).toBe(false)
      expect(isValidCoordinate(0, -181)).toBe(false)
    })

    it('should return false for NaN values', () => {
      expect(isValidCoordinate(NaN, 0)).toBe(false)
      expect(isValidCoordinate(0, NaN)).toBe(false)
    })

    it('should return false for non-number values', () => {
      expect(isValidCoordinate('0' as unknown as number, 0)).toBe(false)
      expect(isValidCoordinate(0, '0' as unknown as number)).toBe(false)
    })
  })

  describe('getGoogleMapsUrl', () => {
    it('should generate correct Google Maps URL', () => {
      const url = getGoogleMapsUrl(-6.2088, 106.8456)
      expect(url).toBe('https://www.google.com/maps?q=-6.2088,106.8456')
    })

    it('should handle zero coordinates', () => {
      const url = getGoogleMapsUrl(0, 0)
      expect(url).toBe('https://www.google.com/maps?q=0,0')
    })

    it('should handle negative coordinates', () => {
      const url = getGoogleMapsUrl(-33.8688, 151.2093)
      expect(url).toBe('https://www.google.com/maps?q=-33.8688,151.2093')
    })
  })

  describe('getStaticMapUrl', () => {
    it('should return empty string when no Mapbox token is configured', () => {
      delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(-6.2088, 106.8456)
      expect(url).toBe('')
    })

    it('should return empty string for invalid coordinates', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test_token'
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(91, 0)
      expect(url).toBe('')
    })

    it('should generate Mapbox URL when token is configured', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test_token'
      process.env.NEXT_PUBLIC_MAP_PROVIDER = 'mapbox'
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(-6.2088, 106.8456)

      expect(url).toContain('api.mapbox.com')
      expect(url).toContain('106.8456')
      expect(url).toContain('-6.2088')
      expect(url).toContain('access_token=pk.test_token')
    })

    it('should use default dimensions', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test_token'
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(-6.2088, 106.8456)

      expect(url).toContain('400x200')
    })

    it('should use custom dimensions when provided', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test_token'
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(-6.2088, 106.8456, { width: 600, height: 300 })

      expect(url).toContain('600x300')
    })

    it('should use custom zoom level when provided', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test_token'
      const { getStaticMapUrl: getUrl } = jest.requireActual('../map')
      const url = getUrl(-6.2088, 106.8456, { zoom: 14 })

      expect(url).toContain(',14/')
    })
  })

  describe('isMapEnabled', () => {
    it('should return false when no Mapbox token is configured', () => {
      delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const { isMapEnabled: checkEnabled } = jest.requireActual('../map')
      expect(checkEnabled()).toBe(false)
    })

    it('should return true when Mapbox token is configured', () => {
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test_token'
      const { isMapEnabled: checkEnabled } = jest.requireActual('../map')
      expect(checkEnabled()).toBe(true)
    })
  })
})
