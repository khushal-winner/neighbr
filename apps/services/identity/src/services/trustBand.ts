export type TrustBand = 'New Resident' | 'Resident' | 'Trusted Neighbour' | 'Community Pillar'

export function getTrustBand(score: number): TrustBand {
    if (score >= 200) return 'Community Pillar'
    if (score >= 100) return 'Trusted Neighbour'
    if (score >= 50) return 'Resident'
    return 'New Resident'
}
