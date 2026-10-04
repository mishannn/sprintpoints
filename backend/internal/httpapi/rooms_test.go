package httpapi

import (
	"net/http"
	"testing"
)

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
