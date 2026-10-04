package poker

import (
	"embed"
	"net/http"
)

// The API description is the compatibility contract exported from the original
// FastAPI application. Keep it in sync when deliberately changing the API.
//
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
		s.mux.HandleFunc("GET "+path, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", mime)
			_, _ = w.Write(data)
		})
	}
}
