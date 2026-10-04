package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDocsSupportHead(t *testing.T) {
	f := newAPIFixture(t)
	for _, path := range []string{"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"} {
		req := httptest.NewRequest(http.MethodHead, path, nil)
		res := httptest.NewRecorder()
		f.h.Config.Handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK || res.Body.Len() != 0 || res.Header().Get("Content-Length") == "" {
			t.Errorf("HEAD %s: status=%d body=%d content-length=%q", path, res.Code, res.Body.Len(), res.Header().Get("Content-Length"))
		}
	}
}

func TestSlashRedirectIsAbsoluteAndUsesTrustedForwardedScheme(t *testing.T) {
	f := newAPIFixture(t)
	req := httptest.NewRequest(http.MethodPost, "http://example.test/api/health/?check=1", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("X-Forwarded-Proto", "https")
	res := httptest.NewRecorder()
	f.h.Config.Handler.ServeHTTP(res, req)
	if res.Code != http.StatusTemporaryRedirect {
		t.Fatalf("status=%d want 307", res.Code)
	}
	if res.Body.Len() != 0 || res.Header().Get("Content-Length") != "0" {
		t.Fatalf("redirect body=%q content-length=%q", res.Body.String(), res.Header().Get("Content-Length"))
	}
	if got, want := res.Header().Get("Location"), "https://example.test/api/health?check=1"; got != want {
		t.Fatalf("Location=%q want %q", got, want)
	}
}

func TestDisallowedSimpleCorsRequestDoesNotVary(t *testing.T) {
	f := newAPIFixture(t)
	handler := NewServer(f.db, []string{"https://allowed.example"})
	defer handler.Close()
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://denied.example")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Header().Get("Vary") != "" {
		t.Fatalf("status=%d Vary=%q", res.Code, res.Header().Get("Vary"))
	}
}

func TestHTTPTransportContract(t *testing.T) {
	f := newAPIFixture(t)
	for _, tc := range []struct {
		method, path string
		status       int
		detail       string
	}{
		{"GET", "/missing", 404, "Not Found"},
		{"POST", "/api/health", 405, "Method Not Allowed"},
		{"GET", "/openapi.json", 200, ""},
	} {
		status, body := f.request(tc.method, tc.path, nil, nil)
		if status != tc.status || (tc.detail != "" && body["detail"] != tc.detail) {
			t.Fatalf("%s %s: %d %v", tc.method, tc.path, status, body)
		}
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(f.h.URL + "/api/health/")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 307 || response.Header.Get("Location") != f.h.URL+"/api/health" {
		t.Fatalf("slash redirect: %d %s", response.StatusCode, response.Header.Get("Location"))
	}
	handler := NewServer(f.db, []string{"https://allowed.example"})
	defer handler.Close()
	for _, origin := range []string{"https://allowed.example", "https://denied.example"} {
		req := httptest.NewRequest("OPTIONS", "/api/rooms", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "X-Host-Token")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if origin == "https://allowed.example" {
			if response.Code != 200 || response.Header().Get("Access-Control-Allow-Origin") != origin || response.Header().Get("Access-Control-Allow-Headers") != "X-Host-Token" {
				t.Fatalf("CORS preflight: %v", response)
			}
		} else if response.Code != 400 || response.Body.String() != "Disallowed CORS origin" {
			t.Fatalf("CORS rejection: %v", response)
		}
	}
}
