import { createHash } from 'node:crypto'

type HeaderLike = { get(name: string): string | null }

export function extractIp(source: HeaderLike | { headers: HeaderLike }): string {
  const h: HeaderLike = 'headers' in source ? source.headers : source

  const cf = h.get('cf-connecting-ip')
  if (cf) return cf

  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()

  return h.get('x-real-ip') ?? '127.0.0.1'
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}
