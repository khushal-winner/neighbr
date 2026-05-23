import { Queue } from "bullmq";
import { getBullRedis } from "./plugins/redis";
import { startDigestWorker } from "./workers/digest.worker";
import { enqueueCommunityDigests } from "./jobs/master";
import type { DigestJobData } from "./workers/digest.worker";

export async function startDigest(): Promise<void> {
  console.log("[Digest] Starting...");

  const connection = getBullRedis();

  const schedulerQueue = new Queue<DigestJobData>("digest-scheduler", { connection });

  const cronExpression = process.env.DIGEST_CRON ?? "0 6 * * 0";

  await schedulerQueue.upsertJobScheduler(
    "weekly-digest-master",
    { pattern: cronExpression },
    {
      name: "master",
      data: {} as DigestJobData,
    },
  );

  console.log(`[Digest] Master job scheduled: ${cronExpression}`);

  startDigestWorker();

  const { Worker } = await import("bullmq");

  const schedulerWorker = new Worker(
    "digest-scheduler",
    async () => {
      await enqueueCommunityDigests();
    },
    { connection },
  );

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
