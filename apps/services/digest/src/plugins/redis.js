"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBullRedis = getBullRedis;
const ioredis_1 = __importDefault(require("ioredis"));
// BullMQ needs its own Redis connection separate from general use
// it uses blocking commands that can't share a connection
let bullConnection = null;
function getBullRedis() {
    if (!bullConnection) {
        const url = process.env.REDIS_URL;
        if (!url)
            throw new Error('REDIS_URL is not set');
        // maxRetriesPerRequest must be null for BullMQ blocking commands
        bullConnection = new ioredis_1.default(url, {
            maxRetriesPerRequest: null,
            retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        bullConnection.on('error', (err) => console.error('[Redis/Bull]', err.message));
        bullConnection.on('connect', () => console.log('[Redis/Bull] connected'));
    }
    return bullConnection;
}
