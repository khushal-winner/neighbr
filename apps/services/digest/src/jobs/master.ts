import * as dotenv from 'dotenv'
dotenv.config()

import { Queue, QueueEvents } from 'bullmq'
import prisma from '../plugins/prisma'
import { getBullRedis } from '../plugins/redis'
import { DigestJobData } from '../workers/digest.worker'

function getWeekBoundaries(): { weekStart: string; weekEnd: string } {
    const now = new Date()

    // week starts on Monday
    const day = now.getDay()   // 0 = Sunday, 1 = Monday, ...
    const daysToMonday = day === 0 ? 6 : day - 1

    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysToMonday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    return {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
    }
}

export async function enqueueCommunityDigests(): Promise<void> {
    const connection = getBullRedis()

    const queue = new Queue<DigestJobData>('digest', { connection })

    const { weekStart, weekEnd } = getWeekBoundaries()

    console.log(`[Digest] Master job running — week: ${weekStart} to ${weekEnd}`)

    // fetch all communities that have at least one verified resident
    const communities = await prisma.microCommunity.findMany({
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
    })

    console.log(`[Digest] Enqueueing ${communities.length} community digests`)

    // enqueue all jobs in one batch — BullMQ handles this efficiently
    const jobs = communities.map(community => ({
        name: 'digest-community',
        data: {
            communityId: community.id,
            communityName: community.name,
            weekStart,
            weekEnd,
        } as DigestJobData,
        opts: {
            attempts: 3,
            backoff: {
                type: 'exponential' as const,
                delay: 60000,   // retry after 1 min, 2 min, 4 min
            },
            removeOnComplete: true,    // clean up completed jobs
            removeOnFail: 100,         // keep last 100 failed jobs for inspection
        },
    }))

    await queue.addBulk(jobs)

    console.log(`[Digest] ${communities.length} jobs enqueued`)

    await queue.close()
}