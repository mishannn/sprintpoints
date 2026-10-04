package httpapi

import (
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/realtime"
)

// Server assembles API routes, request transactions, and room notifications.
type Server struct {
	db     *gorm.DB
	router *gin.Engine
	hub    *realtime.Hub
}

func NewServer(db *gorm.DB, origins []string) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	// Recovery must not dump requests containing private participant/host headers.
	router.Use(gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, recovered any) {
		if e, ok := recovered.(apiError); ok {
			c.JSON(e.status, gin.H{"detail": e.detail})
			return
		}
		log.Print("internal request failure")
		c.String(http.StatusInternalServerError, "Internal Server Error")
	}))
	config := cors.Config{
		AllowOrigins: origins,
		AllowMethods: []string{"GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "X-Host-Token", "X-Participant-Token"},
		MaxAge:       10 * time.Minute,
	}
	if len(origins) == 0 {
		config.AllowOriginFunc = func(string) bool { return false }
	}
	router.Use(cors.New(config))
	router.HandleMethodNotAllowed = true
	router.NoRoute(func(c *gin.Context) { c.JSON(404, gin.H{"detail": "Not Found"}) })
	router.NoMethod(func(c *gin.Context) { c.JSON(405, gin.H{"detail": "Method Not Allowed"}) })
	s := &Server{db: db, router: router, hub: realtime.NewHub()}
	s.routes()
	s.docsRoutes()
	return s
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.router.ServeHTTP(w, r) }
func (s *Server) Close()                                           { s.hub.Close() }
