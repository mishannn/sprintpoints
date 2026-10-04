package httpapi

import (
	"bytes"
	"embed"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

//go:embed docs/*
var apiDocs embed.FS

func (s *Server) docsRoutes() {
	for path, file := range map[string]string{"/openapi.json": "openapi.json", "/docs": "swagger.html", "/redoc": "redoc.html", "/docs/oauth2-redirect": "oauth2.html"} {
		data, err := apiDocs.ReadFile("docs/" + file)
		if err != nil {
			panic(err)
		}
		mime := "text/html; charset=utf-8"
		if file == "openapi.json" {
			mime = "application/json"
		}
		handler := func(c *gin.Context) {
			c.Header("Content-Type", mime)
			http.ServeContent(c.Writer, c.Request, file, time.Time{}, bytes.NewReader(data))
		}
		s.router.GET(path, handler)
		s.router.HEAD(path, handler)
	}
}
