import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/my/'],
      },
    ],
    sitemap: 'https://age-doesnt-matter.com/sitemap.xml',
  }
}
