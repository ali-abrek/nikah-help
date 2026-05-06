import type { NextRequest } from 'next/server'
import type { KeyStrategy } from './types'
import { extractIp, hashIp } from '@/lib/utils/ip'

export async function resolveKeys(
  request: NextRequest,
  strategy: KeyStrategy,
): Promise<string[]> {
  const path = normalizePath(request.nextUrl.pathname)
  const keys: string[] = []

  if (strategy === 'ip' || strategy === 'ip+user') {
    keys.push(`nikah-help:${path}:ip:${hashIp(extractIp(request))}`)
  }

  if (strategy === 'user' || strategy === 'ip+user') {
    const userId = request.headers.get('x-user-id')
    if (userId) {
      keys.push(`nikah-help:${path}:user:${userId}`)
    }
  }

  if (keys.length === 0) {
    keys.push(`nikah-help:${path}:ip:${hashIp(extractIp(request))}`)
  }

  return keys
}

function normalizePath(pathname: string): string {
  return pathname
    .replace(/^\/api\//, '')
    .replace(/\/[0-9a-f-]{36}/g, ':id')
    .replace(/\//g, '.')
}
