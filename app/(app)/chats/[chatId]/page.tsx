import { createServerSupabase } from '@/lib/supabase/server'
import { getChatInfo } from '@/features/chat/server/get-chat-info'
import { getMessages } from '@/features/chat/server/get-messages'
import { ChatDetail } from '@/features/chat/components/ChatDetail'
import { getUserId } from '@/lib/auth/claims'
import { notFound } from 'next/navigation'

export default async function ChatDetailPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params

  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = getUserId(data.claims as Record<string, unknown>)
  if (!userId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const [chatInfo, messages] = await Promise.all([getChatInfo(chatId, userId), getMessages(chatId)])

  if (!chatInfo) {
    notFound()
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <ChatDetail chatInfo={chatInfo} initialMessages={messages} userId={userId} />
    </div>
  )
}
