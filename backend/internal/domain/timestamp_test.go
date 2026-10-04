package domain

import (
	"encoding/json"
	"testing"
	"time"
)

func TestFormatISO(t *testing.T) {
	input := time.Date(2026, 3, 2, 12, 20, 30, 123456789, time.FixedZone("offset", 2*60*60))
	if got := FormatTimestamp(input); got != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("fractional UTC timestamp %q", got)
	}
	whole := time.Date(2026, 3, 2, 10, 20, 30, 0, time.UTC)
	if got := FormatTimestamp(whole); got != "2026-03-02T10:20:30Z" {
		t.Fatalf("whole-second UTC timestamp %q", got)
	}
}

func TestIssueVoteJSONTimestamps(t *testing.T) {
	now := time.Date(2026, 3, 2, 10, 20, 30, 123456000, time.UTC)
	issueJSON, err := json.Marshal(Issue{ID: "i", CreatedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	var issueFields map[string]json.RawMessage
	if err := json.Unmarshal(issueJSON, &issueFields); err != nil {
		t.Fatal(err)
	}
	var created string
	if err := json.Unmarshal(issueFields["created_at"], &created); err != nil || created != "2026-03-02T10:20:30.123456Z" {
		t.Fatalf("issue created_at=%q err=%v", created, err)
	}
	if string(issueFields["archived_at"]) != "null" {
		t.Fatalf("nil archived_at should remain null: %s", issueFields["archived_at"])
	}
	archived := now.Add(time.Second)
	issueJSON, err = json.Marshal(Issue{ID: "i", CreatedAt: now, ArchivedAt: &archived})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(issueJSON, &issueFields); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(issueFields["archived_at"], &created); err != nil || created != "2026-03-02T10:20:31.123456Z" {
		t.Fatalf("archived_at=%q err=%v", created, err)
	}
	vote, err := json.Marshal(Vote{ID: "v", CreatedAt: now, UpdatedAt: now.Add(time.Second)})
	if err != nil {
		t.Fatal(err)
	}
	var voteFields map[string]json.RawMessage
	if err := json.Unmarshal(vote, &voteFields); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(voteFields["updated_at"], &created); err != nil || created != "2026-03-02T10:20:31.123456Z" {
		t.Fatalf("vote updated_at=%q err=%v", created, err)
	}
}
