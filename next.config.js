/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: (() => {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
      const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)
      return `${date}-${sha}`
    })(),
  },
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'ads-partners.coupang.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'bcrypt', 'sharp'],
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.kakaocdn.net https://developers.kakao.com https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://www.google.com https://ads-partners.coupang.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev https://k.kakaocdn.net https://t1.kakaocdn.net https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com https://ads-partners.coupang.com https://*.coupangcdn.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.adtrafficquality.google",
              "font-src 'self'",
              "connect-src 'self' https://kauth.kakao.com https://kapi.kakao.com https://api.telegram.org https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://pagead2.googlesyndication.com https://ads-partners.coupang.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google https://*.r2.cloudflarestorage.com https://*.r2.dev",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google https://coupa.ng",
              "media-src 'self' https://*.r2.cloudflarestorage.com https://*.r2.dev",
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
