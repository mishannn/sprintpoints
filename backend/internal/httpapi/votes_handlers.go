package httpapi

import (
	"gorm.io/gorm/clause"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

type voteBody struct {
	Value *string `json:"value" binding:"required"`
}

func (s *Server) castVote(q *request) any {
	var body voteBody
	q.bind(&body)
	p := requireParticipant(q.tx, q.path("participant"), q.participantToken())
	i := findIssue(q.tx, q.path("issue"))
	if p.RoomID != q.path("room") || i.RoomID != q.path("room") {
		fail(404, "roomNotFound")
	}
	if p.IsSpectator {
		fail(403, "spectatorsCannotVote")
	}
	t := nowUTC()
	v := domain.Vote{ID: newID(), RoomID: p.RoomID, IssueID: i.ID, ParticipantID: p.ID, Value: *body.Value, CreatedAt: t, UpdatedAt: t}
	must(q.tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "issue_id"}, {Name: "participant_id"}}, DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"})}).Create(&v).Error)
	q.notifyRoom(p.RoomID)
	return nil
}

func (s *Server) revealVotes(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	r.Revealed = true
	q.saveRoom(&r)
	q.notifyRoom(r.ID)
	return nil
}

func (s *Server) resetVotes(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	i := findIssue(q.tx, q.path("issue"))
	if i.RoomID != r.ID {
		fail(404, "storyNotFound")
	}
	must(q.tx.Where("issue_id = ?", i.ID).Delete(&domain.Vote{}).Error)
	r.Revealed = false
	q.saveRoom(&r)
	q.notifyRoom(r.ID)
	return nil
}

func (s *Server) deleteVote(q *request) any {
	p := requireParticipant(q.tx, q.path("participant"), q.participantToken())
	i := findIssue(q.tx, q.path("issue"))
	if p.RoomID != i.RoomID {
		fail(404, "roomNotFound")
	}
	must(q.tx.Where("issue_id = ? AND participant_id = ?", i.ID, p.ID).Delete(&domain.Vote{}).Error)
	q.notifyRoom(p.RoomID)
	return nil
}
