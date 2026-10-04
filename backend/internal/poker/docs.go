package poker

import (
	"embed"
	"net/http"
	"strconv"
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
		handler := func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", mime)
			w.Header().Set("Content-Length", strconv.Itoa(len(data)))
			if r.Method == http.MethodHead {
				return
			}
			_, _ = w.Write(data)
		}
		s.mux.HandleFunc("GET "+path, handler)
		s.mux.HandleFunc("HEAD "+path, handler)
	}
}
