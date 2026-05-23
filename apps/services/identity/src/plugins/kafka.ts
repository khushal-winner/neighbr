import { Kafka, Producer, logLevel } from "kafkajs"



let producer: Producer | null = null

export async function getKafkaProducer(): Promise<Producer> {
    if (!producer) {
        const kafka = new Kafka({
            clientId: 'identity-service',
            brokers: [process.env.KAFKA_BROKER as string],
            ssl: true,
            sasl: {
                mechanism: 'scram-sha-256',
                username: process.env.KAFKA_USERNAME as string,
                password: process.env.KAFKA_PASSWORD as string,
            },
            logLevel: logLevel.WARN,
        })

        producer = kafka.producer()
        await producer.connect()
        console.log('[Identity] Kafka producer connected')
    }
    return producer
}
