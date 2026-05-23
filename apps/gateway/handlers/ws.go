// When a client connects, this handler:
// Upgrades HTTP → WebSocket
// Reads the first message (must be the JWT auth message)
// Registers the client in the Hub
// Records presence in Redis
// Spawns reader + writer goroutines
// Subscribes to Redis pub/sub channels
// Cleans up everything on disconnect

package handlers 

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
	goredis "github.com/redis/go-redis/v9"

	redisclient "github.com/neighbr/gateway/redis"
	"github.com/neighbr/gateway/hub"
	"github.com/neighbr/gateway/middleware"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize: 1024,
	WriteBufferSize: 1024,
	// in production: validate origin header against allowed domains
	CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        allowed := os.Getenv("FRONTEND_URL")
        if allowed == "" {
            allowed = "http://localhost:3000"
        }
        return origin == allowed
    },

}

// first message the client must send after connecting
type AuthMessage struct {
	Type        string `json:"type"` // must be "auth"
	Token       string `json:"token"`
	CommunityID string `json:"communityId,omitempty"` // fallback when JWT is stale
}

const (
	writeWait = 10 * time.Second	// max time to write a message to the socket
	pongWait = 60 * time.Second		// max time to wait for a pong response
	pingPeriod = 10 * time.Second	// how often to send a ping
)

func HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade error: %v", err)
		return
	}

	// step 1 : authenticate
	// client must send auth message within 10 seconds or we close
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	_, msgBytes, err := conn.ReadMessage()
	if err != nil {
		conn.Close()
		return
	}
	
	var authMsg AuthMessage
	if err := json.Unmarshal(msgBytes, &authMsg); err != nil || authMsg.Type != "auth" {
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "auth message required"))
		conn.Close()
		return
	}

	claims, err := middleware.VerifyToken(authMsg.Token)
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "invalid token"))
		conn.Close()
		return
	}

	communityID := ""
	if claims.CommunityID != nil && *claims.CommunityID != "" {
		communityID = *claims.CommunityID
	} else if authMsg.CommunityID != "" {
		communityID = authMsg.CommunityID
	}

	ctx := context.Background()
	if communityID == "" {
		cached, err := redisclient.Client.Get(ctx, "user:"+claims.Sub+":community").Result()
		if err == nil && cached != "" {
			communityID = cached
		}
	}

	// step 2 : register
	client := &hub.Client{
		UserID: claims.Sub,
		CommunityID: communityID,
		Conn: conn,
		Send: make(chan []byte, 64), // buffered - don't block writer on slow client
	}

	hub.Global.Register(client)
	log.Printf("[WS] client registered: userID=%s, communityID=%s", client.UserID, client.CommunityID)

	// step 3 : record presence in redis (only when user belongs to a community)
	presenceKey := fmt.Sprintf("presence:%s", communityID)
	if communityID != "" {
		redisclient.Client.HSet(ctx, presenceKey, client.UserID, time.Now().Unix())
		redisclient.Client.Expire(ctx, presenceKey, 90*time.Second)
	}

	// step 4 : subscribe to redis pub/sub
	channels := []string{fmt.Sprintf("ws:user:%s", client.UserID)}
	if communityID != "" {
		channels = append(channels, fmt.Sprintf("ws:community:%s", communityID))
	}
	pubsub := redisclient.Client.Subscribe(ctx, channels...)

	// step 5 : spawn go routines
	// reader & write run concurrently - go routines make this trivial
	go writer(client, pubsub)
	reader(client, ctx, pubsub) // reader blocks in this goroutine until disconnect

	// cleanup runs when reader returns (client disconnected)
	hub.Global.Unregister(client.UserID)
	if communityID != "" {
		redisclient.Client.HDel(ctx, presenceKey, client.UserID)
	}
	pubsub.Close()

	log.Printf("[WS] client disconnected: userID=%s, communityID=%s", client.UserID, client.CommunityID)


}

// reader - runs in the handler goroutine
// reads client messages (ping, keepalives, typing, presence) and detects disconnect
func reader(client *hub.Client, ctx context.Context, pubsub *goredis.PubSub) {
	defer client.Conn.Close()

	client.Conn.SetReadDeadline(time.Now().Add(pongWait))
	// reset deadline every time client sends a pong
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msgBytes, err := client.Conn.ReadMessage()
		if err != nil {
			// websocket.IsUnexpectedCloseError catches app closed and network dropped
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[WS] unexpected close for user=%s: %v", client.UserID, err)
			}
			return
		}

		var msg struct {
			Type        string `json:"type"`
			RecipientID string `json:"recipientId"`
			IsTyping    bool   `json:"isTyping"`
		}

		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		if msg.Type == "typing" {
			event := map[string]interface{}{
				"type":        "user_typing",
				"senderId":    client.UserID,
				"recipientId": msg.RecipientID,
				"isTyping":    msg.IsTyping,
			}
			eventBytes, _ := json.Marshal(event)
			redisclient.Client.Publish(ctx, fmt.Sprintf("ws:user:%s", msg.RecipientID), eventBytes)
		} else if msg.Type == "presence_check" {
			keys, err := redisclient.Client.Keys(ctx, "presence:*").Result()
			isOnline := false
			if err == nil {
				for _, key := range keys {
					exists, err := redisclient.Client.HExists(ctx, key, msg.RecipientID).Result()
					if err == nil && exists {
						isOnline = true
						break
					}
				}
			}
			response := map[string]interface{}{
				"type":   "presence_response",
				"userId": msg.RecipientID,
				"online": isOnline,
			}
			respBytes, _ := json.Marshal(response)
			select {
			case client.Send <- respBytes:
			default:
				log.Printf("[WS] Send channel full for user=%s", client.UserID)
			}
		}
	}
}

// writer - runs in its own goroutine
// forwards redis pub/sub messages and gateway pings to the socket
func writer(client *hub.Client, pubsub *goredis.PubSub) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	ch := pubsub.Channel()

	for {
		select {
		case msg, ok := <-ch:
			// Redis pub/sub delivered a message
			if !ok {
				return   // pubsub closed, stop writer
			}

			client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.Conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				return   // write failed — client likely disconnected
			}

		case data, ok := <-client.Send:
			// direct messages from Hub (including presence responses)
			if !ok {
				// Hub closed the channel — unregister was called
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}

		case <-ticker.C:
			// send ping to keep connection alive and detect silent disconnects
			client.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
