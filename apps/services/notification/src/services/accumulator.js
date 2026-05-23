"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accumulate = accumulate;
exports.drain = drain;
exports.pendingCount = pendingCount;
// in-memory accumulator Map<community, PendingPost[]>
// resets after each flush - if the process restarts mid-window, that's window's
// posts are lost but that's acceptable for notification batching
const pending = new Map();
function accumulate(post) {
    const existing = pending.get(post.communityId) ?? [];
    existing.push(post);
    pending.set(post.communityId, existing);
}
// drain returns and clears the accumulator atomically
// caller processes the snapshot and doesn't race with new incoming posts
function drain() {
    const snapshot = new Map(pending);
    // clear before processing - new events accumulate into the next window
    // while this window is being flushed
    pending.clear();
    return snapshot;
}
function pendingCount() {
    let total = 0;
    for (const posts of pending.values()) {
        total += posts.length;
    }
    return total;
}
