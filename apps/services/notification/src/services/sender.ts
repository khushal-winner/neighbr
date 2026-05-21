import { sendMulticast } from "../plugins/firebase";
import prisma from "../plugins/prisma";
import { getRedis } from "../plugins/redis";

interface PendingPost {
  postId: string;
  communityId: string;
  type: string;
  title: string;
}

// fetch FCM tokens for users in a community, excluding online and emergencyOnly users
async function getTokensForCommunity(
  communityId: string,
  excludeUserIds: string[],
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      communityId,
      id: excludeUserIds.length > 0 ? { notIn: excludeUserIds } : undefined,
      verificationLevel: { not: "unverified" },
    },
    select: {
      id: true,
      notificationPrefs: true,
      fcmTokens: {
        select: { token: true },
      },
    },
  });

  const tokens: string[] = [];

  for (const user of users) {
    const prefs = user.notificationPrefs as Record<string, boolean> | null;

    // emergencyOnly users only get emergency alerts, skip batch notifications
    if (prefs?.emergencyOnly === true) continue;

    // pushAlerts explicitly disables - respect the preference
    if (prefs?.pushAlerts === false) continue;

    for (const fcm of user.fcmTokens) {
      tokens.push(fcm.token);
    }
  }

  return tokens;
}

// send immediate notification for emergency posts - bypasses windowing
export async function sendEmergencyNotification(
  post: PendingPost,
): Promise<void> {
  console.log(`[Notification] Emergency: ${post.postId}`);

  const tokens = await getTokensForCommunity(post.communityId, []);

  if (tokens.length === 0) return;

  await sendMulticast(tokens, "🚨 Emergency Alert", post.title, {
    type: "emergency",
    postId: post.postId,
    communityId: post.communityId,
  });
}

// flush one community's accumulated posts as a single batched notification
export async function flushCommunity(
  communityId: string,
  posts: PendingPost[],
): Promise<void> {
  if (posts.length === 0) return;

  console.log(
    `[Notification] Flushing ${posts.length} posts for community ${communityId}`,
  );

  // get IDs of users currently online - they don't need a push notification
  // they are already saw the posts in their live feed via websocket
  const redis = getRedis();
  const presenceKey = `presence:${communityId}`;
  const onlineMap = (await redis.hgetall(presenceKey)) as Record<
    string,
    string
  > | null;

  const cutoff = Date.now() / 1000 - 30; // online = active in last 30s
  const onlineUserIds = new Set(
    Object.entries(onlineMap ?? {})
      .filter(([, ts]) => parseInt(ts as string, 10) > cutoff)
      .map(([userId]) => userId),
  );

  // fetch FCM tokens for offline users in this community
  // also respect emergencyOnly preference - these users only want emergency pushes
  const tokens = await getTokensForCommunity(communityId, [...onlineUserIds]);

  if (tokens.length === 0) {
    console.log(`[Notification] No offline users to notify in ${communityId}`);
    return;
  }

  // build a human-readable summary
  const title =
    posts.length === 1
      ? "1 new post on your street"
      : `${posts.length} new posts on your street`;

  // show the first post title as a preview
  const body =
    posts.length > 1
      ? posts[0].title + ` and ${posts.length - 1} more`
      : posts[0].title;

  await sendMulticast(tokens, title, body, {
    type: "batch",
    communityId,
    count: String(posts.length),
  });
}
