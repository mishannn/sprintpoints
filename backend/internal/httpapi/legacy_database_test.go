package httpapi

import (
	"embed"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
	"github.com/mishannn/sprintpoints/backend/internal/storage"
)

// legacyPythonSQL is a frozen dump from the Python API's SQLite database after
// room creation, member join, and vote submission.
//
//go:embed testdata/legacy_python.sql
var legacyPythonSQL embed.FS

const (
	legacyRoomID      = "11111111-1111-4111-8111-111111111111"
	legacyOwnerID     = "22222222-2222-4222-8222-222222222222"
	legacyMemberID    = "33333333-3333-4333-8333-333333333333"
	legacyIssueID     = "44444444-4444-4444-8444-444444444444"
	legacyRoomCode    = "LEGACY"
	legacyHostToken   = "legacy-host-token"
	legacyMemberToken = "legacy-member-token"
	legacyOwnerToken  = "legacy-owner-token"
)

func TestPersistedDatabasePreservesAPIState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy-python.sqlite")
	seed, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	dump, err := legacyPythonSQL.ReadFile("testdata/legacy_python.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := seed.Exec(string(dump)).Error; err != nil {
		t.Fatalf("restore frozen Python SQL dump: %v", err)
	}
	seedSQL, err := seed.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := seedSQL.Close(); err != nil {
		t.Fatal(err)
	}

	db, err := storage.OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatalf("open Python-created database: %v", err)
	}
	assertLegacyPythonState(t, db)
	assertLegacyPythonAPI(t, db)
	closeLegacyTestDB(t, db)

	// Reopen the prepared database and check the same records
	// through a fresh HTTP handler.
	reopened, err := storage.OpenDatabase(sqliteURL(path))
	if err != nil {
		t.Fatalf("reopen Python-created database: %v", err)
	}
	assertLegacyPythonState(t, reopened)
	assertLegacyPythonAPI(t, reopened)
	closeLegacyTestDB(t, reopened)
}

func assertLegacyPythonState(t *testing.T, db *gorm.DB) {
	t.Helper()
	var room domain.Room
	if err := db.First(&room, "id = ?", legacyRoomID).Error; err != nil {
		t.Fatal(err)
	}
	if room.Code != legacyRoomCode || room.Name != "Cross-version" || room.HostToken != legacyHostToken || room.OwnerID == nil || *room.OwnerID != legacyOwnerID {
		t.Fatalf("restored room mismatch: %#v", room)
	}
	var members []domain.Participant
	if err := db.Where("room_id = ?", legacyRoomID).Order("name").Find(&members).Error; err != nil {
		t.Fatal(err)
	}
	if len(members) != 2 || members[0].ID != legacyOwnerID || members[0].Token != legacyOwnerToken || members[1].ID != legacyMemberID || members[1].Token != legacyMemberToken {
		t.Fatalf("restored participants mismatch: %#v", members)
	}
	var issue domain.Issue
	if err := db.First(&issue, "id = ?", legacyIssueID).Error; err != nil || issue.Title != "Persisted issue" {
		t.Fatalf("restored issue mismatch: %#v, err=%v", issue, err)
	}
	var votes []domain.Vote
	if err := db.Where("room_id = ?", legacyRoomID).Find(&votes).Error; err != nil || len(votes) != 1 || votes[0].Value != "13" || votes[0].ParticipantID != legacyMemberID || votes[0].IssueID != legacyIssueID {
		t.Fatalf("restored votes mismatch: %#v, err=%v", votes, err)
	}
}

func assertLegacyPythonAPI(t *testing.T, db *gorm.DB) {
	t.Helper()
	handler := NewServer(db, []string{"*"})
	defer handler.Close()
	h := httptest.NewServer(handler)
	defer h.Close()

	request := func(headers map[string]string) (int, map[string]any) {
		req, err := http.NewRequest(http.MethodGet, h.URL+"/api/rooms/"+legacyRoomCode, nil)
		if err != nil {
			t.Fatal(err)
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode, body
	}

	status, memberView := request(map[string]string{"X-Participant-Token": legacyMemberToken})
	if status != http.StatusOK {
		t.Fatalf("participant view status=%d body=%v", status, memberView)
	}
	room := memberView["room"].(map[string]any)
	if room["id"] != legacyRoomID || room["name"] != "Cross-version" || room["host_token"] != "" {
		t.Fatalf("participant room view leaks or loses fields: %v", room)
	}
	issues := memberView["issues"].([]any)
	if len(issues) != 1 || issues[0].(map[string]any)["title"] != "Persisted issue" {
		t.Fatalf("participant issue view mismatch: %v", issues)
	}
	participants := memberView["participants"].([]any)
	if len(participants) != 2 {
		t.Fatalf("participant view has %d participants", len(participants))
	}
	for _, raw := range participants {
		p := raw.(map[string]any)
		if p["id"] == legacyMemberID {
			if p["token"] != legacyMemberToken {
				t.Fatalf("member token was not restored: %v", p["token"])
			}
		} else if p["token"] != "" {
			t.Fatalf("unrelated member token leaked: %v", p["token"])
		}
	}
	votes := memberView["votes"].([]any)
	if len(votes) != 1 || votes[0].(map[string]any)["value"] != "13" {
		t.Fatalf("participant vote view mismatch: %v", votes)
	}

	status, hostView := request(map[string]string{"X-Host-Token": legacyHostToken})
	if status != http.StatusOK || hostView["room"].(map[string]any)["host_token"] != legacyHostToken {
		t.Fatalf("host credentials were not accepted after restore: status=%d body=%v", status, hostView)
	}
}

func closeLegacyTestDB(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
}
