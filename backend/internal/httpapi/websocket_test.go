package httpapi

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

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
