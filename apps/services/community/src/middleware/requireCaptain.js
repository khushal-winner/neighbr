"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCaptain = requireCaptain;
const prisma_1 = __importDefault(require("../plugins/prisma"));
// extracts communityId from route params and verifies
// the requesting user is the block captain of that community
// used as a preHandler on captain-only routes
async function requireCaptain(request, reply) {
    const user = request.user;
    const { communityId } = request.params;
    if (!communityId) {
        return reply.status(400).send({ error: 'communityId param required' });
    }
    const community = await prisma_1.default.microCommunity.findUnique({
        where: { id: communityId },
        select: { blockCaptainId: true },
    });
    if (!community) {
        return reply.status(404).send({ error: 'Community not found' });
    }
    if (community.blockCaptainId !== user.sub) {
        return reply.status(403).send({ error: 'Block captain access required' });
    }
}
