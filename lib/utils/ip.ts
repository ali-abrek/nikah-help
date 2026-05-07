import { createHash } from 'node:crypto'

type HeaderLike = { get(name: string): string | null }

export function extractIp(source: HeaderLike | { headers: HeaderLike }): string {
  // ReadonlyHeaders (next/headers) and Headers both have .get directly. The
  // `{ headers: ... }` shape is for NextRequest. Probe `.get` first so we
  // don't accidentally pick up an internal `headers` property on wrappers
  // that also expose a public .get (e.g. ReadonlyHeaders in Next 16).
  const h: HeaderLike =
    typeof (source as HeaderLike).get === 'function'
      ? (source as HeaderLike)
      : (source as { headers: HeaderLike }).headers

  const cf = h.get('cf-connecting-ip')
  if (cf) return cf

  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()

  return h.get('x-real-ip') ?? '127.0.0.1'
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}
