"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCORE_FLOOR = exports.TRUST_DELTAS = void 0;
exports.getTrustBand = getTrustBand;
// the authoritative delta map — all trust scoring logic lives here
// to rebalance scoring: change these numbers, replay the event stream
exports.TRUST_DELTAS = {
    post_approved: 30,
    post_upvoted: 5,
    post_removed: -20,
    flag_received: -10,
    postcard_verified: 50,
    poll_participated: 15,
};
function getTrustBand(score) {
    if (score >= 200)
        return 'Community Pillar';
    if (score >= 100)
        return 'Trusted Neighbour';
    if (score >= 30)
        return 'Resident';
    return 'New Resident';
}
// score floor — trust can't go below zero
// prevents targeted flagging from permanently destroying a legitimate user
exports.SCORE_FLOOR = 0;
