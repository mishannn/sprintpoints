package httpapi

import "github.com/mishannn/sprintpoints/backend/internal/domain"

func (s *Server) heartbeat(q *request) any {
	p := requireParticipant(q.tx, q.path("participant"), q.participantToken())
	p.LastSeenAt = nowUTC()
	must(q.tx.Model(&p).Update("last_seen_at", p.LastSeenAt).Error)
	return nil
}

func (s *Server) updateParticipant(q *request) any {
	p := requireParticipant(q.tx, q.path("participant"), q.participantToken())
	p.IsSpectator = q.data["isSpectator"].(bool)
	if p.IsSpectator {
		r := findRoom(q.tx, p.RoomID)
		if r.ActiveIssueID != nil {
			must(q.tx.Where("issue_id = ? AND participant_id = ?", *r.ActiveIssueID, p.ID).Delete(&domain.Vote{}).Error)
		}
	}
	must(q.tx.Model(&p).Update("is_spectator", p.IsSpectator).Error)
	q.notifyRoom(p.RoomID)
	return participantJSON(p, q.participantToken())
}

func (s *Server) deleteParticipant(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	p := findParticipant(q.tx, q.path("participant"))
	if p.RoomID != r.ID {
		fail(404, "participantNotFound")
	}
	must(q.tx.Delete(&p).Error)
	q.notifyRoom(r.ID)
	return nil
}
