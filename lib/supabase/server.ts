import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import type { Database } from '@/types/database.types'
import { requireEnv } from '@/lib/env'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )
}

type PendingCookie = { name: string; value: string; options: Record<string, unknown> }

export async function createRouteSupabase() {
  const cookieStore = await cookies()
  const pendingCookies: PendingCookie[] = []

  const supabase = createServerClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet)
        },
      },
    },
  )

  const applyCookies = (response: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    )
  }

  return { supabase, applyCookies }
}
