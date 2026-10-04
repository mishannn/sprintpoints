package poker

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// Server keeps notifications local to this process, as did the Python backend.
type Server struct {
	db      *gorm.DB
	mux     *http.ServeMux
	origins []string
	mu      sync.Mutex
	sockets map[string]map[*websocket.Conn]bool
}
type request struct {
	db     *gorm.DB
	r      *http.Request
	data   map[string]any
	notify string
}

func (q *request) id(name string) string { return q.r.PathValue(name) }
func (q *request) ht() string            { return q.r.Header.Get("X-Host-Token") }
func (q *request) pt() string            { return q.r.Header.Get("X-Participant-Token") }
func (q *request) s(key string) string   { return stringValue(q.data, key) }
func (q *request) touch(r *Room)         { r.UpdatedAt = timestamp(); must(q.db.Save(r).Error) }
func (q *request) changed(id string)     { q.notify = id }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if status != 204 {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func (s *Server) route(pattern string, status int, fields []field, fn func(*request) any) {
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if e := recover(); e != nil {
				if a, ok := e.(apiError); ok {
					writeJSON(w, a.status, map[string]any{"detail": a.detail})
				} else {
					log.Printf("request failed: %v", e)
					writeJSON(w, 500, map[string]any{"detail": "Internal Server Error"})
				}
			}
		}()
		q := &request{r: r}
		if fields != nil {
			q.data = payload(r, fields)
		}
		var result any
		err := s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error { q.db = tx; result = fn(q); return nil })
		must(err)
		writeJSON(w, status, result)
		if q.notify != "" {
			s.broadcast(q.notify)
		}
	})
}

func NewServer(db *gorm.DB, origins []string) *Server {
	s := &Server{db: db, mux: http.NewServeMux(), origins: origins, sockets: make(map[string]map[*websocket.Conn]bool)}
	s.routes()
	s.docsRoutes()
	return s
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	allowed := false
	wildcard := false
	for _, o := range s.origins {
		if o == "*" {
			allowed = true
			wildcard = true
		}
		if o == origin {
			allowed = true
		}
	}
	if origin != "" {
		if !wildcard {
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == "OPTIONS" && r.Header.Get("Access-Control-Request-Method") != "" {
			w.Header().Set("Access-Control-Allow-Methods", "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT")
			w.Header().Set("Access-Control-Max-Age", "600")
			if h := r.Header.Get("Access-Control-Request-Headers"); h != "" {
				w.Header().Set("Access-Control-Allow-Headers", h)
			}
			if allowed {
				if wildcard {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
				}
			}
			methodOK := false
			for _, m := range []string{"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"} {
				if m == r.Header.Get("Access-Control-Request-Method") {
					methodOK = true
				}
			}
			if !allowed || !methodOK {
				w.WriteHeader(400)
				failures := []string{}
				if !allowed {
					failures = append(failures, "origin")
				}
				if !methodOK {
					failures = append(failures, "method")
				}
				_, _ = w.Write([]byte("Disallowed CORS " + strings.Join(failures, ", ")))
			} else {
				_, _ = w.Write([]byte("OK"))
			}
			return
		}
		if allowed {
			if wildcard && r.Header.Get("Cookie") == "" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				if wildcard {
					w.Header().Add("Vary", "Origin")
				}
			}
		}
	}
	// Preserve FastAPI's JSON 404/405 responses and method-preserving slash redirects.
	_, pattern := s.mux.Handler(r)
	if pattern == "" && r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
		clone := r.Clone(r.Context())
		clone.URL.Path = strings.TrimSuffix(r.URL.Path, "/")
		if _, matched := s.mux.Handler(clone); matched != "" {
			http.Redirect(w, r, clone.URL.String(), http.StatusTemporaryRedirect)
			return
		}
	}
	if pattern == "" || (r.Method == "HEAD" && strings.HasPrefix(pattern, "GET ")) {
		allowed := []string{}
		for _, method := range []string{"GET", "POST", "PATCH", "PUT", "DELETE"} {
			clone := r.Clone(r.Context())
			clone.Method = method
			if _, matched := s.mux.Handler(clone); matched != "" {
				allowed = append(allowed, method)
			}
		}
		if len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			writeJSON(w, 405, map[string]any{"detail": "Method Not Allowed"})
		} else {
			writeJSON(w, 404, map[string]any{"detail": "Not Found"})
		}
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	// Keep the membership check and registration together so a newly subscribed
	// client cannot miss an update between successful handshake and registration.
	s.mu.Lock()
	upgrade := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := upgrade.Upgrade(w, r, nil)
	if err != nil {
		s.mu.Unlock()
		return
	}
	authorized := func() (ok bool) {
		defer func() {
			if recover() != nil {
				ok = false
			}
		}()
		room := getRoom(s.db, r.PathValue("room"))
		member(s.db, room, r.URL.Query().Get("participantToken"), r.URL.Query().Get("hostToken"))
		return true
	}()
	if !authorized {
		s.mu.Unlock()
		_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(1008, ""), time.Now().Add(time.Second))
		_ = conn.Close()
		return
	}
	id := r.PathValue("room")
	if s.sockets[id] == nil {
		s.sockets[id] = map[*websocket.Conn]bool{}
	}
	s.sockets[id][conn] = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.sockets[id], conn)
		if len(s.sockets[id]) == 0 {
			delete(s.sockets, id)
		}
		s.mu.Unlock()
		_ = conn.Close()
	}()
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
func (s *Server) broadcast(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for conn := range s.sockets[id] {
		_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
		if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"room_updated"}`)); err != nil {
			delete(s.sockets[id], conn)
			_ = conn.Close()
		}
	}
	if len(s.sockets[id]) == 0 {
		delete(s.sockets, id)
	}
}

// Close releases upgraded connections, which http.Server.Shutdown does not close.
func (s *Server) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, connections := range s.sockets {
		for conn := range connections {
			_ = conn.Close()
		}
	}
	s.sockets = make(map[string]map[*websocket.Conn]bool)
}
