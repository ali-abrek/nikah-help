'use server'

import type { ServerActionResult } from '@/lib/errors/action'

export async function sendMagicLink(
  _prev: ServerActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ServerActionResult<{ message: string }>> {
  console.error('[debug] sendMagicLink isolated v3 entered')
  console.error(JSON.stringify({
    has_email: typeof formData.get('email') === 'string',
    upstash_url_set: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    upstash_token_set: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    supabase_url_set: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
  }))
  return {
    success: true,
    data: { message: 'DEBUG v3: action executed, no imports tested' },
  }
}
