// Type declarations for watermark-jimp
// https://www.npmjs.com/package/watermark-jimp

declare module 'watermark-jimp' {
  export interface TextWatermarkOptions {
    /** The text content to add as watermark */
    text: string
    /** Text size from 1-8 (1 is smallest, 8 is largest) */
    textSize?: number
    /** Opacity from 0.1 to 1 */
    opacity?: number
    /** Color in hex format (e.g., '#FFFFFF') */
    color?: string
    /** Position of the watermark */
    position?:
      | 'top-left'
      | 'top-center'
      | 'top-right'
      | 'center-left'
      | 'center'
      | 'center-right'
      | 'bottom-left'
      | 'bottom-center'
      | 'bottom-right'
  }

  export interface ImageWatermarkOptions {
    /** Opacity from 0.1 to 1 */
    opacity?: number
    /** Position of the watermark */
    position?:
      | 'top-left'
      | 'top-center'
      | 'top-right'
      | 'center-left'
      | 'center'
      | 'center-right'
      | 'bottom-left'
      | 'bottom-center'
      | 'bottom-right'
  }

  /**
   * Add text watermark to an image
   * @param input - Image buffer or file path
   * @param options - Text watermark options
   * @returns Promise<Buffer> - Watermarked image buffer
   */
  export function addTextWatermark(
    input: Buffer | string,
    options: TextWatermarkOptions
  ): Promise<Buffer>

  /**
   * Add image watermark to an image
   * @param input - Image buffer or file path
   * @param watermarkImage - Watermark image buffer or file path
   * @param options - Image watermark options
   * @returns Promise<Buffer> - Watermarked image buffer
   */
  export function addWatermark(
    input: Buffer | string,
    watermarkImage: Buffer | string,
    options?: ImageWatermarkOptions
  ): Promise<Buffer>
}
