"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishToModerationQueue = PublishToModerationQueue;
const amqplib_1 = __importDefault(require("amqplib"));
let connection = null;
let channel = null;
// connect to rabbitmq
async function getChannel() {
    if (!channel) {
        const url = process.env.RABBITMQ_URL;
        if (!url)
            throw new Error('RABBITMQ_URL is not defined');
        connection = await amqplib_1.default.connect(url);
        channel = await connection.createChannel();
        await channel.assertQueue('moderation.jobs', { durable: true });
        connection.on('error', (error) => {
            console.error('RabbitMQ connection error', error.message);
            channel = null;
            connection = null;
        });
    }
    return channel;
}
async function PublishToModerationQueue(job) {
    const ch = await getChannel();
    ch.sendToQueue('moderation.jobs', Buffer.from(JSON.stringify(job)), { persistent: true });
    console.log(`[Queue] Published moderation job for post: ${job.postId}`);
}
