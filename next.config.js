/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'bcrypt'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.kakaocdn.net https://developers.kakao.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://pub-*.r2.dev https://k.kakaocdn.net https://t1.kakaocdn.net",
              "font-src 'self'",
              "connect-src 'self' https://kauth.kakao.com https://kapi.kakao.com https://api.telegram.org",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://kauth.kakao.com",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
