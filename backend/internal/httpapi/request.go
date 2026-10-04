package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

// request holds one transaction and the room to notify after it commits.
type request struct {
	tx      *gorm.DB
	context *gin.Context
	notify  string
}

func (q *request) path(name string) string  { return q.context.Param(name) }
func (q *request) hostToken() string        { return q.context.GetHeader("X-Host-Token") }
func (q *request) participantToken() string { return q.context.GetHeader("X-Participant-Token") }
func (q *request) bind(value any) {
	if err := q.context.ShouldBindJSON(value); err != nil {
		fail(http.StatusUnprocessableEntity, err.Error())
	}
}
func (q *request) saveRoom(r *domain.Room) { r.UpdatedAt = nowUTC(); must(q.tx.Save(r).Error) }
func (q *request) notifyRoom(id string)    { q.notify = id }
func (s *Server) route(method, path string, status int, fn func(*request) any) {
	s.router.Handle(method, path, func(c *gin.Context) {
		q := &request{context: c}
		var result any
		err := s.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			q.tx = tx
			result = fn(q)
			return nil
		})
		must(err)
		if status == http.StatusNoContent {
			c.Status(status)
		} else {
			c.JSON(status, result)
		}
		if q.notify != "" {
			s.hub.Broadcast(q.notify)
		}
	})
}
