// =====================================================
// Image Watermark Utility
// Adds watermark with pipeline update information to evidence photos
// Uses dynamic import for Sharp to handle serverless environments
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

// Dynamic import for Sharp with caching
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpInstance: any = null
let sharpLoadAttempted = false

async function getSharp(): Promise<any> {
  if (sharpLoadAttempted) {
    return sharpInstance
  }

  sharpLoadAttempted = true

  try {
    const sharp = await import('sharp')
    sharpInstance = sharp.default || sharp
    console.log('[Watermark] Sharp module loaded successfully')
    return sharpInstance
  } catch (error) {
    console.error('[Watermark] Failed to load Sharp module:', error)
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
  // Get Sharp module dynamically
  const sharp = await getSharp()

  if (!sharp) {
    console.warn('[Watermark] Sharp not available, returning original image')
    return imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer)
  }

  try {
    // Convert to Buffer if needed for sharp
    const inputBuffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)

    // Get image metadata to determine dimensions
    const metadata = await sharp(inputBuffer).metadata()
    const width = metadata.width || 800
    const height = metadata.height || 600

    // Calculate text size based on image dimensions (responsive)
    const baseFontSize = Math.max(Math.floor(width / 40), 14) // Min 14px
    const lineHeight = Math.floor(baseFontSize * 1.4)
    const padding = Math.floor(baseFontSize * 0.8)

    // Format watermark text lines
    const dateTime = formatDateTimeFull(watermarkData.updateTime)
    const coordText = watermarkData.location.lat && watermarkData.location.lng
      ? `${watermarkData.location.lat.toFixed(6)}, ${watermarkData.location.lng.toFixed(6)}`
      : '-'

    // Truncate address if too long
    const maxAddressLength = 50
    let address = watermarkData.location.address || '-'
    if (address.length > maxAddressLength) {
      address = address.substring(0, maxAddressLength) + '...'
    }

    // Watermark lines
    const lines = [
      `Tanggal: ${dateTime}`,
      `Perusahaan: ${watermarkData.companyName}`,
      `Stage: ${watermarkData.pipelineStage}`,
      `Sales: ${watermarkData.salesName}`,
      `Koordinat: ${coordText}`,
      `Lokasi: ${address}`,
    ]

    // Calculate overlay dimensions
    const overlayHeight = (lines.length * lineHeight) + (padding * 2)
    const overlayWidth = width

    // Create SVG text overlay with semi-transparent background
    const svgText = `
      <svg width="${overlayWidth}" height="${overlayHeight}">
        <defs>
          <style>
            .watermark-text {
              font-family: Arial, sans-serif;
              font-size: ${baseFontSize}px;
              fill: white;
              font-weight: bold;
              text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
          </style>
        </defs>
        <!-- Semi-transparent background -->
        <rect x="0" y="0" width="${overlayWidth}" height="${overlayHeight}" fill="rgba(0,0,0,0.6)" />

        <!-- Watermark text -->
        ${lines.map((line, index) => `
          <text x="${padding}" y="${padding + (index + 1) * lineHeight - 4}" class="watermark-text">
            ${escapeXml(line)}
          </text>
        `).join('')}
      </svg>
    `

    // Apply watermark to bottom of image
    const watermarkedBuffer = await sharp(inputBuffer)
      .composite([
        {
          input: Buffer.from(svgText),
          gravity: 'south', // Position at bottom
        }
      ])
      .jpeg({ quality: 90 })
      .toBuffer()

    console.log('[Watermark] Successfully added watermark to image')
    // Return as Uint8Array for storage compatibility
    return new Uint8Array(watermarkedBuffer)
  } catch (error) {
    console.error('[Watermark] Error adding watermark:', error)
    // Return original image if watermarking fails
    return imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer)
  }
}

/**
 * Escape special XML characters to prevent SVG injection
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Check if a file is an image based on MIME type
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}
