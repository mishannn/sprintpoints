package poker

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
