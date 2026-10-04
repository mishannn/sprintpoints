package httpapi

import (
	"crypto/rand"
	"math/big"
	"strings"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

type createRoomBody struct {
	RoomName        *string `json:"roomName" binding:"required"`
	ParticipantName *string `json:"participantName" binding:"required"`
	Defaults        struct {
		FacilitatorName *string `json:"facilitatorName" binding:"required"`
		FirstStoryTitle *string `json:"firstStoryTitle" binding:"required"`
		RoomName        *string `json:"roomName" binding:"required"`
	} `json:"defaults" binding:"required"`
}
type joinRoomBody struct {
	Name        *string `json:"name" binding:"required"`
	IsSpectator *bool   `json:"isSpectator" binding:"required"`
}
type transferOwnershipBody struct {
	ParticipantID *string `json:"participantId" binding:"required"`
}

func (s *Server) createRoom(q *request) any {
	var body createRoomBody
	q.bind(&body)
	t := nowUTC()
	rid, pid, iid := newID(), newID(), newID()
	code := ""
	for attempt := 0; attempt < 20; attempt++ {
		b := make([]byte, 6)
		for i := range b {
			n, err := rand.Int(rand.Reader, big.NewInt(36))
			must(err)
			b[i] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[n.Int64()]
		}
		candidate := string(b)
		var n int64
		must(q.tx.Model(&domain.Room{}).Where("code = ?", candidate).Count(&n).Error)
		if n == 0 {
			code = candidate
			break
		}
	}
	if code == "" {
		fail(503, "roomCodeUnavailable")
	}
	name := strings.TrimSpace(*body.RoomName)
	if name == "" {
		name = *body.Defaults.RoomName
	}
	pn := strings.TrimSpace(*body.ParticipantName)
	if pn == "" {
		pn = *body.Defaults.FacilitatorName
	}
	r := domain.Room{ID: rid, Code: code, Name: name, HostToken: newToken(), OwnerID: &pid, CardSet: []string{"0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"}, ActiveIssueID: &iid, CreatedAt: t, UpdatedAt: t}
	p := domain.Participant{ID: pid, RoomID: rid, Name: pn, Token: newToken(), LastSeenAt: t, CreatedAt: t}
	i := domain.Issue{ID: iid, RoomID: rid, Title: *body.Defaults.FirstStoryTitle, Position: 1, CreatedAt: t}
	must(q.tx.Create(&r).Error)
	must(q.tx.Create(&p).Error)
	must(q.tx.Create(&i).Error)
	st := roomState(q.tx, r, p.Token, r.HostToken)
	return map[string]any{"hostToken": r.HostToken, "participantToken": p.Token, "state": st, "participant": participantJSON(p, p.Token)}
}

func (s *Server) joinRoom(q *request) any {
	var body joinRoomBody
	q.bind(&body)
	if normalizeRoomCode(q.path("room")) == "" || strings.TrimSpace(*body.Name) == "" {
		fail(400, "joinRoomRequired")
	}
	r := findRoomByCode(q.tx, q.path("room"))
	t := nowUTC()
	p := domain.Participant{ID: newID(), RoomID: r.ID, Name: strings.TrimSpace(*body.Name), Token: newToken(), IsSpectator: *body.IsSpectator, LastSeenAt: t, CreatedAt: t}
	must(q.tx.Create(&p).Error)
	q.notifyRoom(r.ID)
	return map[string]any{"room": roomJSON(r, false), "participant": participantJSON(p, p.Token), "participantToken": p.Token}
}

func (s *Server) loadRoom(q *request) any {
	r := findRoomByCode(q.tx, q.path("room"))
	requireMember(q.tx, r, q.participantToken(), q.hostToken())
	return roomState(q.tx, r, q.participantToken(), q.hostToken())
}

func (s *Server) transferOwnership(q *request) any {
	var body transferOwnershipBody
	q.bind(&body)
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	p := findParticipant(q.tx, *body.ParticipantID)
	if p.RoomID != r.ID {
		fail(404, "participantNotFound")
	}
	// Rotate the facilitator credential so the previous owner loses host access.
	r.HostToken = newToken()
	r.OwnerID = &p.ID
	q.saveRoom(&r)
	q.notifyRoom(r.ID)
	return nil
}
