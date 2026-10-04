package httpapi

func (s *Server) routes() {
	s.route("GET", "/api/health", 200, s.health)
	s.route("POST", "/api/rooms", 201, s.createRoom)
	s.route("POST", "/api/rooms/:room/join", 201, s.joinRoom)
	s.route("GET", "/api/rooms/:room", 200, s.loadRoom)
	s.route("POST", "/api/rooms/:room/transfer-ownership", 204, s.transferOwnership)
	s.route("POST", "/api/participants/:participant/heartbeat", 204, s.heartbeat)
	s.route("PATCH", "/api/participants/:participant", 200, s.updateParticipant)
	s.route("DELETE", "/api/rooms/:room/participants/:participant", 204, s.deleteParticipant)
	s.route("POST", "/api/rooms/:room/issues", 201, s.createIssue)
	s.route("POST", "/api/rooms/:room/issues/import", 201, s.importIssues)
	s.route("PATCH", "/api/issues/:issue", 200, s.updateIssue)
	s.route("DELETE", "/api/rooms/:room/issues/:issue", 204, s.deleteIssue)
	s.route("PATCH", "/api/rooms/:room/issues/:issue/archive", 200, s.archiveIssue)
	s.route("POST", "/api/rooms/:room/issues/archive-estimated", 200, s.archiveEstimatedIssues)
	s.route("PATCH", "/api/rooms/:room/issues/:issue/unarchive", 200, s.unarchiveIssue)
	s.route("PATCH", "/api/rooms/:room/active-issue", 204, s.setActiveIssue)
	s.route("PATCH", "/api/issues/:issue/estimate", 204, s.setEstimate)
	s.route("PUT", "/api/rooms/:room/issues/:issue/votes/:participant", 204, s.castVote)
	s.route("PATCH", "/api/rooms/:room/reveal", 204, s.revealVotes)
	s.route("POST", "/api/rooms/:room/issues/:issue/reset-votes", 204, s.resetVotes)
	s.route("DELETE", "/api/issues/:issue/votes/:participant", 204, s.deleteVote)
	s.router.GET("/api/rooms/:room/ws", s.websocket)
}
func (s *Server) health(*request) any { return map[string]string{"status": "ok"} }
