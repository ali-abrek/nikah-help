import { notFound, redirect, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase/server'
import { getProfile } from '@/features/profile/server/get-profile'
import { ProfileDetail } from '@/features/profile/components/ProfileDetail'
import { OwnProfile } from '@/features/profile/components/OwnProfile'
import { getUserId } from '@/lib/auth/claims'
import {
  generateSeoSlug,
  buildProfileTitle,
  buildProfileMetaDescription,
  buildProfileJsonLd,
} from '@/lib/seo'
import { getSiteUrl } from '@/lib/utils/site-url'

interface Props {
  params: Promise<{ id: string }>
}

function extractUuid(param: string): string {
  // UUID v4 is 36 characters: 8-4-4-4-12
  const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
  const match = param.match(uuidPattern)
  return match?.[1] ?? param
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data: claimsData } = await supabase.auth.getClaims()
  const viewerId = claimsData?.claims
    ? getUserId(claimsData.claims as Record<string, unknown>)
    : null
  if (!viewerId) return {}

  const profile = await getProfile(supabase, uuid, viewerId as string)
  if (!profile) return {}

  // Don't index banned, deleted, or unpublished profiles
  if (!profile.is_published || profile.deletion_status) {
    return { robots: { index: false, follow: false } }
  }

  const siteUrl = getSiteUrl()
  const slug = generateSeoSlug(profile)
  const canonicalUrl = `${siteUrl}/profile/${uuid}-${slug}`
  const lang = 'ru' // TODO: derive from profile.locale when multilingual support is enabled

  const title = buildProfileTitle(profile, lang)
  const description = buildProfileMetaDescription(
    profile as unknown as Record<string, unknown>,
    lang,
  )

  // OG image: public SEO endpoint so social crawlers can fetch it
  const firstPhoto = profile.photos[0]
  const ogImage = firstPhoto
    ? `${siteUrl}/api/photos/seo/${firstPhoto.id}-${slug}-avatar.webp`
    : undefined

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ru: canonicalUrl,
        en: `${siteUrl}/en/profile/${uuid}-${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Nikah Help',
      locale: 'ru_RU',
      type: 'profile',
      images: ogImage ? [{ url: ogImage, width: 100, height: 100, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    other: {
      'script:ld+json': buildProfileJsonLd(profile, siteUrl),
    },
  }
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id } = await params
  const uuid = extractUuid(id)
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const viewerId = data?.claims ? getUserId(data.claims as Record<string, unknown>) : null
  if (!viewerId) redirect('/auth')

  const profile = await getProfile(supabase, uuid, viewerId)
  if (!profile) notFound()

  // 308 permanent redirect if the URL slug is outdated
  const currentSlug = generateSeoSlug(profile)
  const expectedParam = `${uuid}-${currentSlug}`
  if (id !== expectedParam) {
    permanentRedirect(`/profile/${expectedParam}`)
  }

  if (viewerId === uuid) return <OwnProfile profile={profile} />
  return <ProfileDetail profile={profile} isOwnProfile={false} />
}
