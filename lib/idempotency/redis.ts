import { getRedis } from '@/lib/redis'
import type { StoredResponse } from './types'
import { filterHeaders } from './headers'
import type { NextResponse } from 'next/server'

// Uses Redis server-side Lua scripting (EVAL command) for atomicity.
// The Lua scripts execute on the Redis server, NOT in the Node.js process.
export async function acquireLock(key: string, ttl: number): Promise<boolean> {
  const script = [
    "if redis.call('SETNX', KEYS[1], ARGV[1]) == 1 then",
    "  redis.call('EXPIRE', KEYS[1], ARGV[2])",
    '  return 1',
    'end',
    'return 0',
  ].join('\n')
  const result = await getRedis().eval(script, [key], ['pending', String(ttl)])
  return result === 1
}

export async function storeResult(key: string, response: NextResponse, ttl: number): Promise<void> {
  const body = await response.clone().text()

  const stored: StoredResponse = {
    status: response.status,
    body,
    headers: filterHeaders(response.headers),
  }

  await getRedis().set(key, JSON.stringify(stored), { ex: ttl })
}

export async function waitForResult(
  key: string,
  timeoutMs: number,
): Promise<StoredResponse | null> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const raw = await getRedis().get<string>(key)

    if (raw && raw !== 'pending') {
      try {
        return JSON.parse(raw) as StoredResponse
      } catch {
        return null
      }
    }

    if (raw === null) {
      return null
    }

    await new Promise((r) => setTimeout(r, 50))
  }

  return null
}

export async function releaseLock(key: string): Promise<void> {
  const script = [
    "if redis.call('GET', KEYS[1]) == ARGV[1] then",
    "  return redis.call('DEL', KEYS[1])",
    'end',
    'return 0',
  ].join('\n')
  await getRedis().eval(script, [key], ['pending'])
}
