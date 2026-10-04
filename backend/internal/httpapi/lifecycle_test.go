package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
)

// requestValue decodes responses whose top-level JSON value is an array as
// well as the object responses covered by apiFixture.request.
func (f *apiFixture) requestValue(method, path string, body any, headers map[string]string) (int, any) {
	f.t.Helper()
	var data *bytes.Reader
	if body == nil {
		data = bytes.NewReader(nil)
	} else {
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
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return resp.StatusCode, nil
	}
	var value any
	if err := json.NewDecoder(resp.Body).Decode(&value); err != nil {
		f.t.Fatalf("decode %s %s: %v", method, path, err)
	}
	return resp.StatusCode, value
}

func object(v any) map[string]any                 { return v.(map[string]any) }
func array(v any) []any                           { return v.([]any) }
func id(v any) string                             { return v.(string) }
func auth(header, token string) map[string]string { return map[string]string{header: token} }

func TestIssueParticipantLifecycle(t *testing.T) {
	f := newAPIFixture(t)
	created, initial := f.createRoom()
	r := object(initial["room"])
	rid, code := id(r["id"]), id(r["code"])
	hostToken := id(created["hostToken"])
	h := auth("X-Host-Token", hostToken)
	member := f.addMember(code)
	guestID, guestToken := id(object(member["participant"])["id"]), id(member["participantToken"])
	p := auth("X-Participant-Token", guestToken)

	// Clearing the default active issue allows an import to choose its first
	// nonblank entry. Skipped blank titles still consume positional offsets.
	if status, _ := f.request(http.MethodPatch, "/api/rooms/"+rid+"/active-issue", map[string]any{"issueId": nil}, h); status != http.StatusNoContent {
		t.Fatalf("clear active issue: %d", status)
	}
	status, empty := f.requestValue(http.MethodPost, "/api/rooms/"+rid+"/issues/import", map[string]any{"issues": []any{}}, h)
	if status != http.StatusCreated || len(array(empty)) != 0 {
		t.Fatalf("empty import status=%d rows=%v", status, empty)
	}
	status, blank := f.requestValue(http.MethodPost, "/api/rooms/"+rid+"/issues/import", map[string]any{"issues": []any{map[string]any{"title": "  "}}}, h)
	if status != http.StatusCreated || len(array(blank)) != 0 {
		t.Fatalf("blank import status=%d rows=%v", status, blank)
	}
	status, importedAny := f.requestValue(http.MethodPost, "/api/rooms/"+rid+"/issues/import", map[string]any{"issues": []any{
		map[string]any{"title": " "}, map[string]any{"title": " Seed ", "estimate": " 5 "}, map[string]any{"title": " Later "},
	}}, h)
	rows := array(importedAny)
	if status != http.StatusCreated || len(rows) != 2 {
		t.Fatalf("import status=%d rows=%v", status, importedAny)
	}
	first, second := object(rows[0]), object(rows[1])
	if first["title"] != "Seed" || first["position"].(float64) != 3 || first["estimate"] != "5" || second["position"].(float64) != 4 {
		t.Fatalf("import did not retain blank-row position gap/defaults: %v", rows)
	}
	seedID, laterID := id(first["id"]), id(second["id"])
	status, state := f.request(http.MethodGet, "/api/rooms/"+code, nil, h)
	if status != http.StatusOK || object(state["room"])["active_issue_id"] != seedID {
		t.Fatalf("first imported issue not selected: %v", state)
	}

	// Editing, estimating, archiving, unarchiving, and archiving estimated
	// issues preserve the lifecycle fields exposed by the API.
	status, edited := f.request(http.MethodPatch, "/api/issues/"+seedID, map[string]any{"title": " Revised ", "description": " desc ", "link": " link "}, h)
	if status != http.StatusOK || object(edited)["title"] != "Revised" || object(edited)["description"] != "desc" {
		t.Fatalf("edit issue status=%d: %v", status, edited)
	}
	if status, _ := f.request(http.MethodPatch, "/api/issues/"+seedID+"/estimate", map[string]any{"value": "8"}, h); status != http.StatusNoContent {
		t.Fatalf("estimate status=%d", status)
	}
	if status, _ := f.request(http.MethodPatch, "/api/rooms/"+rid+"/active-issue", map[string]any{"issueId": seedID}, h); status != http.StatusNoContent {
		t.Fatalf("activate status=%d", status)
	}
	status, archived := f.request(http.MethodPatch, "/api/rooms/"+rid+"/issues/"+seedID+"/archive", map[string]any{"nextActiveIssueId": laterID}, h)
	if status != http.StatusOK || object(archived)["archived_at"] == nil {
		t.Fatalf("archive status=%d: %v", status, archived)
	}
	status, state = f.request(http.MethodGet, "/api/rooms/"+code, nil, h)
	if status != http.StatusOK || object(state["room"])["active_issue_id"] != laterID {
		t.Fatalf("archive did not select next issue: %v", state)
	}
	status, unarchived := f.request(http.MethodPatch, "/api/rooms/"+rid+"/issues/"+seedID+"/unarchive", nil, h)
	if status != http.StatusOK || object(unarchived)["archived_at"] != nil {
		t.Fatalf("unarchive status=%d: %v", status, unarchived)
	}
	status, archivedRows := f.requestValue(http.MethodPost, "/api/rooms/"+rid+"/issues/archive-estimated", map[string]any{"nextActiveIssueId": nil}, h)
	if status != http.StatusOK || len(array(archivedRows)) != 1 || object(array(archivedRows)[0])["id"] != seedID {
		t.Fatalf("archive estimated status=%d rows=%v", status, archivedRows)
	}

	// Participant heartbeat and deletion, plus issue deletion's snake_case
	// next_active_issue_id query parameter, are observable lifecycle behavior.
	if status, _ := f.request(http.MethodPost, "/api/participants/"+guestID+"/heartbeat", nil, p); status != http.StatusNoContent {
		t.Fatalf("heartbeat status=%d", status)
	}
	if status, _ := f.request(http.MethodPatch, "/api/rooms/"+rid+"/active-issue", map[string]any{"issueId": laterID}, h); status != http.StatusNoContent {
		t.Fatalf("activate for delete status=%d", status)
	}
	if status, _ := f.request(http.MethodDelete, "/api/rooms/"+rid+"/issues/"+laterID+"?next_active_issue_id="+url.QueryEscape(seedID), nil, h); status != http.StatusNoContent {
		t.Fatalf("issue delete status=%d", status)
	}
	status, state = f.request(http.MethodGet, "/api/rooms/"+code, nil, h)
	if status != http.StatusOK || object(state["room"])["active_issue_id"] != seedID || len(array(state["issues"])) != 2 {
		t.Fatalf("snake_case next_active_issue_id not applied: %v", state)
	}
	for _, raw := range array(state["issues"]) {
		if object(raw)["id"] == laterID {
			t.Fatalf("deleted issue remains in room state: %v", state)
		}
	}
	if status, _ := f.request(http.MethodDelete, "/api/rooms/"+rid+"/participants/"+guestID, nil, h); status != http.StatusNoContent {
		t.Fatalf("participant delete status=%d", status)
	}
	status, state = f.request(http.MethodGet, "/api/rooms/"+code, nil, h)
	if status != http.StatusOK || len(array(state["participants"])) != 1 {
		t.Fatalf("participant remains after deletion: %v", state)
	}
}

func TestLifecycleOperationsRejectCrossRoomResources(t *testing.T) {
	f := newAPIFixture(t)
	first, firstState := f.createRoom()
	second, secondState := f.createRoom()
	firstRoom, secondRoom := object(firstState["room"]), object(secondState["room"])
	firstIssue := object(array(firstState["issues"])[0])
	secondIssue := object(array(secondState["issues"])[0])
	firstParticipant := object(array(firstState["participants"])[0])
	secondParticipant := object(array(secondState["participants"])[0])
	roomID, foreignRoomID := id(firstRoom["id"]), id(secondRoom["id"])
	issueID, foreignIssueID := id(firstIssue["id"]), id(secondIssue["id"])
	host := auth("X-Host-Token", id(second["hostToken"]))
	participant := auth("X-Participant-Token", id(first["participantToken"]))
	cases := []struct {
		name, method, path string
		body               any
		headers            map[string]string
		wantStatus         int
		wantDetail         string
	}{
		{"create issue with foreign room host", http.MethodPost, "/api/rooms/" + roomID + "/issues", map[string]any{"title": "Denied"}, host, http.StatusForbidden, "hostAccessDenied"},
		{"activate foreign issue", http.MethodPatch, "/api/rooms/" + foreignRoomID + "/active-issue", map[string]any{"issueId": issueID}, host, http.StatusNotFound, "storyNotFound"},
		{"archive foreign issue", http.MethodPatch, "/api/rooms/" + foreignRoomID + "/issues/" + issueID + "/archive", map[string]any{"nextActiveIssueId": nil}, host, http.StatusNotFound, "storyNotFound"},
		{"delete foreign issue", http.MethodDelete, "/api/rooms/" + foreignRoomID + "/issues/" + issueID, nil, host, http.StatusNotFound, "storyNotFound"},
		{"delete foreign participant", http.MethodDelete, "/api/rooms/" + foreignRoomID + "/participants/" + id(firstParticipant["id"]), nil, host, http.StatusNotFound, "participantNotFound"},
		{"vote in wrong room", http.MethodPut, "/api/rooms/" + foreignRoomID + "/issues/" + foreignIssueID + "/votes/" + id(firstParticipant["id"]), map[string]any{"value": "3"}, participant, http.StatusNotFound, "roomNotFound"},
		{"heartbeat other participant", http.MethodPost, "/api/participants/" + id(secondParticipant["id"]) + "/heartbeat", nil, participant, http.StatusForbidden, "participantAccessDenied"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := f.requestValue(tc.method, tc.path, tc.body, tc.headers)
			if status != tc.wantStatus {
				t.Fatalf("cross-room operation status=%d, want %d; body=%v", status, tc.wantStatus, body)
			}
			if got := object(body)["detail"]; got != tc.wantDetail {
				t.Fatalf("cross-room operation detail=%v, want %q", got, tc.wantDetail)
			}
		})
	}
	status, state := f.request(http.MethodGet, "/api/rooms/"+id(firstRoom["code"]), nil, auth("X-Participant-Token", id(first["participantToken"])))
	if status != http.StatusOK || len(array(state["issues"])) != 1 || object(array(state["issues"])[0])["id"] != issueID {
		t.Fatalf("denied requests mutated source room: %v", state)
	}
}
