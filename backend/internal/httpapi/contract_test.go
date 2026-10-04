package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

func TestTypedJSONBinding(t *testing.T) {
	f := newAPIFixture(t)
	_, created := f.createRoom()
	code := created["room"].(map[string]any)["code"].(string)
	for _, tc := range []struct{ name, path, body string }{
		{"malformed", "/api/rooms", `{"roomName":`},
		{"wrong type", "/api/rooms", `{"roomName":8,"participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`},
		{"missing nested field", "/api/rooms", `{"roomName":"Test","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator"}}`},
		{"missing boolean", "/api/rooms/" + code + "/join", `{"name":"Member"}`},
		{"invalid boolean", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":1}`},
		{"missing imported title", "/api/rooms/" + code + "/issues/import", `{"issues":[{"title":"Valid"},{}]}`},
		{"null required title", "/api/rooms/" + code + "/issues", `{"title":null}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPost, f.h.URL+tc.path, bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := f.h.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			var result map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&result)
			if resp.StatusCode != 422 || result["detail"] == nil {
				t.Fatalf("status=%d body=%v", resp.StatusCode, result)
			}
		})
	}
	status, result := f.request("POST", "/api/rooms/"+code+"/join", map[string]any{"name": "Member", "isSpectator": false}, nil)
	if status != 201 || result["participant"].(map[string]any)["is_spectator"] != false {
		t.Fatalf("explicit false: %d %v", status, result)
	}
}

func TestRequiredNullableFields(t *testing.T) {
	f := newAPIFixture(t)
	_, state := f.createRoom()
	room := state["room"].(map[string]any)
	roomID := room["id"].(string)
	issueID := state["issues"].([]any)[0].(map[string]any)["id"].(string)
	for _, tc := range []struct{ method, path, field string }{
		{"PATCH", "/api/rooms/" + roomID + "/active-issue", "issueId"},
		{"PATCH", "/api/rooms/" + roomID + "/issues/" + issueID + "/archive", "nextActiveIssueId"},
		{"POST", "/api/rooms/" + roomID + "/issues/archive-estimated", "nextActiveIssueId"},
	} {
		for _, body := range []map[string]any{{}, {tc.field: 1}} {
			status, response := f.request(tc.method, tc.path, body, nil)
			if status != 422 {
				t.Fatalf("%s %s: %d %v", tc.method, tc.path, status, response)
			}
		}
	}
}
