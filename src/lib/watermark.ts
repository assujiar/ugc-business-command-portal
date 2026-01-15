// =====================================================
// Image Watermark Utility
// Adds watermark with pipeline update information to evidence photos
// Uses watermark-jimp (pure JS) for Vercel serverless compatibility
// =====================================================

import { formatDateTimeFull } from '@/lib/utils'

export interface WatermarkData {
  updateTime: Date
  companyName: string
  pipelineStage: string
  salesName: string
  location: {
    lat: number | null
    lng: number | null
    address: string | null
  }
}

// Dynamic import for watermark-jimp
let watermarkModule: typeof import('watermark-jimp') | null = null

async function getWatermarkModule(): Promise<typeof import('watermark-jimp') | null> {
  if (watermarkModule) return watermarkModule

  try {
    watermarkModule = await import('watermark-jimp')
    console.log('[Watermark] watermark-jimp module loaded successfully')
    return watermarkModule
  } catch (error) {
    console.error('[Watermark] Failed to load watermark-jimp:', error)
    return null
  }
}

/**
 * Add watermark to an image with pipeline update information
 * Watermark includes: date/time, company name, stage, sales name, geolocation
 * Returns Uint8Array for compatibility with Supabase storage
 */
export async function addWatermark(
  imageBuffer: Buffer | Uint8Array,
  watermarkData: WatermarkData
): Promise<Uint8Array> {
  const wm = await getWatermarkModule()

  if (!wm) {
    console.warn('[Watermark] Module not available, returning original image')
    return imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer)
  }

  try {
    // Convert to Buffer if needed
    const inputBuffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)

    // Format watermark text
    const dateTime = formatDateTimeFull(watermarkData.updateTime)
    const coordText = watermarkData.location.lat && watermarkData.location.lng
      ? `${watermarkData.location.lat.toFixed(6)}, ${watermarkData.location.lng.toFixed(6)}`
      : '-'

    // Truncate address if too long
    let address = watermarkData.location.address || '-'
    if (address.length > 35) {
      address = address.substring(0, 35) + '...'
    }

    // Create multi-line watermark text
    const watermarkText = [
      `${dateTime}`,
      `${watermarkData.companyName}`,
      `Stage: ${watermarkData.pipelineStage}`,
      `Sales: ${watermarkData.salesName}`,
      `Loc: ${coordText}`,
      `${address}`,
    ].join(' | ')

    // Apply text watermark using watermark-jimp
    const watermarkedBuffer = await wm.addTextWatermark(inputBuffer, {
      text: watermarkText,
      textSize: 2, // 1-8, smaller = smaller text
      opacity: 0.8,
      color: '#FFFFFF',
      position: 'bottom-center',
    })

    console.log('[Watermark] Successfully added text watermark to image')
    return new Uint8Array(watermarkedBuffer)
  } catch (error) {
    console.error('[Watermark] Error adding watermark:', error)
    // Return original image if watermarking fails
    return imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer)
  }
}

/**
 * Check if a file is an image based on MIME type
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Generate watermark text for display purposes
 * Can be used in frontend to overlay text on image viewer
 */
export function generateWatermarkText(data: WatermarkData): string[] {
  const dateTime = formatDateTimeFull(data.updateTime)
  const coordText = data.location.lat && data.location.lng
    ? `${data.location.lat.toFixed(6)}, ${data.location.lng.toFixed(6)}`
    : '-'

  let address = data.location.address || '-'
  if (address.length > 50) {
    address = address.substring(0, 50) + '...'
  }

  return [
    `Tanggal: ${dateTime}`,
    `Perusahaan: ${data.companyName}`,
    `Stage: ${data.pipelineStage}`,
    `Sales: ${data.salesName}`,
    `Koordinat: ${coordText}`,
    `Lokasi: ${address}`,
  ]
}
