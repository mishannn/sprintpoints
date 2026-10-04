package httpapi

import (
	"net/http"
)

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	s.hub.Serve(w, r, r.PathValue("room"), func() (ok bool) {
		defer func() {
			if recover() != nil {
				ok = false
			}
		}()
		room := findRoom(s.db, r.PathValue("room"))
		requireMember(s.db, room, r.URL.Query().Get("participantToken"), r.URL.Query().Get("hostToken"))
		return true
	})
}
