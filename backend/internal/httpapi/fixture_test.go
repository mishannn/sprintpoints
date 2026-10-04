package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mishannn/sprintpoints/backend/internal/storage"

	"gorm.io/gorm"
)

type apiFixture struct {
	t  *testing.T
	db *gorm.DB
	h  *httptest.Server
}

func newAPIFixture(t *testing.T) *apiFixture {
	t.Helper()
	databaseURL := sqliteURL(filepath.Join(t.TempDir(), "api.db"))
	if base := os.Getenv("TEST_POSTGRES_URL"); base != "" {
		admin, err := gorm.Open(postgresDialector(base), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { closeDatabase(admin) })
		schema := fmt.Sprintf("poker_api_%d", time.Now().UnixNano())
		if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
				t.Error(err)
			}
		})
		databaseURL, err = postgresSchemaURL(base, schema)
		if err != nil {
			t.Fatal(err)
		}
	}
	db, err := storage.OpenDatabase(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	handler := NewServer(db, []string{"*"})
	t.Cleanup(handler.Close)
	h := httptest.NewServer(handler)
	t.Cleanup(h.Close)
	return &apiFixture{t: t, db: db, h: h}
}

func (f *apiFixture) request(method, path string, body any, headers map[string]string) (int, map[string]any) {
	f.t.Helper()
	var data io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			f.t.Fatal(err)
		}
		data = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, f.h.URL+path, data)
	if err != nil {
		f.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	if resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil && err != io.EOF {
			f.t.Fatalf("decode %s %s response: %v", method, path, err)
		}
	}
	return resp.StatusCode, out
}

func (f *apiFixture) createRoom() (map[string]any, map[string]any) {
	f.t.Helper()
	status, result := f.request(http.MethodPost, "/api/rooms", map[string]any{
		"roomName": "Planning", "participantName": "Host",
		"defaults": map[string]any{"facilitatorName": "Facilitator", "firstStoryTitle": "First story", "roomName": "Default"},
	}, nil)
	if status != http.StatusCreated {
		f.t.Fatalf("create room status=%d body=%v", status, result)
	}
	return result, result["state"].(map[string]any)
}

func (f *apiFixture) addMember(code string) map[string]any {
	f.t.Helper()
	status, result := f.request(http.MethodPost, "/api/rooms/"+code+"/join", map[string]any{"name": "Member", "isSpectator": false}, nil)
	if status != http.StatusCreated {
		f.t.Fatalf("join room status=%d body=%v", status, result)
	}
	return result
}
