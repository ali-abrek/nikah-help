import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export interface NearbyProfile {
  profile_id: string
  distance_meters: number
}

interface GetNearbyParams {
  p_longitude: number
  p_latitude: number
  p_radius_meters: number
  p_limit: number
}

type RpcFn = (
  fn: 'get_nearby_profile_ids',
  params: GetNearbyParams,
) => Promise<{ data: NearbyProfile[] | null; error: Error | null }>

/**
 * Returns profile IDs within a given radius of the specified coordinates.
 * Uses PostGIS ST_DWithin for efficient spatial querying.
 */
export async function radiusSearch(
  supabase: SupabaseClient<Database>,
  longitude: number,
  latitude: number,
  radiusKm: number,
  limit = 500,
): Promise<NearbyProfile[]> {
  const radiusMeters = radiusKm * 1000

  const { data, error } = await (supabase.rpc as unknown as RpcFn)(
    'get_nearby_profile_ids',
    {
      p_longitude: longitude,
      p_latitude: latitude,
      p_radius_meters: radiusMeters,
      p_limit: limit,
    },
  )

  if (error) throw error
  return (data ?? []) as NearbyProfile[]
}

/**
 * Looks up the viewer's coordinates from their profile.
 */
export async function getViewerLocation(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ longitude: number; latitude: number } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('location')
    .eq('id', userId)
    .single()

  if (error || !data?.location) return null

  // Supabase PostGIS stores geography as GeoJSON-like or WKT
  const loc = data.location as { coordinates?: [number, number] }
  if (loc?.coordinates && loc.coordinates.length >= 2) {
    return {
      longitude: loc.coordinates[0]!,
      latitude: loc.coordinates[1]!,
    }
  }

  return null
}
