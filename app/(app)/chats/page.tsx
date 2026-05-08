import { getChats } from '@/features/chat/server/get-chats'
import { ChatList } from '@/features/chat/components/ChatList'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function ChatsPage() {
  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-zinc-500">Требуется авторизация</p>
      </div>
    )
  }

  const userId = (claims as Record<string, unknown>).sub as string
  const chats = await getChats(userId)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="px-4 py-4 text-xl font-bold text-foreground">Чаты</h1>
      <ChatList chats={chats} userId={userId} />
    </div>
  )
}
