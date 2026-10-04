package httpapi

import (
	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

type roomView struct {
	domain.Room
	HostToken string `json:"host_token"`
}

type participantView struct {
	domain.Participant
	Token string `json:"token"`
}

func roomJSON(r domain.Room, reveal bool) roomView {
	token := ""
	if reveal {
		token = r.HostToken
	}
	return roomView{Room: r, HostToken: token}
}

func participantJSON(p domain.Participant, token string) participantView {
	if !tokensEqual(token, p.Token) {
		token = ""
	}
	return participantView{Participant: p, Token: token}
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
	out := make([]participantView, 0, len(ps))
	for _, p := range ps {
		if r.OwnerID != nil && p.ID == *r.OwnerID && tokensEqual(pt, p.Token) {
			reveal = true
		}
		out = append(out, participantJSON(p, pt))
	}
	return map[string]any{"room": roomJSON(r, reveal), "participants": out, "issues": issues, "votes": votes}
}
