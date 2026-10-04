package poker

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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
	db, err := OpenDatabase(databaseURL)
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

func TestRoomAuthPrivacyAndOwnershipTransfer(t *testing.T) {
	f := newAPIFixture(t)
	created, state := f.createRoom()
	room := state["room"].(map[string]any)
	roomID, code := room["id"].(string), room["code"].(string)
	hostToken := created["hostToken"].(string)
	member := f.addMember(code)
	memberID := member["participant"].(map[string]any)["id"].(string)
	memberToken := member["participantToken"].(string)

	status, hidden := f.request(http.MethodGet, "/api/rooms/"+code, nil, map[string]string{"X-Participant-Token": memberToken})
	if status != http.StatusOK {
		t.Fatalf("member state status=%d body=%v", status, hidden)
	}
	if hidden["room"].(map[string]any)["host_token"] != "" {
		t.Fatal("non-owner member received host token")
	}
	participants := hidden["participants"].([]any)
	for _, raw := range participants {
		p := raw.(map[string]any)
		if p["id"] != memberID && p["token"] != "" {
			t.Fatalf("participant token leaked in state: %v", p)
		}
	}

	status, _ = f.request(http.MethodPost, "/api/rooms/"+roomID+"/transfer-ownership", map[string]any{"participantId": memberID}, map[string]string{"X-Host-Token": hostToken})
	if status != http.StatusNoContent {
		t.Fatalf("transfer status=%d", status)
	}
	status, newState := f.request(http.MethodGet, "/api/rooms/"+code, nil, map[string]string{"X-Participant-Token": memberToken})
	if status != http.StatusOK {
		t.Fatalf("new owner state status=%d", status)
	}
	newHost := newState["room"].(map[string]any)["host_token"].(string)
	if newHost == "" || newHost == hostToken {
		t.Fatalf("host token was not rotated: old=%q new=%q", hostToken, newHost)
	}
	status, _ = f.request(http.MethodPost, "/api/rooms/"+roomID+"/issues", map[string]any{"title": "stale", "description": "", "link": ""}, map[string]string{"X-Host-Token": hostToken})
	if status != http.StatusForbidden {
		t.Fatalf("stale host token status=%d, want 403", status)
	}
	status, _ = f.request(http.MethodPost, "/api/rooms/"+roomID+"/issues", map[string]any{"title": "new owner", "description": "", "link": ""}, map[string]string{"X-Host-Token": newHost})
	if status != http.StatusCreated {
		t.Fatalf("rotated host token status=%d, want 201", status)
	}
}

func TestRoomUpdateWebSocketNotifiesAfterCommit(t *testing.T) {
	f := newAPIFixture(t)
	created, state := f.createRoom()
	room := state["room"].(map[string]any)
	roomID, code := room["id"].(string), room["code"].(string)
	wsURL := "ws" + strings.TrimPrefix(f.h.URL, "http") + "/api/rooms/" + roomID + "/ws?participantToken=" + created["participantToken"].(string)
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	status, _ := f.request(http.MethodPost, "/api/rooms/"+roomID+"/issues", map[string]any{"title": "Pushed", "description": "", "link": ""}, map[string]string{"X-Host-Token": created["hostToken"].(string)})
	if status != http.StatusCreated {
		t.Fatalf("create issue status=%d", status)
	}
	_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
	var message map[string]any
	if err := ws.ReadJSON(&message); err != nil {
		t.Fatal(err)
	}
	if message["type"] != "room_updated" {
		t.Fatalf("unexpected websocket event: %v", message)
	}
	status, loaded := f.request(http.MethodGet, "/api/rooms/"+code, nil, map[string]string{"X-Participant-Token": created["participantToken"].(string)})
	if status != http.StatusOK {
		t.Fatalf("reload status=%d", status)
	}
	found := false
	for _, raw := range loaded["issues"].([]any) {
		if raw.(map[string]any)["title"] == "Pushed" {
			found = true
		}
	}
	if !found {
		t.Fatal("websocket notification arrived before committed issue was readable")
	}
}

func TestWebSocketRejectsNonMemberWithPolicyClose(t *testing.T) {
	f := newAPIFixture(t)
	_, firstState := f.createRoom()
	_, otherState := f.createRoom()
	roomID := firstState["room"].(map[string]any)["id"].(string)
	foreignToken := otherState["participants"].([]any)[0].(map[string]any)["token"].(string)
	wsURL := "ws" + strings.TrimPrefix(f.h.URL, "http") + "/api/rooms/" + roomID + "/ws?participantToken=" + foreignToken
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	_, _, err = ws.ReadMessage()
	closeErr, ok := err.(*websocket.CloseError)
	if !ok || closeErr.Code != websocket.ClosePolicyViolation {
		t.Fatalf("invalid member websocket close=%v, want code 1008", err)
	}
}

func TestVoteUpsertResetAndSpectatorRemoval(t *testing.T) {
	f := newAPIFixture(t)
	created, state := f.createRoom()
	room := state["room"].(map[string]any)
	roomID := room["id"].(string)
	issueID := state["issues"].([]any)[0].(map[string]any)["id"].(string)
	participantID := state["participants"].([]any)[0].(map[string]any)["id"].(string)
	participantToken := created["participantToken"].(string)
	votePath := "/api/rooms/" + roomID + "/issues/" + issueID + "/votes/" + participantID
	status, _ := f.request(http.MethodPut, votePath, map[string]any{"value": "3"}, map[string]string{"X-Participant-Token": participantToken})
	if status != http.StatusNoContent {
		t.Fatalf("first vote status=%d", status)
	}
	var before Vote
	if err := f.db.First(&before, "issue_id = ? AND participant_id = ?", issueID, participantID).Error; err != nil {
		t.Fatal(err)
	}
	status, _ = f.request(http.MethodPut, votePath, map[string]any{"value": "5"}, map[string]string{"X-Participant-Token": participantToken})
	if status != http.StatusNoContent {
		t.Fatalf("vote update status=%d", status)
	}
	var after Vote
	if err := f.db.First(&after, "issue_id = ? AND participant_id = ?", issueID, participantID).Error; err != nil {
		t.Fatal(err)
	}
	if after.ID != before.ID || !after.CreatedAt.Equal(before.CreatedAt) || after.Value != "5" {
		t.Fatalf("upsert changed identity/creation or missed value: before=%+v after=%+v", before, after)
	}
	status, _ = f.request(http.MethodPost, "/api/rooms/"+roomID+"/issues/"+issueID+"/reset-votes", nil, map[string]string{"X-Host-Token": created["hostToken"].(string)})
	if status != http.StatusNoContent {
		t.Fatalf("reset votes status=%d", status)
	}
	if err := f.db.First(&after, "issue_id = ? AND participant_id = ?", issueID, participantID).Error; err == nil {
		t.Fatal("reset left a vote")
	}
	status, _ = f.request(http.MethodPut, votePath, map[string]any{"value": "8"}, map[string]string{"X-Participant-Token": participantToken})
	if status != http.StatusNoContent {
		t.Fatalf("vote before spectator switch status=%d", status)
	}
	status, _ = f.request(http.MethodPatch, "/api/participants/"+participantID, map[string]any{"isSpectator": true}, map[string]string{"X-Participant-Token": participantToken})
	if status != http.StatusOK {
		t.Fatalf("spectator switch status=%d", status)
	}
	if err := f.db.First(&after, "issue_id = ? AND participant_id = ?", issueID, participantID).Error; err == nil {
		t.Fatal("switching to spectator left the active issue vote")
	}
}

func TestConcurrentVoteAndSpectatorSwitchLeavesNoVote(t *testing.T) {
	f := newAPIFixture(t)
	created, state := f.createRoom()
	room := state["room"].(map[string]any)
	roomID := room["id"].(string)
	issueID := state["issues"].([]any)[0].(map[string]any)["id"].(string)
	participantID := state["participants"].([]any)[0].(map[string]any)["id"].(string)
	token := created["participantToken"].(string)
	start := make(chan struct{})
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for _, operation := range []struct {
		path string
		body any
		verb string
	}{
		{path: "/api/rooms/" + roomID + "/issues/" + issueID + "/votes/" + participantID, body: map[string]any{"value": "3"}, verb: http.MethodPut},
		{path: "/api/participants/" + participantID, body: map[string]any{"isSpectator": true}, verb: http.MethodPatch},
	} {
		wg.Add(1)
		go func(op struct {
			path string
			body any
			verb string
		}) {
			defer wg.Done()
			<-start
			headers := map[string]string{"X-Participant-Token": token}
			status, _ := f.request(op.verb, op.path, op.body, headers)
			statuses <- status
		}(operation)
	}
	close(start)
	wg.Wait()
	close(statuses)
	for status := range statuses {
		if status != http.StatusNoContent && status != http.StatusOK && status != http.StatusForbidden {
			t.Fatalf("unexpected concurrent operation status %d", status)
		}
	}
	var count int64
	if err := f.db.Model(&Vote{}).Where("issue_id = ? AND participant_id = ?", issueID, participantID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("concurrent spectator transition left %d active votes", count)
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
