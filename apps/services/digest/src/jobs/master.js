"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueCommunityDigests = enqueueCommunityDigests;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const redis_1 = require("../plugins/redis");
function getWeekBoundaries() {
    const now = new Date();
    // week starts on Monday
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const daysToMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
    };
}
async function enqueueCommunityDigests() {
    const connection = (0, redis_1.getBullRedis)();
    const queue = new bullmq_1.Queue('digest', { connection });
    const { weekStart, weekEnd } = getWeekBoundaries();
    console.log(`[Digest] Master job running — week: ${weekStart} to ${weekEnd}`);
    // fetch all communities that have at least one verified resident
    const communities = await prisma_1.default.microCommunity.findMany({
        where: {
            users: {
                some: {
                    verificationLevel: { not: 'unverified' },
                },
            },
        },
        select: {
            id: true,
            name: true,
        },
    });
    console.log(`[Digest] Enqueueing ${communities.length} community digests`);
    // enqueue all jobs in one batch — BullMQ handles this efficiently
    const jobs = communities.map(community => ({
        name: 'digest-community',
        data: {
            communityId: community.id,
            communityName: community.name,
            weekStart,
            weekEnd,
        },
        opts: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 60000, // retry after 1 min, 2 min, 4 min
            },
            removeOnComplete: true, // clean up completed jobs
            removeOnFail: 100, // keep last 100 failed jobs for inspection
        },
    }));
    await queue.addBulk(jobs);
    console.log(`[Digest] ${communities.length} jobs enqueued`);
    await queue.close();
}
