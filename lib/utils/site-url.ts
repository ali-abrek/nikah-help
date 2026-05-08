function resolveSiteUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  return 'http://localhost:3000'
}

let _siteUrl: string | null = null

export function getSiteUrl(): string {
  if (!_siteUrl) _siteUrl = resolveSiteUrl()
  return _siteUrl
}

export function validateSiteUrl(): void {
  const url = getSiteUrl()
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && url.startsWith('http://localhost')) {
    console.error(
      '[site-url] Production site URL is localhost. Set NEXT_PUBLIC_SITE_URL or deploy on Vercel (which sets VERCEL_URL). ' +
        'Magic link redirects will fail because Supabase rejects localhost as a redirect URL in production.',
    )
  }
}
