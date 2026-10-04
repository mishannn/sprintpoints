package httpapi

import (
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

func roomJSON(r domain.Room, reveal bool) map[string]any {
	t := ""
	if reveal {
		t = r.HostToken
	}
	return map[string]any{"id": r.ID, "code": r.Code, "name": r.Name, "host_token": t, "owner_id": r.OwnerID, "card_set": r.CardSet, "revealed": r.Revealed, "active_issue_id": r.ActiveIssueID, "created_at": r.CreatedAt, "updated_at": r.UpdatedAt}
}
func participantJSON(p domain.Participant, t string) map[string]any {
	visible := ""
	if tokensEqual(t, p.Token) {
		visible = p.Token
	}
	return map[string]any{"id": p.ID, "room_id": p.RoomID, "name": p.Name, "token": visible, "is_spectator": p.IsSpectator, "last_seen_at": p.LastSeenAt, "created_at": p.CreatedAt}
}

// A participant sees only their own credential; the owner may also recover
// the current host token after ownership transfer.
func roomState(db *gorm.DB, r domain.Room, pt, ht string) map[string]any {
	ps := []domain.Participant{}
	issues := []domain.Issue{}
	votes := []domain.Vote{}
	must(db.Where("room_id = ?", r.ID).Order("created_at").Find(&ps).Error)
	must(db.Where("room_id = ?", r.ID).Order("position, created_at").Find(&issues).Error)
	must(db.Where("room_id = ?", r.ID).Find(&votes).Error)
	reveal := tokensEqual(ht, r.HostToken)
	out := make([]map[string]any, 0, len(ps))
	for _, p := range ps {
		if r.OwnerID != nil && p.ID == *r.OwnerID && tokensEqual(pt, p.Token) {
			reveal = true
		}
		out = append(out, participantJSON(p, pt))
	}
	return map[string]any{"room": roomJSON(r, reveal), "participants": out, "issues": issues, "votes": votes}
}
