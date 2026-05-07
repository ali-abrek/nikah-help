import { describe, it, expect, vi } from 'vitest'
import { togglePublish } from '@/features/profile/server/toggle-publish'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('togglePublish', () => {
  let mockSupabase: { from: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockSupabase = { from: vi.fn() }
  })

  it('publishes when profile has at least one approved photo', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { is_published: false },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }
      if (table === 'photos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                count: 2,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const result = await togglePublish(
      mockSupabase as unknown as SupabaseClient<never>,
      'user-123',
    )
    expect(result.success).toBe(true)
    expect(result.is_published).toBe(true)
  })

  it('rejects publish when profile has no approved photos', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { is_published: false },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }
      if (table === 'photos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                count: 0,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const result = await togglePublish(
      mockSupabase as unknown as SupabaseClient<never>,
      'user-123',
    )
    expect(result.success).toBe(false)
    expect(result.is_published).toBe(false)
    expect(result.errorCode).toBe('PROFILE_NO_APPROVED_PHOTO')
  })

  it('unpublishes a published profile', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { is_published: true },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({ error: null }),
          }),
        }
      }
      return {}
    })

    const result = await togglePublish(
      mockSupabase as unknown as SupabaseClient<never>,
      'user-123',
    )
    expect(result.success).toBe(true)
    expect(result.is_published).toBe(false)
  })

  it('returns error when profile not found', async () => {
    mockSupabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        }),
      }),
    })

    const result = await togglePublish(
      mockSupabase as unknown as SupabaseClient<never>,
      'user-123',
    )
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NOT_FOUND')
  })
})
