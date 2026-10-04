package httpapi

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
	"github.com/mishannn/sprintpoints/backend/internal/validation"

	"gorm.io/gorm"
)

// request holds one transaction and the room to notify after it commits.
type request struct {
	tx          *gorm.DB
	httpRequest *http.Request
	data        map[string]any
	notify      string
}

func (q *request) path(name string) string  { return q.httpRequest.PathValue(name) }
func (q *request) hostToken() string        { return q.httpRequest.Header.Get("X-Host-Token") }
func (q *request) participantToken() string { return q.httpRequest.Header.Get("X-Participant-Token") }
func (q *request) string(key string) string { return stringValue(q.data, key) }
func (q *request) saveRoom(r *domain.Room)  { r.UpdatedAt = nowUTC(); must(q.tx.Save(r).Error) }
func (q *request) notifyRoom(id string)     { q.notify = id }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if status != 204 {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func (s *Server) route(pattern string, status int, fields []validation.Field, fn func(*request) any) {
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if e := recover(); e != nil {
				if a, ok := e.(apiError); ok {
					writeJSON(w, a.status, map[string]any{"detail": a.detail})
				} else {
					log.Printf("request failed: %v", e)
					w.Header().Set("Content-Type", "text/plain; charset=utf-8")
					w.WriteHeader(http.StatusInternalServerError)
					_, _ = w.Write([]byte("Internal Server Error"))
				}
			}
		}()
		q := &request{httpRequest: r}
		if fields != nil {
			var err error
			q.data, err = validation.Parse(r, fields)
			if err != nil {
				panic(apiError{422, err.(*validation.Error).Detail})
			}
		}
		var result any
		// A handler failure rolls back its writes before the recovery above responds.
		err := s.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
			q.tx = tx
			result = fn(q)
			return nil
		})
		must(err)
		writeJSON(w, status, result)
		// Subscribers must observe committed data when reacting to this event.
		if q.notify != "" {
			s.hub.Broadcast(q.notify)
		}
	})
}

func stringValue(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return value
}

func nullableValue(data map[string]any, key string) *string {
	if data[key] == nil {
		return nil
	}
	return stringPointer(data[key].(string))
}
