import amqplib from 'amqplib'

let connection: amqplib.ChannelModel | null = null
let channel: amqplib.Channel | null = null

// connect to rabbitmq
async function getChannel(): Promise<amqplib.Channel> {
    if (!channel) {
        const url = process.env.RABBITMQ_URL
        if (!url) throw new Error('RABBITMQ_URL is not defined')

        connection = await amqplib.connect(url)
        channel = await connection.createChannel()

        await channel.assertQueue('moderation.jobs', { durable: true })

        connection.on('error', (error) => {
            console.error('RabbitMQ connection error', error.message)
            channel = null
            connection = null
        })
    }
    return channel
}

export interface ModerationJob {
    postId: string
    text: string
    imageUrls: string[]
    trustScore: number
    authorId: string
    type: string
}


export async function PublishToModerationQueue(job: ModerationJob): Promise<void> {
    const ch = await getChannel()

    ch.sendToQueue(
        'moderation.jobs',
        Buffer.from(JSON.stringify(job)),
        { persistent: true }
    )

    console.log(`[Queue] Published moderation job for post: ${job.postId}`)
}
