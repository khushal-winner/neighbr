"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKafkaProducer = getKafkaProducer;
const kafkajs_1 = require("kafkajs");
let producer = null;
async function getKafkaProducer() {
    if (!producer) {
        const kafka = new kafkajs_1.Kafka({
            clientId: 'identity-service',
            brokers: [process.env.KAFKA_BROKER],
            ssl: true,
            sasl: {
                mechanism: 'scram-sha-256',
                username: process.env.KAFKA_USERNAME,
                password: process.env.KAFKA_PASSWORD,
            },
            logLevel: kafkajs_1.logLevel.WARN,
        });
        producer = kafka.producer();
        await producer.connect();
        console.log('[Identity] Kafka producer connected');
    }
    return producer;
}
