package httpapi

import (
	"net/http"
	"sync"
	"testing"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

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
	var before domain.Vote
	if err := f.db.First(&before, "issue_id = ? AND participant_id = ?", issueID, participantID).Error; err != nil {
		t.Fatal(err)
	}
	status, _ = f.request(http.MethodPut, votePath, map[string]any{"value": "5"}, map[string]string{"X-Participant-Token": participantToken})
	if status != http.StatusNoContent {
		t.Fatalf("vote update status=%d", status)
	}
	var after domain.Vote
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
	if err := f.db.Model(&domain.Vote{}).Where("issue_id = ? AND participant_id = ?", issueID, participantID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("concurrent spectator transition left %d active votes", count)
	}
}
