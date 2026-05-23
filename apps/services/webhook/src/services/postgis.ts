import prisma from '../plugins/prisma'

export interface AffectedCommunity {
  id: string
  name: string
  cityId: string
}

export async function findAffectedCommunities(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<AffectedCommunity[]> {
  // Create a buffer circle around the point using PostGIS ST_Buffer
  // Then find all communities whose boundaries intersect with this circle
  const result = await prisma.$queryRaw<AffectedCommunity[]>`
    SELECT 
      id, 
      name, 
      "cityId"
    FROM "MicroCommunity"
    WHERE 
      boundary IS NOT NULL
      AND ST_Intersects(
        boundary,
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )::geometry
      )
  `

  return result
}
