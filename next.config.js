/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: (() => {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
      const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)
      return `${date}-${sha}`
    })(),
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,  // 24시간 — R2 이미지는 URL별 고유 (교체 시 URL 변경)
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
        hostname: '*.r2.cloudflare.com',
      },
      {
        protocol: 'https',
        hostname: 'ads-partners.coupang.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'plus.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'img.age-doesnt-matter.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'bcrypt', 'sharp'],
    // dynamic 페이지 클라이언트 라우터 캐시 30초 — 재방문 시 서버 왕복 제거
    // static 페이지 300초 — /contact, /faq 등 불변 콘텐츠
    // Server Action revalidatePath/revalidateTag 호출 시 즉시 무효화됨
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  async redirects() {
    return [
      // www → non-www 권위 통합 (SEO: GSC 도메인 분열 방지)
      { source: '/:path*', has: [{ type: 'host', value: 'www.age-doesnt-matter.com' }], destination: 'https://age-doesnt-matter.com/:path*', permanent: true },
      // 아임웹 레거시 경로 → 현재 경로 301 영구 리다이렉트
      { source: '/Humor',          destination: '/community/humor',  permanent: true },
      { source: '/Humor/:path*',   destination: '/community/humor',  permanent: true },
      { source: '/Free-Board',     destination: '/community/stories', permanent: true },
      { source: '/Free-Board/:path*', destination: '/community/stories', permanent: true },
      { source: '/job',            destination: '/jobs',             permanent: true },
      { source: '/job/:path*',     destination: '/jobs',             permanent: true },
      { source: '/blog',           destination: '/magazine',         permanent: true },
      { source: '/blog/:path*',    destination: '/magazine',         permanent: true },
      { source: '/write_1st',      destination: '/community/write',  permanent: true },
      { source: '/write',          destination: '/community/write',  permanent: true },
      { source: '/faq',            destination: '/about',            permanent: true },
    ]
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.kakaocdn.net https://developers.kakao.com https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://www.google.com https://ads-partners.coupang.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev https://*.r2.cloudflare.com https://img.age-doesnt-matter.com https://images.unsplash.com https://plus.unsplash.com https://k.kakaocdn.net https://t1.kakaocdn.net https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com https://ads-partners.coupang.com https://*.coupangcdn.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.adtrafficquality.google https://www.google.co.kr https://www.google.com",
              "font-src 'self'",
              "connect-src 'self' https://kauth.kakao.com https://kapi.kakao.com https://api.telegram.org https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://pagead2.googlesyndication.com https://ads-partners.coupang.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google https://*.r2.cloudflarestorage.com https://*.r2.dev https://fundingchoicesmessages.google.com https://stats.g.doubleclick.net https://challenges.cloudflare.com https://www.google.com",
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://*.adtrafficquality.google https://coupa.ng https://ads-partners.coupang.com https://partners.coupangcdn.com https://challenges.cloudflare.com",
              "media-src 'self' https://*.r2.cloudflarestorage.com https://*.r2.dev",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://kauth.kakao.com",
            ].join('; '),
          },
        ],
      },
      // 정적 자산: 콘텐츠 해시 포함 → 1년 immutable 캐시
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // 공개 아이콘/스크린샷: 30일 캐시
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/screenshots/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      // assetlinks.json: Google TWA 검증이 항상 최신 파일을 읽도록 캐시 금지
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

module.exports = nextConfig
