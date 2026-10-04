package httpapi

import "github.com/gin-gonic/gin"

func (s *Server) websocket(c *gin.Context) {
	r := c.Request
	s.hub.Serve(c.Writer, r, c.Param("room"), func() (ok bool) {
		defer func() {
			if recover() != nil {
				ok = false
			}
		}()
		room := findRoom(s.db, c.Param("room"))
		requireMember(s.db, room, r.URL.Query().Get("participantToken"), r.URL.Query().Get("hostToken"))
		return true
	})
}
