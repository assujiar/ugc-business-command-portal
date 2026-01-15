// =====================================================
// Image Watermark Utility
// Metadata-based watermarking for serverless compatibility
// Stores watermark data in database instead of image modification
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

/**
 * Process image for watermarking
 * In serverless environment, returns original image
 * Watermark metadata is stored in pipeline_updates table instead
 *
 * Fields stored in database:
 * - updated_at: timestamp
 * - location_lat, location_lng, location_address: geolocation
 * - updated_by: sales user ID
 * - old_stage, new_stage: pipeline stage info
 * - notes: additional notes
 */
export async function addWatermark(
  imageBuffer: Buffer | Uint8Array,
  watermarkData: WatermarkData
): Promise<Uint8Array> {
  // Log watermark metadata for audit trail
  console.log('[Watermark] Processing image with metadata:', {
    timestamp: formatDateTimeFull(watermarkData.updateTime),
    company: watermarkData.companyName,
    stage: watermarkData.pipelineStage,
    sales: watermarkData.salesName,
    coordinates: watermarkData.location.lat && watermarkData.location.lng
      ? `${watermarkData.location.lat.toFixed(6)}, ${watermarkData.location.lng.toFixed(6)}`
      : 'N/A',
    address: watermarkData.location.address || 'N/A',
  })

  // Return original image - metadata is stored in database
  // This approach ensures 100% serverless compatibility
  return imageBuffer instanceof Uint8Array ? imageBuffer : new Uint8Array(imageBuffer)
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
