import { z } from 'zod'

export const sendLikeSchema = z.object({
  to_user_id: z.string().uuid({ error: 'Некорректный ID пользователя' }),
})

export const revokeLikeSchema = z.object({
  target_user_id: z.string().uuid({ error: 'Некорректный ID пользователя' }),
})

export type SendLikeInput = z.infer<typeof sendLikeSchema>
export type RevokeLikeInput = z.infer<typeof revokeLikeSchema>
