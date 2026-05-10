import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { callNearbyProfileIds, type NearbyProfilesRow } from '@/lib/supabase/rpc'

export type NearbyProfile = NearbyProfilesRow

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

  const { data, error } = await callNearbyProfileIds(supabase, {
    p_longitude: longitude,
    p_latitude: latitude,
    p_radius_meters: radiusMeters,
    p_limit: limit,
  })

  if (error) throw new Error(error.message)
  return data ?? []
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

  const loc = data.location as { coordinates?: [number, number] }
  if (loc?.coordinates && loc.coordinates.length >= 2) {
    return {
      longitude: loc.coordinates[0]!,
      latitude: loc.coordinates[1]!,
    }
  }

  return null
}
