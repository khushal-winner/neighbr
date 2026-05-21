import { FastifyInstance } from 'fastify'
import { requireAuth } from '../plugins/auth'
import prisma from '../plugins/prisma'
import { getRedis } from '../plugins/redis'

// trust band labels - same logic as Identity service
// duplicated here intentionally - services shouldn't share runtime code, only types
function getTrustBand(score: number): string {
    if (score >= 200) return 'Community Pillar'
    if (score >= 100) return 'Trusted Neighbour'
    if (score >= 30) return 'Resident'
    return 'New Resident'
}

export async function feedRoutes(app: FastifyInstance) {

    // get /feed
    // require auth - we read communityId from JWT so users only see their block
    app.get('/feed', { preHandler: requireAuth }, async (request, reply) => {
        const user = request.user as {
            sub: string
            communityId: string | null
        }

        if (!user.communityId) {
            return reply.status(400).send({
                error: 'You must verify your address before viewing the feed'
            })
        }

        const query = request.query as {
            cursor?: string  // Unix timestamp - fetch posts older than this
            limit?: string
        }

        const limit = Math.min(parseInt(query.limit ?? '20', 10), 50)
        const cursor = query.cursor ? parseInt(query.cursor, 10) : Date.now()

        const redis = getRedis()
        const key = `feed:${user.communityId}`

        // ZREVRANGEBYSCORE - get postIds from newest to oldest, starting before cursor
        // Upstash Redis uses different method names than ioredis
        const postIds = await redis.zrange(
            key,
            0,
            limit,
            { rev: true, byScore: true }
        )

        if (postIds.length === 0) {
            // Fallback: query database directly if Redis is empty (e.g., Kafka consumer not running)
            console.log(`[Feed] Redis empty for community ${user.communityId}, using DB fallback`)
            const posts = await prisma.post.findMany({
                where: {
                    communityId: user.communityId,
                    moderationStatus: 'approved',
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            displayName: true,
                            verificationLevel: true,
                            trustScore: true,
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
            })

            const shaped = posts.map(post => ({
                ...post,
                author: {
                    ...post.author,
                    trustBand: getTrustBand(post.author.trustScore),
                }
            }))

            return reply.send({
                posts: shaped,
                nextCursor: posts.length > 0 ? posts[posts.length - 1].createdAt.getTime() : null
            })
        }

        // one DB query for all post IDs - never N+1
        const posts = await prisma.post.findMany({
            where: {
                id: { in: postIds as string[] },
                moderationStatus: 'approved', // safety net - should already be filtered at index time
            },
            include: {
                author: {
                    select: {
                        id: true,
                        displayName: true,
                        verificationLevel: true,
                        trustScore: true,
                    }
                }
            }
        })

        // re-sort to match redis order (db query don't gurantee it)
        const orderMap = new Map<string, number>((postIds as string[]).map((id: string, i: number) => [id, i]))
        posts.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

        // shape the response - add trust band to author
        const shaped = posts.map(post => ({
            ...post,
            author: {
                ...post.author,
                trustBand: getTrustBand(post.author.trustScore),
            }
        }))

        // the next cursor is the score of the last post returned
        // frontend passes this back on the next scroll request
        const lastPostId = postIds[postIds.length - 1]
        const lastScore = await redis.zscore(key, lastPostId)
        const nextCursor = lastScore ? Math.floor(lastScore) : null

        return reply.send({
            posts: shaped,
            nextCursor, // null means no more posts
        })

    })



    // get /feed/post/:id
    // fetch a single approved post - used when opening a post from notification
    app.get('/feed/post/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        const post = await prisma.post.findUnique({
            where: { id, moderationStatus: 'approved' },
            include: {
                author: {
                    select: {
                        id: true,
                        displayName: true,
                        verificationLevel: true,
                        trustScore: true,
                    }
                }
            }
        })

        if (!post) {
            return reply.status(404).send({ error: 'Post not found' })
        }

        return reply.send({
            post: {
                ...post,
                author: {
                    ...post.author,
                    trustBand: getTrustBand(post.author.trustScore),
                }
            }
        })
    })
}