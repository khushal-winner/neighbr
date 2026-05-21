interface PendingPost {
  postId: string;
  communityId: string;
  type: string;
  title: string;
}

// in-memory accumulator Map<community, PendingPost[]>
// resets after each flush - if the process restarts mid-window, that's window's
// posts are lost but that's acceptable for notification batching
const pending = new Map<string, PendingPost[]>();

export function accumulate(post: PendingPost): void {
  const existing = pending.get(post.communityId) ?? [];
  existing.push(post);
  pending.set(post.communityId, existing);
}

// drain returns and clears the accumulator atomically
// caller processes the snapshot and doesn't race with new incoming posts
export function drain(): Map<string, PendingPost[]> {
  const snapshot = new Map(pending);

  // clear before processing - new events accumulate into the next window
  // while this window is being flushed
  pending.clear();

  return snapshot;
}

export function pendingCount(): number {
  let total = 0;
  for (const posts of pending.values()) {
    total += posts.length;
  }
  return total;
}
