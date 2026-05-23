"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDigest = startDigest;
const bullmq_1 = require("bullmq");
const redis_1 = require("./plugins/redis");
const digest_worker_1 = require("./workers/digest.worker");
const master_1 = require("./jobs/master");
async function startDigest() {
    console.log("[Digest] Starting...");
    const connection = (0, redis_1.getBullRedis)();
    const schedulerQueue = new bullmq_1.Queue("digest-scheduler", { connection });
    const cronExpression = process.env.DIGEST_CRON ?? "0 6 * * 0";
    await schedulerQueue.upsertJobScheduler("weekly-digest-master", { pattern: cronExpression }, {
        name: "master",
        data: {},
    });
    console.log(`[Digest] Master job scheduled: ${cronExpression}`);
    (0, digest_worker_1.startDigestWorker)();
    const { Worker } = await Promise.resolve().then(() => __importStar(require("bullmq")));
    const schedulerWorker = new Worker("digest-scheduler", async () => {
        await (0, master_1.enqueueCommunityDigests)();
    }, { connection });
    schedulerWorker.on("completed", () => {
        console.log("[Digest] Master job completed — all community jobs enqueued");
    });
    schedulerWorker.on("failed", (_job, err) => {
        console.error("[Digest] Master job failed:", err.message);
    });
    console.log("[Digest] Running — waiting for scheduled master job");
    process.on("SIGTERM", async () => {
        console.log("[Digest] Shutting down...");
        await schedulerQueue.close();
        await schedulerWorker.close();
    });
}
