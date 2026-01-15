/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // Configure Sharp as external for serverless functions
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  // Webpack configuration for Sharp compatibility
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('sharp')
    }
    return config
  },
}

module.exports = nextConfig
