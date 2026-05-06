import { createServerSupabase } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '@/lib/utils/site-url'

export async function POST() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')

  return NextResponse.redirect(new URL('/auth', getSiteUrl()))
}
