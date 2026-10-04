// Package realtime provides process-local room websocket fanout.
package realtime

import (
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Hub owns websocket connections grouped by room.
type Hub struct {
	mu      sync.Mutex
	sockets map[string]map[*websocket.Conn]bool
}

// NewHub creates an empty connection hub.
func NewHub() *Hub {
	return &Hub{sockets: make(map[string]map[*websocket.Conn]bool)}
}

// Serve upgrades a request and registers an authorized connection. authorize
// runs while registration is serialized with broadcasts and shutdown, so an
// update cannot slip between authorization and subscription.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, roomID string, authorize func() bool) {
	h.mu.Lock()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.mu.Unlock()
		return
	}
	if authorize == nil || !authorize() {
		h.mu.Unlock()
		_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(1008, ""), time.Now().Add(time.Second))
		_ = conn.Close()
		return
	}
	if h.sockets[roomID] == nil {
		h.sockets[roomID] = make(map[*websocket.Conn]bool)
	}
	h.sockets[roomID][conn] = true
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.sockets[roomID], conn)
		if len(h.sockets[roomID]) == 0 {
			delete(h.sockets, roomID)
		}
		h.mu.Unlock()
		_ = conn.Close()
	}()
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// Broadcast sends the room-updated event to every connected client in a room.
func (h *Hub) Broadcast(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.sockets[roomID] {
		_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
		if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"room_updated"}`)); err != nil {
			delete(h.sockets[roomID], conn)
			_ = conn.Close()
		}
	}
	if len(h.sockets[roomID]) == 0 {
		delete(h.sockets, roomID)
	}
}

// Close releases upgraded connections, which http.Server.Shutdown does not close.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, connections := range h.sockets {
		for conn := range connections {
			_ = conn.Close()
		}
	}
	h.sockets = make(map[string]map[*websocket.Conn]bool)
}
