package httpapi

import (
	"github.com/mishannn/sprintpoints/backend/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// requireHost serializes facilitator mutations on the room row in PostgreSQL.
func requireHost(db *gorm.DB, id, t string) domain.Room {
	locked := db
	if db.Dialector.Name() == "postgres" {
		locked = db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	r := findRoom(locked, id)
	if !tokensEqual(t, r.HostToken) {
		fail(403, "hostAccessDenied")
	}
	return r
}

// The participant lock prevents votes racing with a switch to spectator mode.
func requireParticipant(db *gorm.DB, id, t string) domain.Participant {
	locked := db
	if db.Dialector.Name() == "postgres" {
		locked = db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	p := findParticipant(locked, id)
	if !tokensEqual(t, p.Token) {
		fail(403, "participantAccessDenied")
	}
	return p
}
func requireMember(db *gorm.DB, r domain.Room, pt, ht string) {
	if tokensEqual(ht, r.HostToken) {
		return
	}
	var n int64
	if pt != "" {
		must(db.Model(&domain.Participant{}).Where("room_id = ? AND token = ?", r.ID, pt).Count(&n).Error)
	}
	if n == 0 {
		fail(403, "roomAccessDenied")
	}
}
