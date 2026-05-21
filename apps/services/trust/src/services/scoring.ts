// every event type that can affect trust score
// values are point deltas — positive builds trust, negative reduces it
export type TrustEventType =
    | 'post_approved'       // post passed moderation
    | 'post_upvoted'        // neighbour upvoted your post
    | 'post_removed'        // post was removed by moderation or block captain
    | 'flag_received'       // your post was flagged by community
    | 'postcard_verified'   // completed physical address verification
    | 'poll_participated'   // voted in a community poll

// the authoritative delta map — all trust scoring logic lives here
// to rebalance scoring: change these numbers, replay the event stream
export const TRUST_DELTAS: Record<TrustEventType, number> = {
    post_approved: 30,
    post_upvoted: 5,
    post_removed: -20,
    flag_received: -10,
    postcard_verified: 50,
    poll_participated: 15,
}

// trust bands — derived from score, never stored
// same thresholds as Identity Service — single source of truth here
export type TrustBand =
    | 'New Resident'
    | 'Resident'
    | 'Trusted Neighbour'
    | 'Community Pillar'

export function getTrustBand(score: number): TrustBand {
    if (score >= 200) return 'Community Pillar'
    if (score >= 100) return 'Trusted Neighbour'
    if (score >= 30) return 'Resident'
    return 'New Resident'
}

// score floor — trust can't go below zero
// prevents targeted flagging from permanently destroying a legitimate user
export const SCORE_FLOOR = 0