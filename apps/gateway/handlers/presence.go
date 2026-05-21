package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	redisclient "github.com/neighbr/gateway/redis"
)

// get /presence/:communityId
// returns count of users online in a community right now
// used by the "12 neighbours online" widget in the frontend
func HandlePresence(w http.ResponseWriter, r *http.Request) {
	communityID := r.PathValue("communityId")
	if communityID == "" {
		http.Error(w, "communityId is required", http.StatusBadRequest)
		return
	}

	ctx := context.Background() // this means no timeout
	presenceKey := fmt.Sprintf("presence:%s", communityID)

	// get all userId -> lastSeen pairs for this community
	result, err := redisclient.Client.HGetAll(ctx, presenceKey).Result()
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// count users whose last-seen timestamp is within 30 seconds
	cutoff := time.Now().Unix() - 30
	onlineCount := 0

	for _, val := range result {
		ts, err := strconv.ParseInt(val, 10, 64)
		if err != nil {
			continue
		}
		if ts >= cutoff {
			onlineCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{
		"online": onlineCount,
	})

}
