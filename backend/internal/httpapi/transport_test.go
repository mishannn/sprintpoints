package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDocsSupportHead(t *testing.T) {
	f := newAPIFixture(t)
	for _, path := range []string{"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"} {
		res := httptest.NewRecorder()
		f.h.Config.Handler.ServeHTTP(res, httptest.NewRequest(http.MethodHead, path, nil))
		if res.Code != 200 || res.Body.Len() != 0 || res.Header().Get("Content-Length") == "" {
			t.Errorf("HEAD %s: %d %q", path, res.Code, res.Body.String())
		}
	}
}
func TestGinHTTPTransport(t *testing.T) {
	f := newAPIFixture(t)
	for _, tc := range []struct {
		method, path string
		status       int
		detail       string
	}{
		{"GET", "/missing", 404, "Not Found"}, {"POST", "/api/health", 405, "Method Not Allowed"}, {"GET", "/openapi.json", 200, ""},
	} {
		status, body := f.request(tc.method, tc.path, nil, nil)
		if status != tc.status || tc.detail != "" && body["detail"] != tc.detail {
			t.Fatalf("%s %s: %d %v", tc.method, tc.path, status, body)
		}
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(f.h.URL + "/api/health/")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 301 && response.StatusCode != 307 {
		t.Fatalf("redirect=%d", response.StatusCode)
	}
	handler := NewServer(f.db, []string{"https://allowed.example"})
	defer handler.Close()
	for _, origin := range []string{"https://allowed.example", "https://denied.example"} {
		req := httptest.NewRequest("OPTIONS", "/api/rooms", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "X-Host-Token")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if origin == "https://allowed.example" {
			if res.Code != 204 || res.Header().Get("Access-Control-Allow-Origin") != origin {
				t.Fatalf("CORS allowed: %d %v", res.Code, res.Header())
			}
		} else if res.Code != 403 {
			t.Fatalf("CORS denied: %d", res.Code)
		}
	}
}
