import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/chat',
          '/settings',
          '/onboarding',
          '/auth',
          '/api/',
          '/moderation',
          '/private',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
