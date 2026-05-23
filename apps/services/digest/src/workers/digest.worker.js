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
exports.startDigestWorker = startDigestWorker;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const bullmq_1 = require("bullmq");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const email_1 = require("../plugins/email");
const digest_1 = require("../templates/digest");
const redis_1 = require("../plugins/redis");
async function processDigest(job) {
    const { communityId, communityName, weekStart, weekEnd } = job.data;
    console.log(`[Digest] Processing community: ${communityName} (${communityId})`);
    const community = await prisma_1.default.microCommunity.findUnique({
        where: { id: communityId },
        select: { lastDigestAt: true },
    });
    if (!community) {
        console.warn(`[Digest] Community ${communityId} not found — skipping`);
        return;
    }
    // idempotency — don't send twice in the same week
    // if lastDigestAt is within the current week, skip
    if (community.lastDigestAt) {
        const lastSent = new Date(community.lastDigestAt);
        const weekStartDate = new Date(weekStart);
        if (lastSent >= weekStartDate) {
            console.log(`[Digest] Already sent for ${communityName} this week — skipping`);
            return;
        }
    }
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);
    // fetch top 5 posts this week ordered by upvotes
    const topPosts = await prisma_1.default.post.findMany({
        where: {
            communityId,
            moderationStatus: 'approved',
            type: { not: 'emergency' }, // emergencies aren't digest material
            createdAt: {
                gte: weekStartDate,
                lte: weekEndDate,
            },
        },
        orderBy: { upvotes: 'desc' },
        take: 5,
        include: {
            author: { select: { displayName: true } },
        },
    });
    // fetch users who joined this community this week
    const newResidents = await prisma_1.default.user.findMany({
        where: {
            communityId,
            createdAt: {
                gte: weekStartDate,
                lte: weekEndDate,
            },
            verificationLevel: { not: 'unverified' },
        },
        select: { displayName: true },
        take: 10,
    });
    // fetch all verified residents with their email addresses
    // these are the recipients for this community's digest
    const recipients = await prisma_1.default.user.findMany({
        where: {
            communityId,
            verificationLevel: { not: 'unverified' },
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            notificationPrefs: true,
        },
    });
    // filter out users who opted out of email digest
    const eligibleRecipients = recipients.filter(user => {
        const prefs = user.notificationPrefs;
        return prefs?.emailDigest !== false; // default is true — only exclude explicit opt-out
    });
    if (eligibleRecipients.length === 0) {
        console.log(`[Digest] No eligible recipients for ${communityName} — skipping send`);
        await prisma_1.default.microCommunity.update({
            where: { id: communityId },
            data: { lastDigestAt: new Date() },
        });
        return;
    }
    // format week label for email header
    const weekOf = weekStartDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const html = (0, digest_1.renderDigestEmail)({
        communityName,
        weekOf,
        posts: topPosts.map(p => ({
            id: p.id,
            title: p.title,
            type: p.type,
            upvotes: p.upvotes,
            authorDisplayName: p.author.displayName,
        })),
        newResidents: newResidents.map(r => ({ displayName: r.displayName })),
        unsubscribeUrl: `https://neighbr.app/settings/notifications`,
    });
    const resend = (0, email_1.getResend)();
    const fromEmail = process.env.DIGEST_FROM_EMAIL ?? 'onboarding@resend.dev';
    // send to each recipient individually — never expose all emails in one To: field
    // for production use Resend's batch API to send up to 100 at once
    let sentCount = 0;
    let failCount = 0;
    for (const recipient of eligibleRecipients) {
        try {
            await resend.emails.send({
                from: `Neighbr <${fromEmail}>`,
                to: recipient.email,
                subject: `Your weekly digest for ${communityName}`,
                html,
            });
            sentCount++;
        }
        catch (err) {
            console.error(`[Digest] Failed to send to ${recipient.email}:`, err);
            failCount++;
        }
    }
    // mark as sent regardless of partial failures
    // partial delivery is better than retrying and double-sending
    await prisma_1.default.microCommunity.update({
        where: { id: communityId },
        data: { lastDigestAt: new Date() },
    });
    console.log(`[Digest] ${communityName}: ${sentCount} sent, ${failCount} failed`);
}
function startDigestWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const worker = new bullmq_1.Worker('digest', async (job) => {
        await processDigest(job);
    }, {
        connection,
        concurrency: 10, // process 10 communities in parallel
    });
    worker.on('completed', (job) => {
        console.log(`[Digest] Job completed: ${job.data.communityName}`);
    });
    worker.on('failed', (job, err) => {
        console.error(`[Digest] Job failed: ${job?.data.communityName}`, err.message);
    });
    console.log('[Digest] Worker started — concurrency: 10');
    return worker;
}
