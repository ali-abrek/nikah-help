import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getChatInfo } from '@/features/chat/server/get-chat-info'
import { getMessages } from '@/features/chat/server/get-messages'
import { ChatDetail } from '@/features/chat/components/ChatDetail'
import { getUserId } from '@/lib/auth/claims'

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  const userId = getUserId((data?.claims ?? {}) as Record<string, unknown>)
  if (!userId) redirect('/auth')

  const [chatInfo, messages] = await Promise.all([
    getChatInfo(chatId, userId),
    getMessages(chatId),
  ])
  if (!chatInfo) notFound()

  return <ChatDetail chatInfo={chatInfo} initialMessages={messages} userId={userId} />
}
