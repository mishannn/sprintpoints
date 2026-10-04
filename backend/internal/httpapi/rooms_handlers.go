package httpapi

import (
	"crypto/rand"
	"strings"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

func (s *Server) createRoom(q *request) any {
	t := nowUTC()
	rid, pid, iid := newID(), newID(), newID()
	code := ""
	for attempt := 0; attempt < 20; attempt++ {
		b := make([]byte, 6)
		for i := range b {
			for {
				x := make([]byte, 1)
				_, err := rand.Read(x)
				must(err)
				// Reject the remainder to keep all 36 code characters equally likely.
				if x[0] < 252 {
					b[i] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[int(x[0])%36]
					break
				}
			}
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
	defaults := q.data["defaults"].(map[string]any)
	name := strings.TrimSpace(q.string("roomName"))
	if name == "" {
		name = stringValue(defaults, "roomName")
	}
	pn := strings.TrimSpace(q.string("participantName"))
	if pn == "" {
		pn = stringValue(defaults, "facilitatorName")
	}
	r := domain.Room{ID: rid, Code: code, Name: name, HostToken: newToken(), OwnerID: &pid, CardSet: domain.JSONStrings{"0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"}, ActiveIssueID: &iid, CreatedAt: t, UpdatedAt: t}
	p := domain.Participant{ID: pid, RoomID: rid, Name: pn, Token: newToken(), LastSeenAt: t, CreatedAt: t}
	i := domain.Issue{ID: iid, RoomID: rid, Title: stringValue(defaults, "firstStoryTitle"), Position: 1, CreatedAt: t}
	must(q.tx.Create(&r).Error)
	must(q.tx.Create(&p).Error)
	must(q.tx.Create(&i).Error)
	st := roomState(q.tx, r, p.Token, r.HostToken)
	return map[string]any{"hostToken": r.HostToken, "participantToken": p.Token, "state": st, "participant": participantJSON(p, p.Token)}
}

func (s *Server) joinRoom(q *request) any {
	if normalizeRoomCode(q.path("code")) == "" || strings.TrimSpace(q.string("name")) == "" {
		fail(400, "joinRoomRequired")
	}
	r := findRoomByCode(q.tx, q.path("code"))
	t := nowUTC()
	p := domain.Participant{ID: newID(), RoomID: r.ID, Name: strings.TrimSpace(q.string("name")), Token: newToken(), IsSpectator: q.data["isSpectator"].(bool), LastSeenAt: t, CreatedAt: t}
	must(q.tx.Create(&p).Error)
	q.notifyRoom(r.ID)
	return map[string]any{"room": roomJSON(r, false), "participant": participantJSON(p, p.Token), "participantToken": p.Token}
}

func (s *Server) loadRoom(q *request) any {
	r := findRoomByCode(q.tx, q.path("code"))
	requireMember(q.tx, r, q.participantToken(), q.hostToken())
	return roomState(q.tx, r, q.participantToken(), q.hostToken())
}

func (s *Server) transferOwnership(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	p := findParticipant(q.tx, q.string("participantId"))
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
