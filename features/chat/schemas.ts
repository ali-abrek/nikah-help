import { z } from 'zod'

export const sendMessageSchema = z.object({
  chat_id: z.string().uuid(),
  type: z.enum(['text', 'image', 'voice']),
  content: z.string().min(1).max(4000),
  parent_id: z.string().uuid().optional(),
})

export const editMessageSchema = z.object({
  message_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
})

export const deleteMessageSchema = z.object({
  message_id: z.string().uuid(),
})

export const markDeliveredSchema = z.object({
  message_ids: z.array(z.string().uuid()).min(1).max(100),
})

export const markAsReadSchema = z.object({
  chat_id: z.string().uuid(),
  message_ids: z.array(z.string().uuid()).min(1).max(100),
})

export const deleteChatSchema = z.object({
  chat_id: z.string().uuid(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
