import { z } from 'zod'

export const citySearchSchema = z.object({
  q: z.string().min(1, { error: 'Введите запрос' }).max(100),
  country: z
    .string()
    .length(2, { error: 'Код страны — 2 символа' })
    .optional(),
})

export type CitySearchParams = z.infer<typeof citySearchSchema>
