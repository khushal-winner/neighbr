package hub

import (
	"sync"

	"github.com/gorilla/websocket"
)

// Client represents one connected user
type Client struct {
	UserID      string
	CommunityID string
	Conn        *websocket.Conn
	Send        chan []byte // buffered channel - writer goroutine reads from here
}

// hub holds all active connections on this instance
// sync.RWMutex becuase many goroutines read, few write
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // keyed by userId
}

var Global = &Hub{
	clients: make(map[string]*Client),
}

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.UserID] = client
}

func (h *Hub) Unregister(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if client, ok := h.clients[userID]; ok {
		close(client.Send) // closing the channel signals the writer goroutine to stop
		delete(h.clients, userID)
	}
}

// FindByUser returns a client if connected on this instance
func (h *Hub) FindByUser(userID string) (*Client, bool) {
	h.mu.RLock()         // read lock is enough since we're just reading from the map
	defer h.mu.RUnlock() // release the lock on return

	client, ok := h.clients[userID]
	return client, ok
}

// OnlineCount returns how many users from a community are connected here
func (h *Hub) OnlineCount(communityID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	count := 0
	for _, c := range h.clients {
		if c.CommunityID == communityID {
			count++
		}
	}
	return count
}
