import type { TKey } from '@/lib/i18n/dictionary'

// Maps moderation rejection reasons (as set by evaluateModeration) to i18n
// keys. The decision codes are stable strings produced server-side; if a new
// code is added without updating this map, the generic key is shown.
const KEY_BY_REASON: Record<string, TKey> = {
  explicit_nudity: 'ph_rejected_explicit_nudity',
  suggestive_content: 'ph_rejected_suggestive_content',
  violence: 'ph_rejected_violence',
  hate_symbols: 'ph_rejected_hate_symbols',
  face_count_invalid: 'ph_rejected_face_count_invalid',
  gender_mismatch: 'ph_rejected_gender_mismatch',
}

export function rejectionToastKey(reason: string | null | undefined): TKey {
  if (!reason) return 'ph_rejected_generic'
  return KEY_BY_REASON[reason] ?? 'ph_rejected_generic'
}
