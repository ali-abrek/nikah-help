import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSeoSlug } from '@/lib/seo'
import { getSiteUrl } from '@/lib/utils/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/feed`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/faq`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/guide`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/agreements`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const supabase = createAdminClient()

  const [profilesRes, suspensionsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, gender, city, country, updated_at')
      .eq('is_published', true)
      .is('deletion_status', null),
    supabase
      .from('user_suspensions')
      .select('user_id, expires_at')
      .is('lifted_at', null)
      .neq('kind', 'warning'),
  ])

  const now = new Date()
  const suspendedIds = new Set(
    (suspensionsRes.data ?? [])
      .filter((s: { user_id: string; expires_at: string | null }) => {
        if (!s.expires_at) return true // permanent suspension
        return new Date(s.expires_at) > now
      })
      .map((s) => s.user_id),
  )

  const profiles = (profilesRes.data ?? []).filter((p) => !suspendedIds.has(p.id))

  // Canonical URL format: /profile/{uuid}-{slug}
  // The page handler issues a 308 permanent redirect from /profile/{uuid} to this form.
  // Sitemap must only list canonical URLs — never bare UUIDs — to avoid duplicate indexing.
  const profilePages: MetadataRoute.Sitemap = profiles.map((p) => ({
    url: `${siteUrl}/profile/${p.id}-${generateSeoSlug({ gender: p.gender, city: p.city, country: p.country })}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...profilePages]
}
