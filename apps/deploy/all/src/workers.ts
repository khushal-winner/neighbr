import { startFeedConsumer } from "@neighbr/feed/consumers/feed";
import { startAlertConsumer } from "@neighbr/alert/consumers/alert";
import { startTrustConsumer } from "@neighbr/trust/consumers/trust";
import { startNotificationConsumer } from "@neighbr/notification/consumers/notification";
import { startModerationWorker } from "@neighbr/moderation/workers/moderation";
import { startDigest } from "@neighbr/digest/start";

type WorkerStarter = { name: string; start: () => Promise<void> };

const workers: WorkerStarter[] = [
  { name: "feed", start: startFeedConsumer },
  { name: "alert", start: startAlertConsumer },
  { name: "trust", start: startTrustConsumer },
  { name: "notification", start: startNotificationConsumer },
  { name: "moderation", start: startModerationWorker },
  { name: "digest", start: startDigest },
];

export function startBackgroundWorkers(): void {
  console.log("[neighbr-workers] Starting background processes...");

  for (const worker of workers) {
    worker.start().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[neighbr-workers] ${worker.name} failed:`, message);
    });
  }
}
