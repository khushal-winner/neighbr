package hub

import (
	"context"
	"fmt"
	"log"
	"time"

	redisclient "github.com/neighbr/gateway/redis"
)

// StartHeartBeat refreshes presence TTLs for all connected users
// runs as a background goroutine for the lifetime of the process
func StartHeartBeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		refreshPresence()
	}

}

func refreshPresence() {
	Global.mu.RLock()
	snapshot := make([]*Client, 0, len(Global.clients))
	for _, c := range Global.clients {
		snapshot = append(snapshot, c)
	}
	Global.mu.RUnlock()

	if len(snapshot) == 0 {
		return
	}

	ctx := context.Background() // this means	, when to use it :
	pipe := redisclient.Client.Pipeline()

	for _, client := range snapshot {
		if client.CommunityID == "" {
			continue
		}
		key := fmt.Sprintf("presence:%s", client.CommunityID)
		pipe.HSet(ctx, key, client.UserID, time.Now().Unix())
		pipe.Expire(ctx, key, 90*time.Second)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("[Heartbeat] Redis pipeline error: %v", err)
	}

}
