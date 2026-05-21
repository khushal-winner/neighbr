import prisma from "../plugins/prisma"


export interface AffectedCommunity {
    id: string
    name: string
    cityId: string
}

// find all communities whose boundary intersectes a circle
// centered at (lat, lon) with the given radius in meters
// ST_Intersects = any overlap bw the polygon and the circle
// this catches communities that are partially inside the affected area
export async function findAffectedCommunities(
    lon: number,
    lat: number,
    radiuMeters: number,
): Promise<AffectedCommunity[]> {
    const communities = await prisma.$queryRaw<AffectedCommunity[]>`
    SELECT id , name, "cityId"
    FROM "MicroCommunity"
    WHERE
      boundary IS NOT NULL
      AND ST_Intersects(
        boundar::geography,
        ST_Buffer(
            ST_SetSRIF(ST_MakePoint(${lon}, ${lat}, 4326)::geography),
        )
      )
    `

    return communities
}