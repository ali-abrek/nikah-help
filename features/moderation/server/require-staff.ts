import { createAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/errors/app-error'

export type StaffRole = 'moderator' | 'admin'

/**
 * Verifies the caller has at least the given role and returns the resolved
 * role. Reads from `profiles.role` using the admin client because RLS on
 * `profiles` blocks cross-user lookups — we need a definitive answer that
 * doesn't depend on the caller's own row being readable.
 *
 * `required = 'moderator'` accepts both moderators and admins (admin > moderator).
 * `required = 'admin'` accepts admins only.
 */
export async function requireStaff(
  userId: string,
  required: StaffRole = 'moderator',
): Promise<StaffRole> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    throw new AppError('AUTH_FORBIDDEN', { logContext: { userId, required } })
  }
  const role = data.role
  if (role === 'admin') return 'admin'
  if (role === 'moderator' && required === 'moderator') return 'moderator'

  throw new AppError('AUTH_FORBIDDEN', { logContext: { userId, role, required } })
}
