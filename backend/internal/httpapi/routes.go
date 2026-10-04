package httpapi

import (
	"github.com/mishannn/sprintpoints/backend/internal/validation"
)

func (s *Server) routes() {
	s.route("GET /api/health", 200, nil, s.health)
	s.route("POST /api/rooms", 201, []validation.Field{validation.String("roomName"), validation.String("participantName"), {Name: "defaults", Kind: "object", Children: []validation.Field{validation.String("facilitatorName"), validation.String("firstStoryTitle"), validation.String("roomName")}}}, s.createRoom)
	s.route("POST /api/rooms/{code}/join", 201, []validation.Field{validation.String("name"), validation.Boolean("isSpectator")}, s.joinRoom)
	s.route("GET /api/rooms/{code}", 200, nil, s.loadRoom)
	s.route("POST /api/rooms/{room}/transfer-ownership", 204, []validation.Field{validation.String("participantId")}, s.transferOwnership)
	s.route("POST /api/participants/{participant}/heartbeat", 204, nil, s.heartbeat)
	s.route("PATCH /api/participants/{participant}", 200, []validation.Field{validation.Boolean("isSpectator")}, s.updateParticipant)
	s.route("DELETE /api/rooms/{room}/participants/{participant}", 204, nil, s.deleteParticipant)
	s.route("POST /api/rooms/{room}/issues", 201, validation.Details, s.createIssue)
	s.route("POST /api/rooms/{room}/issues/import", 201, []validation.Field{{Name: "issues", Kind: "array", Children: []validation.Field{validation.String("title"), validation.OptionalString("description"), validation.OptionalString("link"), validation.OptionalString("estimate")}}}, s.importIssues)
	s.route("PATCH /api/issues/{issue}", 200, validation.Details, s.updateIssue)
	s.route("DELETE /api/rooms/{room}/issues/{issue}", 204, nil, s.deleteIssue)
	s.route("PATCH /api/rooms/{room}/issues/{issue}/archive", 200, []validation.Field{validation.Nullable("nextActiveIssueId", true)}, s.archiveIssue)
	s.route("POST /api/rooms/{room}/issues/archive-estimated", 200, []validation.Field{validation.Nullable("nextActiveIssueId", true)}, s.archiveEstimatedIssues)
	s.route("PATCH /api/rooms/{room}/issues/{issue}/unarchive", 200, nil, s.unarchiveIssue)
	s.route("PATCH /api/rooms/{room}/active-issue", 204, []validation.Field{validation.Nullable("issueId", false)}, s.setActiveIssue)
	s.route("PATCH /api/issues/{issue}/estimate", 204, []validation.Field{validation.String("value")}, s.setEstimate)
	s.route("PUT /api/rooms/{room}/issues/{issue}/votes/{participant}", 204, []validation.Field{validation.String("value")}, s.castVote)
	s.route("PATCH /api/rooms/{room}/reveal", 204, nil, s.revealVotes)
	s.route("POST /api/rooms/{room}/issues/{issue}/reset-votes", 204, nil, s.resetVotes)
	s.route("DELETE /api/issues/{issue}/votes/{participant}", 204, nil, s.deleteVote)
	s.mux.HandleFunc("GET /api/rooms/{room}/ws", s.websocket)
}

func (s *Server) health(*request) any { return map[string]string{"status": "ok"} }
