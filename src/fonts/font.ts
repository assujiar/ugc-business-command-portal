import localFont from 'next/font/local'

// Lufga Font Family - All weights
export const lufga = localFont({
  src: [
    // Thin (100)
    {
      path: './LufgaThin.ttf',
      weight: '100',
      style: 'normal',
    },
    {
      path: './LufgaThinItalic.ttf',
      weight: '100',
      style: 'italic',
    },
    // Extra Light (200)
    {
      path: './LufgaExtraLight.ttf',
      weight: '200',
      style: 'normal',
    },
    {
      path: './LufgaExtraLightItalic.ttf',
      weight: '200',
      style: 'italic',
    },
    // Light (300)
    {
      path: './LufgaLight.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './LufgaLightItalic.ttf',
      weight: '300',
      style: 'italic',
    },
    // Regular (400)
    {
      path: './LufgaRegular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './LufgaItalic.ttf',
      weight: '400',
      style: 'italic',
    },
    // Medium (500)
    {
      path: './LufgaMedium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './LufgaMediumItalic.ttf',
      weight: '500',
      style: 'italic',
    },
    // Semi Bold (600)
    {
      path: './LufgaSemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './LufgaSemiBoldItalic.ttf',
      weight: '600',
      style: 'italic',
    },
    // Bold (700)
    {
      path: './LufgaBold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './LufgaBoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
    // Extra Bold (800)
    {
      path: './LufgaExtraBold.ttf',
      weight: '800',
      style: 'normal',
    },
    {
      path: './LufgaExtraBoldItalic.ttf',
      weight: '800',
      style: 'italic',
    },
    // Black (900)
    {
      path: './LufgaBlack.ttf',
      weight: '900',
      style: 'normal',
    },
    {
      path: './LufgaBlackItalic.ttf',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-lufga',
  display: 'swap',
})
