import { z } from 'zod'

export const emailSchema = z.object({
  email: z.email({ error: 'Введите корректный email' }),
})

export type EmailInput = z.infer<typeof emailSchema>
