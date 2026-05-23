"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrustBand = getTrustBand;
function getTrustBand(score) {
    if (score >= 200)
        return 'Community Pillar';
    if (score >= 100)
        return 'Trusted Neighbour';
    if (score >= 50)
        return 'Resident';
    return 'New Resident';
}
