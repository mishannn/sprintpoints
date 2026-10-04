package poker

import (
	"crypto/rand"
	"strings"

	"gorm.io/gorm/clause"
)

func (s *Server) routes() {
	s.route("GET /api/health", 200, nil, func(q *request) any { return map[string]string{"status": "ok"} })
	s.route("POST /api/rooms", 201, []field{str("roomName"), str("participantName"), {name: "defaults", kind: "object", children: []field{str("facilitatorName"), str("firstStoryTitle"), str("roomName")}}}, func(q *request) any {
		t := timestamp()
		rid, pid, iid := identifier(), identifier(), identifier()
		code := ""
		for attempt := 0; attempt < 20; attempt++ {
			b := make([]byte, 6)
			for i := range b {
				for {
					x := make([]byte, 1)
					_, err := rand.Read(x)
					must(err)
					if x[0] < 252 {
						b[i] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[int(x[0])%36]
						break
					}
				}
			}
			candidate := string(b)
			var n int64
			must(q.db.Model(&Room{}).Where("code = ?", candidate).Count(&n).Error)
			if n == 0 {
				code = candidate
				break
			}
		}
		if code == "" {
			fail(503, "roomCodeUnavailable")
		}
		defaults := q.data["defaults"].(map[string]any)
		name := strings.TrimSpace(q.s("roomName"))
		if name == "" {
			name = stringValue(defaults, "roomName")
		}
		pn := strings.TrimSpace(q.s("participantName"))
		if pn == "" {
			pn = stringValue(defaults, "facilitatorName")
		}
		r := Room{ID: rid, Code: code, Name: name, HostToken: token(), OwnerID: &pid, CardSet: JSONStrings{"0", "1", "2", "3", "5", "8", "13", "21", "?", "Coffee"}, ActiveIssueID: &iid, CreatedAt: t, UpdatedAt: t}
		p := Participant{ID: pid, RoomID: rid, Name: pn, Token: token(), LastSeenAt: t, CreatedAt: t}
		i := Issue{ID: iid, RoomID: rid, Title: stringValue(defaults, "firstStoryTitle"), Position: 1, CreatedAt: t}
		must(q.db.Create(&r).Error)
		must(q.db.Create(&p).Error)
		must(q.db.Create(&i).Error)
		st := state(q.db, r, p.Token, r.HostToken)
		return map[string]any{"hostToken": r.HostToken, "participantToken": p.Token, "state": st, "participant": participantJSON(p, p.Token)}
	})
	s.route("POST /api/rooms/{code}/join", 201, []field{str("name"), boolean("isSpectator")}, func(q *request) any {
		if normalize(q.id("code")) == "" || strings.TrimSpace(q.s("name")) == "" {
			fail(400, "joinRoomRequired")
		}
		r := byCode(q.db, q.id("code"))
		t := timestamp()
		p := Participant{ID: identifier(), RoomID: r.ID, Name: strings.TrimSpace(q.s("name")), Token: token(), IsSpectator: q.data["isSpectator"].(bool), LastSeenAt: t, CreatedAt: t}
		must(q.db.Create(&p).Error)
		q.changed(r.ID)
		return map[string]any{"room": roomJSON(r, false), "participant": participantJSON(p, p.Token), "participantToken": p.Token}
	})
	s.route("GET /api/rooms/{code}", 200, nil, func(q *request) any {
		r := byCode(q.db, q.id("code"))
		member(q.db, r, q.pt(), q.ht())
		return state(q.db, r, q.pt(), q.ht())
	})
	s.route("POST /api/rooms/{room}/transfer-ownership", 204, []field{str("participantId")}, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		p := getParticipant(q.db, q.s("participantId"))
		if p.RoomID != r.ID {
			fail(404, "participantNotFound")
		}
		r.HostToken = token()
		r.OwnerID = &p.ID
		q.touch(&r)
		q.changed(r.ID)
		return nil
	})
	s.route("POST /api/participants/{participant}/heartbeat", 204, nil, func(q *request) any {
		p := participant(q.db, q.id("participant"), q.pt())
		p.LastSeenAt = timestamp()
		must(q.db.Model(&p).Update("last_seen_at", p.LastSeenAt).Error)
		return nil
	})
	s.route("PATCH /api/participants/{participant}", 200, []field{boolean("isSpectator")}, func(q *request) any {
		p := participant(q.db, q.id("participant"), q.pt())
		p.IsSpectator = q.data["isSpectator"].(bool)
		if p.IsSpectator {
			r := getRoom(q.db, p.RoomID)
			if r.ActiveIssueID != nil {
				must(q.db.Where("issue_id = ? AND participant_id = ?", *r.ActiveIssueID, p.ID).Delete(&Vote{}).Error)
			}
		}
		must(q.db.Model(&p).Update("is_spectator", p.IsSpectator).Error)
		q.changed(p.RoomID)
		return participantJSON(p, q.pt())
	})
	s.route("DELETE /api/rooms/{room}/participants/{participant}", 204, nil, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		p := getParticipant(q.db, q.id("participant"))
		if p.RoomID != r.ID {
			fail(404, "participantNotFound")
		}
		must(q.db.Delete(&p).Error)
		q.changed(r.ID)
		return nil
	})
	s.issueRoutes()
	s.voteRoutes()
	s.mux.HandleFunc("GET /api/rooms/{room}/ws", s.websocket)
}

func (s *Server) issueRoutes() {
	s.route("POST /api/rooms/{room}/issues", 201, details, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		title := strings.TrimSpace(q.s("title"))
		if title == "" {
			return nil
		}
		t := timestamp()
		i := Issue{ID: identifier(), RoomID: r.ID, Title: title, Description: strings.TrimSpace(q.s("description")), Link: strings.TrimSpace(q.s("link")), Position: position(q.db, r.ID), CreatedAt: t}
		must(q.db.Create(&i).Error)
		r.ActiveIssueID = &i.ID
		r.Revealed = false
		r.UpdatedAt = t
		must(q.db.Save(&r).Error)
		q.changed(r.ID)
		return i
	})
	s.route("POST /api/rooms/{room}/issues/import", 201, []field{{name: "issues", kind: "array", children: []field{str("title"), optstr("description"), optstr("link"), optstr("estimate")}}}, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		pos := position(q.db, r.ID)
		t := timestamp()
		out := []Issue{}
		for offset, item := range q.data["issues"].([]any) {
			p := item.(map[string]any)
			title := strings.TrimSpace(stringValue(p, "title"))
			if title == "" {
				continue
			}
			i := Issue{ID: identifier(), RoomID: r.ID, Title: title, Description: strings.TrimSpace(stringValue(p, "description")), Link: strings.TrimSpace(stringValue(p, "link")), Position: pos + offset, CreatedAt: t}
			if e := strings.TrimSpace(stringValue(p, "estimate")); e != "" {
				i.Estimate = &e
			}
			must(q.db.Create(&i).Error)
			out = append(out, i)
		}
		if len(out) > 0 {
			if r.ActiveIssueID == nil {
				r.ActiveIssueID = &out[0].ID
				r.Revealed = false
				r.UpdatedAt = t
				must(q.db.Save(&r).Error)
			}
			q.changed(r.ID)
		}
		return out
	})
	s.route("PATCH /api/issues/{issue}", 200, details, func(q *request) any {
		i := getIssue(q.db, q.id("issue"))
		host(q.db, i.RoomID, q.ht())
		title := strings.TrimSpace(q.s("title"))
		if title == "" {
			fail(400, "storyTitleRequired")
		}
		i.Title = title
		i.Description = strings.TrimSpace(q.s("description"))
		i.Link = strings.TrimSpace(q.s("link"))
		must(q.db.Model(&i).Select("title", "description", "link").Updates(&i).Error)
		q.changed(i.RoomID)
		return i
	})
	s.route("DELETE /api/rooms/{room}/issues/{issue}", 204, nil, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		i := getIssue(q.db, q.id("issue"))
		if i.RoomID != r.ID {
			fail(404, "storyNotFound")
		}
		must(q.db.Delete(&i).Error)
		query := q.r.URL.Query()
		if (r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID) || query.Has("next_active_issue_id") {
			r.ActiveIssueID = nil
			if next := query.Get("next_active_issue_id"); next != "" {
				r.ActiveIssueID = &next
			}
			r.Revealed = false
			q.touch(&r)
		}
		q.changed(r.ID)
		return nil
	})
	s.route("PATCH /api/rooms/{room}/issues/{issue}/archive", 200, []field{nullable("nextActiveIssueId", true)}, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		i := getIssue(q.db, q.id("issue"))
		if i.RoomID != r.ID {
			fail(404, "storyNotFound")
		}
		t := timestamp()
		i.ArchivedAt = &t
		must(q.db.Save(&i).Error)
		if r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID {
			r.ActiveIssueID = nullableValue(q.data, "nextActiveIssueId")
			r.Revealed = false
			r.UpdatedAt = t
			must(q.db.Save(&r).Error)
		}
		q.changed(r.ID)
		return i
	})
	s.route("POST /api/rooms/{room}/issues/archive-estimated", 200, []field{nullable("nextActiveIssueId", true)}, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		out := []Issue{}
		must(q.db.Where("room_id = ? AND archived_at IS NULL AND estimate IS NOT NULL AND estimate <> ?", r.ID, "").Order("position").Find(&out).Error)
		t := timestamp()
		for j := range out {
			i := &out[j]
			i.ArchivedAt = &t
			must(q.db.Save(i).Error)
			if r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID {
				r.ActiveIssueID = nullableValue(q.data, "nextActiveIssueId")
				r.Revealed = false
				r.UpdatedAt = t
				must(q.db.Save(&r).Error)
			}
		}
		if len(out) > 0 {
			q.changed(r.ID)
		}
		return out
	})
	s.route("PATCH /api/rooms/{room}/issues/{issue}/unarchive", 200, nil, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		i := getIssue(q.db, q.id("issue"))
		if i.RoomID != r.ID {
			fail(404, "storyNotFound")
		}
		i.ArchivedAt = nil
		must(q.db.Save(&i).Error)
		q.changed(r.ID)
		return i
	})
	s.route("PATCH /api/rooms/{room}/active-issue", 204, []field{nullable("issueId", false)}, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		id := nullableValue(q.data, "issueId")
		if id != nil {
			i := getIssue(q.db, *id)
			if i.RoomID != r.ID {
				fail(404, "storyNotFound")
			}
		}
		r.ActiveIssueID = id
		r.Revealed = false
		q.touch(&r)
		q.changed(r.ID)
		return nil
	})
	s.route("PATCH /api/issues/{issue}/estimate", 204, []field{str("value")}, func(q *request) any {
		i := getIssue(q.db, q.id("issue"))
		host(q.db, i.RoomID, q.ht())
		i.Estimate = ptr(q.s("value"))
		must(q.db.Model(&i).Update("estimate", i.Estimate).Error)
		q.changed(i.RoomID)
		return nil
	})
}
func (s *Server) voteRoutes() {
	s.route("PUT /api/rooms/{room}/issues/{issue}/votes/{participant}", 204, []field{str("value")}, func(q *request) any {
		p := participant(q.db, q.id("participant"), q.pt())
		i := getIssue(q.db, q.id("issue"))
		if p.RoomID != q.id("room") || i.RoomID != q.id("room") {
			fail(404, "roomNotFound")
		}
		if p.IsSpectator {
			fail(403, "spectatorsCannotVote")
		}
		t := timestamp()
		v := Vote{ID: identifier(), RoomID: p.RoomID, IssueID: i.ID, ParticipantID: p.ID, Value: q.s("value"), CreatedAt: t, UpdatedAt: t}
		must(q.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "issue_id"}, {Name: "participant_id"}}, DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"})}).Create(&v).Error)
		q.changed(p.RoomID)
		return nil
	})
	s.route("PATCH /api/rooms/{room}/reveal", 204, nil, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		r.Revealed = true
		q.touch(&r)
		q.changed(r.ID)
		return nil
	})
	s.route("POST /api/rooms/{room}/issues/{issue}/reset-votes", 204, nil, func(q *request) any {
		r := host(q.db, q.id("room"), q.ht())
		i := getIssue(q.db, q.id("issue"))
		if i.RoomID != r.ID {
			fail(404, "storyNotFound")
		}
		must(q.db.Where("issue_id = ?", i.ID).Delete(&Vote{}).Error)
		r.Revealed = false
		q.touch(&r)
		q.changed(r.ID)
		return nil
	})
	s.route("DELETE /api/issues/{issue}/votes/{participant}", 204, nil, func(q *request) any {
		p := participant(q.db, q.id("participant"), q.pt())
		i := getIssue(q.db, q.id("issue"))
		if p.RoomID != i.RoomID {
			fail(404, "roomNotFound")
		}
		must(q.db.Where("issue_id = ? AND participant_id = ?", i.ID, p.ID).Delete(&Vote{}).Error)
		q.changed(p.RoomID)
		return nil
	})
}
