import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

let initialized = false;

export function getFirebase(): admin.app.App {
  if (!initialized) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH not set");
    }
    const resolved = path.resolve(serviceAccountPath);
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log("[Firebase] initialized");
  }
  return admin.app();
}

// send to multiple FCM tokens in one batch call
// firebase handles up to 500 tokens per batch
export async function sendMulticast(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;

  getFirebase();

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title,
      body,
    },
    data: data ?? {},
    android: {
      priority: "high",
      notification: { sound: "default" },
    },
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  console.log(
    `[Firebase] Sent : ${response.successCount} success, ${response.failureCount} failure`,
  );

  // log failed token - in production you'd remove stale from DB
  response.responses.forEach((res, i) => {
    if (!res.success) {
      console.warn(
        `[Firebase] token ${tokens[i]} failed: ${res.error?.message}`,
      );
    }
  });
}
