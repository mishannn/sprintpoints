package httpapi

import (
	"strings"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

func (s *Server) createIssue(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	title := strings.TrimSpace(q.string("title"))
	if title == "" {
		return nil
	}
	t := nowUTC()
	i := domain.Issue{ID: newID(), RoomID: r.ID, Title: title, Description: strings.TrimSpace(q.string("description")), Link: strings.TrimSpace(q.string("link")), Position: nextIssuePosition(q.tx, r.ID), CreatedAt: t}
	must(q.tx.Create(&i).Error)
	r.ActiveIssueID = &i.ID
	r.Revealed = false
	r.UpdatedAt = t
	must(q.tx.Save(&r).Error)
	q.notifyRoom(r.ID)
	return i
}

func (s *Server) importIssues(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	pos := nextIssuePosition(q.tx, r.ID)
	t := nowUTC()
	out := []domain.Issue{}
	// Blank rows are skipped but retain their original position in the import.
	for offset, item := range q.data["issues"].([]any) {
		p := item.(map[string]any)
		title := strings.TrimSpace(stringValue(p, "title"))
		if title == "" {
			continue
		}
		i := domain.Issue{ID: newID(), RoomID: r.ID, Title: title, Description: strings.TrimSpace(stringValue(p, "description")), Link: strings.TrimSpace(stringValue(p, "link")), Position: pos + offset, CreatedAt: t}
		if e := strings.TrimSpace(stringValue(p, "estimate")); e != "" {
			i.Estimate = &e
		}
		must(q.tx.Create(&i).Error)
		out = append(out, i)
	}
	if len(out) > 0 {
		if r.ActiveIssueID == nil {
			r.ActiveIssueID = &out[0].ID
			r.Revealed = false
			r.UpdatedAt = t
			must(q.tx.Save(&r).Error)
		}
		q.notifyRoom(r.ID)
	}
	return out
}

func (s *Server) updateIssue(q *request) any {
	i := findIssue(q.tx, q.path("issue"))
	requireHost(q.tx, i.RoomID, q.hostToken())
	title := strings.TrimSpace(q.string("title"))
	if title == "" {
		fail(400, "storyTitleRequired")
	}
	i.Title = title
	i.Description = strings.TrimSpace(q.string("description"))
	i.Link = strings.TrimSpace(q.string("link"))
	must(q.tx.Model(&i).Select("title", "description", "link").Updates(&i).Error)
	q.notifyRoom(i.RoomID)
	return i
}

func (s *Server) deleteIssue(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	i := findIssue(q.tx, q.path("issue"))
	if i.RoomID != r.ID {
		fail(404, "storyNotFound")
	}
	must(q.tx.Delete(&i).Error)
	query := q.httpRequest.URL.Query()
	if (r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID) || query.Has("next_active_issue_id") {
		r.ActiveIssueID = nil
		if next := query.Get("next_active_issue_id"); next != "" {
			r.ActiveIssueID = &next
		}
		r.Revealed = false
		q.saveRoom(&r)
	}
	q.notifyRoom(r.ID)
	return nil
}

func (s *Server) archiveIssue(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	i := findIssue(q.tx, q.path("issue"))
	if i.RoomID != r.ID {
		fail(404, "storyNotFound")
	}
	t := nowUTC()
	i.ArchivedAt = &t
	must(q.tx.Save(&i).Error)
	if r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID {
		r.ActiveIssueID = nullableValue(q.data, "nextActiveIssueId")
		r.Revealed = false
		r.UpdatedAt = t
		must(q.tx.Save(&r).Error)
	}
	q.notifyRoom(r.ID)
	return i
}

func (s *Server) archiveEstimatedIssues(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	out := []domain.Issue{}
	must(q.tx.Where("room_id = ? AND archived_at IS NULL AND estimate IS NOT NULL AND estimate <> ?", r.ID, "").Order("position").Find(&out).Error)
	t := nowUTC()
	for j := range out {
		i := &out[j]
		i.ArchivedAt = &t
		must(q.tx.Save(i).Error)
		if r.ActiveIssueID != nil && *r.ActiveIssueID == i.ID {
			r.ActiveIssueID = nullableValue(q.data, "nextActiveIssueId")
			r.Revealed = false
			r.UpdatedAt = t
			must(q.tx.Save(&r).Error)
		}
	}
	if len(out) > 0 {
		q.notifyRoom(r.ID)
	}
	return out
}

func (s *Server) unarchiveIssue(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	i := findIssue(q.tx, q.path("issue"))
	if i.RoomID != r.ID {
		fail(404, "storyNotFound")
	}
	i.ArchivedAt = nil
	must(q.tx.Save(&i).Error)
	q.notifyRoom(r.ID)
	return i
}

func (s *Server) setActiveIssue(q *request) any {
	r := requireHost(q.tx, q.path("room"), q.hostToken())
	id := nullableValue(q.data, "issueId")
	if id != nil {
		i := findIssue(q.tx, *id)
		if i.RoomID != r.ID {
			fail(404, "storyNotFound")
		}
	}
	r.ActiveIssueID = id
	r.Revealed = false
	q.saveRoom(&r)
	q.notifyRoom(r.ID)
	return nil
}

func (s *Server) setEstimate(q *request) any {
	i := findIssue(q.tx, q.path("issue"))
	requireHost(q.tx, i.RoomID, q.hostToken())
	i.Estimate = stringPointer(q.string("value"))
	must(q.tx.Model(&i).Update("estimate", i.Estimate).Error)
	q.notifyRoom(i.RoomID)
	return nil
}
