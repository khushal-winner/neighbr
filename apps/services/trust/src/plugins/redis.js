"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
const ioredis_1 = __importDefault(require("ioredis"));
let client = null;
function getRedis() {
    if (!client) {
        client = new ioredis_1.default(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (t) => Math.min(t * 200, 2000),
        });
        client.on('error', (e) => console.error('[Redis]', e.message));
    }
    return client;
}
