// Hand-typed signatures for RPC functions whose return shapes are not yet
// in the generated `database.types.ts`. Using these in place of repeated
// `supabase.rpc as unknown as ...` casts gives one place to update when
// the generated types catch up, and keeps individual call sites legible.
//
// IMPORTANT: keep these signatures in sync with the SQL definitions.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RpcResult<T> {
  data: T | null
  error: { message: string } | null
}

export type RpcCaller = SupabaseClient | SupabaseClient<any> // eslint-disable-line @typescript-eslint/no-explicit-any

function rpc<TArgs, TResult>(name: string) {
  return async (client: RpcCaller, args: TArgs): Promise<RpcResult<TResult>> => {
    const r = await (
      client.rpc as unknown as (fn: string, a: TArgs) => Promise<RpcResult<TResult>>
    )(name, args)
    return r
  }
}

// ── send_like(p_from, p_to) → { matched, match_id, error_code }[] ──────
export interface SendLikeArgs {
  p_from: string
  p_to: string
}
export interface SendLikeRow {
  matched: boolean
  match_id: string | null
  error_code: string | null
}
export const callSendLike = rpc<SendLikeArgs, SendLikeRow[]>('send_like')

// ── get_photo_stream_context ───────────────────────────────────────────
export interface PhotoStreamContextArgs {
  p_photo_id: string
  p_viewer_id: string
}
export interface PhotoStreamContextRow {
  id: string
  profile_id: string
  moderation_status: string
  variants: Record<string, { avif?: string; webp?: string }> | null
  is_published: boolean
  private_mode: boolean
  show_full: boolean
  can_view: boolean
}
export const callPhotoStreamContext = rpc<PhotoStreamContextArgs, PhotoStreamContextRow[]>(
  'get_photo_stream_context',
)

// ── reorder_profile_photos ─────────────────────────────────────────────
export interface ReorderProfilePhotosArgs {
  p_profile_id: string
  p_photo_ids: string[]
  p_expected_signature?: string | null
}
export const callReorderProfilePhotos = rpc<ReorderProfilePhotosArgs, void>(
  'reorder_profile_photos',
)

// ── count_likes_used ───────────────────────────────────────────────────
export interface CountLikesUsedArgs {
  p_user: string
}
export const callCountLikesUsed = rpc<CountLikesUsedArgs, number>('count_likes_used')

// ── is_user_suspended ──────────────────────────────────────────────────
export interface IsUserSuspendedArgs {
  p_user: string
}
export const callIsUserSuspended = rpc<IsUserSuspendedArgs, boolean>('is_user_suspended')

// ── chat_previews(p_viewer_id) → chat_id, last_message_*, unread_count ──
export interface ChatPreviewsArgs {
  p_viewer_id: string
}
export interface ChatPreviewsRow {
  chat_id: string
  last_message_type: string | null
  last_message_content: string | null
  last_message_sender_id: string | null
  last_message_created_at: string | null
  unread_count: number
}
export const callChatPreviews = rpc<ChatPreviewsArgs, ChatPreviewsRow[]>('chat_previews')

// ── get_nearby_profile_ids — see 0015_feed_radius_search.sql ───────────
export interface NearbyProfilesArgs {
  p_longitude: number
  p_latitude: number
  p_radius_meters: number
  p_limit?: number
}
export interface NearbyProfilesRow {
  profile_id: string
  distance_meters: number
}
export const callNearbyProfileIds = rpc<NearbyProfilesArgs, NearbyProfilesRow[]>(
  'get_nearby_profile_ids',
)
