import { describe, it, expect, vi } from 'vitest'

// We test the cursor logic at the integration boundary by stubbing the
// Supabase chain. This documents the (created_at, id) ordering and the
// composite cursor format introduced in H9.

import { queryFeed } from '@/features/feed/server/query-feed'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

interface ProfileRow {
  id: string
  name: string
  gender: 'male' | 'female'
  birth_date: string | null
  country: string | null
  city: string | null
  ai_bio: string | null
  marital_status: string | null
  children_count: number | null
  created_at: string
  photos: {
    id: string
    variants: Record<string, unknown> | null
    position: number
    moderation_status: string
  }[]
}

function makeRow(overrides: Partial<ProfileRow>): ProfileRow {
  return {
    id: 'p1',
    name: 'Test',
    gender: 'female',
    birth_date: null,
    country: null,
    city: null,
    ai_bio: null,
    marital_status: null,
    children_count: null,
    created_at: '2025-01-01T00:00:00Z',
    photos: [
      {
        id: 'ph1',
        variants: { cover: { webp: 'p.webp' } },
        position: 1,
        moderation_status: 'approved',
      },
    ],
    ...overrides,
  }
}

function makeStubSupabase(rows: ProfileRow[]): {
  client: SupabaseClient<Database>
  capturedOrders: Array<{ column: string; ascending: boolean }>
  capturedFilters: { lt: unknown; or: string | null }
} {
  const orders: Array<{ column: string; ascending: boolean }> = []
  const filters = { lt: undefined as unknown, or: null as string | null }

  // Thenable builder: every chainable method returns the same builder.
  // Awaiting the builder resolves to { data, error }, mirroring how the
  // Supabase PostgrestBuilder behaves at the end of the chain.
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lt: vi.fn((_col: string, value: string) => {
      filters.lt = value
      return builder
    }),
    lte: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    or: vi.fn((expr: string) => {
      filters.or = expr
      return builder
    }),
    order: vi.fn((column: string, opts: { ascending: boolean }) => {
      orders.push({ column, ascending: opts.ascending })
      return builder
    }),
    limit: vi.fn(() => builder),
    then: (onfulfilled: (v: { data: ProfileRow[]; error: null }) => unknown) =>
      Promise.resolve(onfulfilled({ data: rows, error: null })),
  })

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') return builder
      // likes / matches lookups in the feed flow
      const sub: Record<string, unknown> = {}
      Object.assign(sub, {
        select: vi.fn(() => sub),
        eq: vi.fn(() => sub),
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        or: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })
      return sub
    }),
  } as unknown as SupabaseClient<Database>

  return { client, capturedOrders: orders, capturedFilters: filters }
}

describe('queryFeed cursor', () => {
  it('orders by (created_at DESC, id DESC) — strict total order', async () => {
    const { client, capturedOrders } = makeStubSupabase([])

    await queryFeed({
      supabase: client,
      viewerId: '11111111-1111-4111-8111-111111111111',
      viewerGender: 'male',
    })

    expect(capturedOrders).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ])
  })

  it('emits a composite "<created_at>|<id>" cursor when more results exist', async () => {
    const rows: ProfileRow[] = []
    for (let i = 0; i < 21; i++) {
      // Same timestamp on purpose — the tiebreaker is id.
      rows.push(
        makeRow({ id: `p${String(i).padStart(2, '0')}`, created_at: '2025-01-01T00:00:00Z' }),
      )
    }
    const { client } = makeStubSupabase(rows)

    const page = await queryFeed({
      supabase: client,
      viewerId: '11111111-1111-4111-8111-111111111111',
      viewerGender: 'male',
    })

    expect(page.profiles).toHaveLength(20)
    expect(page.nextCursor).toBe('2025-01-01T00:00:00Z|p19')
  })

  it('returns null cursor when fewer rows than page size', async () => {
    const rows = [makeRow({ id: 'only', created_at: '2025-01-01T00:00:00Z' })]
    const { client } = makeStubSupabase(rows)

    const page = await queryFeed({
      supabase: client,
      viewerId: '11111111-1111-4111-8111-111111111111',
      viewerGender: 'male',
    })
    expect(page.nextCursor).toBeNull()
  })

  it('forwards a composite cursor as a logical-OR clause', async () => {
    const { client, capturedFilters } = makeStubSupabase([])

    await queryFeed({
      supabase: client,
      viewerId: '11111111-1111-4111-8111-111111111111',
      viewerGender: 'male',
      cursor: '2025-01-01T00:00:00Z|p19',
    })

    expect(capturedFilters.or).toBe(
      'and(created_at.eq.2025-01-01T00:00:00Z,id.lt.p19),created_at.lt.2025-01-01T00:00:00Z',
    )
    expect(capturedFilters.lt).toBeUndefined()
  })

  it('falls back to a coarse `lt(created_at)` filter for legacy cursors', async () => {
    const { client, capturedFilters } = makeStubSupabase([])

    await queryFeed({
      supabase: client,
      viewerId: '11111111-1111-4111-8111-111111111111',
      viewerGender: 'male',
      cursor: '2025-01-01T00:00:00Z',
    })

    expect(capturedFilters.lt).toBe('2025-01-01T00:00:00Z')
    expect(capturedFilters.or).toBeNull()
  })
})
