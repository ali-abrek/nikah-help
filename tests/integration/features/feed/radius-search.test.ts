import { describe, it, expect, vi } from 'vitest'
import { radiusSearch, getViewerLocation } from '@/features/feed/server/radius-search'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('radiusSearch', () => {
  it('calls the get_nearby_profile_ids RPC with correct parameters', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { profile_id: 'user-b', distance_meters: 5000 },
        { profile_id: 'user-c', distance_meters: 12000 },
      ],
      error: null,
    })

    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<never>

    const results = await radiusSearch(mockSupabase, 37.6173, 55.7558, 50)

    expect(mockRpc).toHaveBeenCalledWith('get_nearby_profile_ids', {
      p_longitude: 37.6173,
      p_latitude: 55.7558,
      p_radius_meters: 50000,
      p_limit: 500,
    })
    expect(results).toHaveLength(2)
    expect(results[0]!.profile_id).toBe('user-b')
    expect(results[0]!.distance_meters).toBe(5000)
  })

  it('returns empty array when no nearby profiles found', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<never>

    const results = await radiusSearch(mockSupabase, 0, 0, 10)
    expect(results).toHaveLength(0)
  })

  it('throws when RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<never>

    await expect(radiusSearch(mockSupabase, 0, 0, 100)).rejects.toThrow()
  })
})

describe('getViewerLocation', () => {
  it('returns coordinates for a user with location', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { location: { coordinates: [37.6173, 55.7558] } },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<never>

    const loc = await getViewerLocation(mockSupabase, 'user-123')
    expect(loc).toEqual({ longitude: 37.6173, latitude: 55.7558 })
  })

  it('returns null when user has no location', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { location: null },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<never>

    const loc = await getViewerLocation(mockSupabase, 'user-456')
    expect(loc).toBeNull()
  })

  it('returns null when query errors', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<never>

    const loc = await getViewerLocation(mockSupabase, 'user-789')
    expect(loc).toBeNull()
  })
})
