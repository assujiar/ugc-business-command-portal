// =====================================================
// Image Watermark Utility
// Adds watermark with pipeline update information to evidence photos
// Uses Jimp (pure JS) for Vercel serverless compatibility
// =====================================================

import { formatDateTimeFull } from '@/lib/utils'
import Jimp from 'jimp'

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

/**
 * Add watermark to an image with pipeline update information
 * Watermark includes: date/time, company name, stage, sales name, geolocation
 * Returns Uint8Array for compatibility with Supabase storage
 */
export async function addWatermark(
  imageBuffer: Buffer | Uint8Array,
  watermarkData: WatermarkData
): Promise<Uint8Array> {
  try {
    // Convert to Buffer if needed
    const inputBuffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)

    // Load image with Jimp
    const image = await Jimp.read(inputBuffer)

    // Format watermark text lines
    const dateTime = formatDateTimeFull(watermarkData.updateTime)
    const coordText = watermarkData.location.lat && watermarkData.location.lng
      ? `GPS: ${watermarkData.location.lat.toFixed(6)}, ${watermarkData.location.lng.toFixed(6)}`
      : ''

    // Truncate address if too long
    let address = watermarkData.location.address || ''
    if (address.length > 60) {
      address = address.substring(0, 60) + '...'
    }

    // Create watermark lines
    const lines = [
      dateTime,
      watermarkData.companyName,
      `Stage: ${watermarkData.pipelineStage} | Sales: ${watermarkData.salesName}`,
      coordText,
      address,
    ].filter(line => line.length > 0)

    // Load font (Jimp's built-in font)
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE)

    // Calculate dimensions
    const imageWidth = image.getWidth()
    const imageHeight = image.getHeight()
    const lineHeight = 20
    const padding = 10
    const totalTextHeight = lines.length * lineHeight + padding * 2

    // Create semi-transparent overlay at bottom
    const overlayHeight = totalTextHeight
    const overlayY = imageHeight - overlayHeight

    // Add dark overlay for better text visibility
    for (let y = overlayY; y < imageHeight; y++) {
      for (let x = 0; x < imageWidth; x++) {
        const pixelColor = image.getPixelColor(x, y)
        const rgba = Jimp.intToRGBA(pixelColor)
        // Darken the pixel (multiply by 0.4 for dark overlay)
        const newColor = Jimp.rgbaToInt(
          Math.floor(rgba.r * 0.4),
          Math.floor(rgba.g * 0.4),
          Math.floor(rgba.b * 0.4),
          rgba.a
        )
        image.setPixelColor(newColor, x, y)
      }
    }

    // Print each line of text
    let currentY = overlayY + padding
    for (const line of lines) {
      image.print(font, padding, currentY, line)
      currentY += lineHeight
    }

    // Convert to buffer and return
    const outputBuffer = await image.getBufferAsync(Jimp.MIME_JPEG)
    console.log('[Watermark] Successfully added watermark to image')
    return new Uint8Array(outputBuffer)
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
