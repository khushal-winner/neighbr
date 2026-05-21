import * as dotenv from 'dotenv'
dotenv.config()

import { Worker, Job } from 'bullmq'
import prisma from '../plugins/prisma'
import { getResend } from '../plugins/email'
import { renderDigestEmail } from '../templates/digest'
import { getBullRedis } from '../plugins/redis'

export interface DigestJobData {
    communityId: string
    communityName: string
    weekStart: string   // ISO string — Monday of this week
    weekEnd: string     // ISO string — Sunday of this week
}

async function processDigest(job: Job<DigestJobData>): Promise<void> {
    const { communityId, communityName, weekStart, weekEnd } = job.data

    console.log(`[Digest] Processing community: ${communityName} (${communityId})`)

    const community = await prisma.microCommunity.findUnique({
        where: { id: communityId },
        select: { lastDigestAt: true },
    })

    if (!community) {
        console.warn(`[Digest] Community ${communityId} not found — skipping`)
        return
    }

    // idempotency — don't send twice in the same week
    // if lastDigestAt is within the current week, skip
    if (community.lastDigestAt) {
        const lastSent = new Date(community.lastDigestAt)
        const weekStartDate = new Date(weekStart)

        if (lastSent >= weekStartDate) {
            console.log(`[Digest] Already sent for ${communityName} this week — skipping`)
            return
        }
    }

    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(weekEnd)

    // fetch top 5 posts this week ordered by upvotes
    const topPosts = await prisma.post.findMany({
        where: {
            communityId,
            moderationStatus: 'approved',
            type: { not: 'emergency' },   // emergencies aren't digest material
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
    })

    // fetch users who joined this community this week
    const newResidents = await prisma.user.findMany({
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
    })

    // fetch all verified residents with their email addresses
    // these are the recipients for this community's digest
    const recipients = await prisma.user.findMany({
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
    })

    // filter out users who opted out of email digest
    const eligibleRecipients = recipients.filter(user => {
        const prefs = user.notificationPrefs as Record<string, boolean> | null
        return prefs?.emailDigest !== false   // default is true — only exclude explicit opt-out
    })

    if (eligibleRecipients.length === 0) {
        console.log(`[Digest] No eligible recipients for ${communityName} — skipping send`)
        await prisma.microCommunity.update({
            where: { id: communityId },
            data: { lastDigestAt: new Date() },
        })
        return
    }

    // format week label for email header
    const weekOf = weekStartDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })

    const html = renderDigestEmail({
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
    })

    const resend = getResend()
    const fromEmail = process.env.DIGEST_FROM_EMAIL ?? 'onboarding@resend.dev'

    // send to each recipient individually — never expose all emails in one To: field
    // for production use Resend's batch API to send up to 100 at once
    let sentCount = 0
    let failCount = 0

    for (const recipient of eligibleRecipients) {
        try {
            await resend.emails.send({
                from: `Neighbr <${fromEmail}>`,
                to: recipient.email,
                subject: `Your weekly digest for ${communityName}`,
                html,
            })
            sentCount++
        } catch (err) {
            console.error(`[Digest] Failed to send to ${recipient.email}:`, err)
            failCount++
        }
    }

    // mark as sent regardless of partial failures
    // partial delivery is better than retrying and double-sending
    await prisma.microCommunity.update({
        where: { id: communityId },
        data: { lastDigestAt: new Date() },
    })

    console.log(
        `[Digest] ${communityName}: ${sentCount} sent, ${failCount} failed`
    )
}

export function startDigestWorker(): Worker<DigestJobData> {
    const connection = getBullRedis()

    const worker = new Worker<DigestJobData>(
        'digest',
        async (job) => {
            await processDigest(job)
        },
        {
            connection,
            concurrency: 10,   // process 10 communities in parallel
        }
    )

    worker.on('completed', (job) => {
        console.log(`[Digest] Job completed: ${job.data.communityName}`)
    })

    worker.on('failed', (job, err) => {
        console.error(`[Digest] Job failed: ${job?.data.communityName}`, err.message)
    })

    console.log('[Digest] Worker started — concurrency: 10')

    return worker
}