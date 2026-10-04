package httpapi

import (
	"net/http"

	"github.com/mishannn/sprintpoints/backend/internal/realtime"

	"gorm.io/gorm"
)

// Server assembles API routes, request transactions, and room notifications.
type Server struct {
	db      *gorm.DB
	mux     *http.ServeMux
	origins []string
	hub     *realtime.Hub
}

func NewServer(db *gorm.DB, origins []string) *Server {
	s := &Server{db: db, mux: http.NewServeMux(), origins: origins, hub: realtime.NewHub()}
	s.routes()
	s.docsRoutes()
	return s
}

// Close releases upgraded connections that HTTP shutdown does not close.
func (s *Server) Close() { s.hub.Close() }
