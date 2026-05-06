import { inngest } from '@/lib/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const likeRevokeFn = inngest.createFunction(
  {
    id: 'like.revoke',
    retries: 3,
    triggers: { event: 'like/revoke' },
  },
  async ({ event, step }) => {
    const { matchId, userId, otherUserId } = event.data as {
      matchId: string
      userId: string
      otherUserId: string
    }

    // 1. Find chat for this match
    const chatId = await step.run('find-chat', async () => {
      const supabase = createAdminClient()
      const { data: chat } = await supabase
        .from('chats')
        .select('id')
        .eq('match_id', matchId)
        .single()
      return chat?.id ?? null
    })

    // 2. Delete media files from Storage
    if (chatId) {
      await step.run('cleanup-chat-media', async () => {
        const supabase = createAdminClient()

        // Find all media messages (image, voice) in the chat
        const { data: mediaMessages } = await supabase
          .from('messages')
          .select('content')
          .eq('chat_id', chatId)
          .in('type', ['image', 'voice'])

        if (mediaMessages && mediaMessages.length > 0) {
          const paths = mediaMessages
            .map((m) => m.content)
            .filter((c): c is string => !!c && (c.startsWith(userId + '/') || c.startsWith(otherUserId + '/')))

          if (paths.length > 0) {
            await supabase.storage.from('chat-media').remove(paths)
          }
        }
      })
    }

    // 3. Notify both users about match revocation
    await step.run('notify-revocation', async () => {
      const supabase = createAdminClient()
      await supabase.from('notifications').insert([
        {
          user_id: otherUserId,
          type: 'match_revoked',
          title_key: 'notification.match_revoked.title',
          body_key: 'notification.match_revoked.body',
          entity_id: matchId,
        },
      ])
    })

    // 4. Delete match (cascade deletes chat, messages)
    await step.run('delete-match', async () => {
      const supabase = createAdminClient()
      await supabase.from('matches').delete().eq('id', matchId)
    })

    return { success: true, matchId }
  },
)
