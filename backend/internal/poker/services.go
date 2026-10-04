package poker

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type apiError struct {
	status int
	detail any
}

func (e apiError) Error() string   { return fmt.Sprint(e.detail) }
func fail(code int, detail string) { panic(apiError{code, detail}) }
func must(err error) {
	if err != nil {
		panic(err)
	}
}
func same(a, b string) bool { return a != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
func timestamp() time.Time  { return time.Now().UTC().Truncate(time.Microsecond) }
func identifier() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	must(err)
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	s := hex.EncodeToString(b)
	return s[:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:]
}
func token() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	must(err)
	return base64.RawURLEncoding.EncodeToString(b)
}
func ptr(s string) *string      { return &s }
func normalize(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }
func getRoom(db *gorm.DB, id string) Room {
	var v Room
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "roomNotFound")
	}
	must(err)
	return v
}
func byCode(db *gorm.DB, code string) Room {
	var v Room
	err := db.First(&v, "code = ?", normalize(code)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "roomNotFound")
	}
	must(err)
	return v
}
func getIssue(db *gorm.DB, id string) Issue {
	var v Issue
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "storyNotFound")
	}
	must(err)
	return v
}
func getParticipant(db *gorm.DB, id string) Participant {
	var v Participant
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "participantNotFound")
	}
	must(err)
	return v
}
func host(db *gorm.DB, id, t string) Room {
	locked := db
	if db.Dialector.Name() == "postgres" {
		locked = db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	r := getRoom(locked, id)
	if !same(t, r.HostToken) {
		fail(403, "hostAccessDenied")
	}
	return r
}
func participant(db *gorm.DB, id, t string) Participant {
	locked := db
	if db.Dialector.Name() == "postgres" {
		locked = db.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	p := getParticipant(locked, id)
	if !same(t, p.Token) {
		fail(403, "participantAccessDenied")
	}
	return p
}
func member(db *gorm.DB, r Room, pt, ht string) {
	if same(ht, r.HostToken) {
		return
	}
	var n int64
	if pt != "" {
		must(db.Model(&Participant{}).Where("room_id = ? AND token = ?", r.ID, pt).Count(&n).Error)
	}
	if n == 0 {
		fail(403, "roomAccessDenied")
	}
}
func roomJSON(r Room, reveal bool) map[string]any {
	t := ""
	if reveal {
		t = r.HostToken
	}
	return map[string]any{"id": r.ID, "code": r.Code, "name": r.Name, "host_token": t, "owner_id": r.OwnerID, "card_set": r.CardSet, "revealed": r.Revealed, "active_issue_id": r.ActiveIssueID, "created_at": formatISO(r.CreatedAt), "updated_at": formatISO(r.UpdatedAt)}
}
func participantJSON(p Participant, t string) map[string]any {
	visible := ""
	if same(t, p.Token) {
		visible = p.Token
	}
	return map[string]any{"id": p.ID, "room_id": p.RoomID, "name": p.Name, "token": visible, "is_spectator": p.IsSpectator, "last_seen_at": formatISO(p.LastSeenAt), "created_at": formatISO(p.CreatedAt)}
}
func state(db *gorm.DB, r Room, pt, ht string) map[string]any {
	ps := []Participant{}
	issues := []Issue{}
	votes := []Vote{}
	must(db.Where("room_id = ?", r.ID).Order("created_at").Find(&ps).Error)
	must(db.Where("room_id = ?", r.ID).Order("position, created_at").Find(&issues).Error)
	must(db.Where("room_id = ?", r.ID).Find(&votes).Error)
	reveal := same(ht, r.HostToken)
	out := make([]map[string]any, 0, len(ps))
	for _, p := range ps {
		if r.OwnerID != nil && p.ID == *r.OwnerID && same(pt, p.Token) {
			reveal = true
		}
		out = append(out, participantJSON(p, pt))
	}
	return map[string]any{"room": roomJSON(r, reveal), "participants": out, "issues": issues, "votes": votes}
}
func position(db *gorm.DB, id string) int {
	var n int
	must(db.Model(&Issue{}).Select("COALESCE(MAX(position),0)+1").Where("room_id = ?", id).Scan(&n).Error)
	return n
}
