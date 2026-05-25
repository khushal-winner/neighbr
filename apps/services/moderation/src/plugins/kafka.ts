import { Kafka, Producer, logLevel, Admin } from 'kafkajs'

let producer: Producer | null = null
let admin: Admin | null = null

async function ensureTopicsExist(): Promise<void> {
    if (!admin) {
        const kafka = new Kafka({
            clientId: 'moderation-service',
            brokers: [process.env.KAFKA_BROKER as string],
            ssl: true,
            sasl: {
                mechanism: 'scram-sha-256',
                username: process.env.KAFKA_USERNAME as string,
                password: process.env.KAFKA_PASSWORD as string,
            },
            logLevel: logLevel.WARN,
        })
        admin = kafka.admin()
        await admin.connect()
    }

    const topics = [
        { topic: 'post.created', numPartitions: 3, replicationFactor: 1 },
        { topic: 'user.events', numPartitions: 3, replicationFactor: 1 },
    ]

    try {
        await admin.createTopics({ topics, waitForLeaders: true })
        console.log('[Moderation] Kafka topics created/verified')
    } catch (err: any) {
        if (err.type === 'TOPIC_ALREADY_EXISTS') {
            console.log('[Moderation] Kafka topics already exist')
        } else {
            console.warn('[Moderation] Failed to create Kafka topics:', err.message)
        }
    }
}

export async function getKafkaProducer(): Promise<Producer> {
    if (!producer) {
        const kafka = new Kafka({
            clientId: 'moderation-service',
            brokers: [process.env.KAFKA_BROKER as string],
            ssl: true,
            sasl: {
                mechanism: 'scram-sha-256',
                username: process.env.KAFKA_USERNAME as string,
                password: process.env.KAFKA_PASSWORD as string,
            },
            logLevel: logLevel.WARN,
        })

        // Ensure topics exist before connecting producer
        await ensureTopicsExist()

        producer = kafka.producer()
        await producer.connect()
        console.log('[Moderation] Kafka producer connected')
    }

    return producer
}