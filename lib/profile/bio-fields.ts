import { createHash } from 'node:crypto'

/**
 * Profile columns whose values feed AI bio generation. A change to any of
 * these on a completed profile triggers a `profile/regenerate-bio` Inngest
 * event (rate-limited to 3/day per user inside Inngest).
 *
 * Single source of truth — both the regen worker and the edit-time hash
 * helpers below import this list. Adding a new bio-relevant column means
 * editing this array only.
 */
export const BIO_RELEVANT_FIELDS = [
  'name',
  'gender',
  'birth_date',
  'country',
  'city',
  'nationality',
  'education',
  'marital_status',
  'children_count',
  'income_level',
  'housing',
  'willing_to_relocate',
  'polygyny_attitude',
  'hijab_attitude',
  'about_self',
] as const

export type BioRelevantField = (typeof BIO_RELEVANT_FIELDS)[number]

export const BIO_FIELDS_SQL = BIO_RELEVANT_FIELDS.join(', ')

export function hashBioFields(profile: Record<string, unknown>): string {
  const canonical = BIO_RELEVANT_FIELDS
    .map((k) => `${k}=${profile[k] ?? ''}`)
    .join('|')
  return createHash('sha256').update(canonical).digest('hex')
}
