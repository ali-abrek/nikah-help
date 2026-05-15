import { redirect } from 'next/navigation'
import { getChats } from '@/features/chat/server/get-chats'
import { ChatList } from '@/features/chat/components/ChatList'
import { createServerSupabase } from '@/lib/supabase/server'
import { getUserId } from '@/lib/auth/claims'
import { buildGenericTitle } from '@/lib/seo'

export const metadata = { title: buildGenericTitle('Чаты', 'ru') }

export default async function ChatsPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const chats = await getChats(userId)
  return <ChatList chats={chats} userId={userId} />
}
