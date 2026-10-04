package httpapi

import (
	"errors"

	"gorm.io/gorm"

	"github.com/mishannn/sprintpoints/backend/internal/domain"
)

func findByID[T any](db *gorm.DB, id, notFound string) T {
	var v T
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, notFound)
	}
	must(err)
	return v
}
func findRoom(db *gorm.DB, id string) domain.Room {
	return findByID[domain.Room](db, id, "roomNotFound")
}
func findRoomByCode(db *gorm.DB, code string) domain.Room {
	var v domain.Room
	err := db.First(&v, "code = ?", normalizeRoomCode(code)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "roomNotFound")
	}
	must(err)
	return v
}
func findIssue(db *gorm.DB, id string) domain.Issue {
	return findByID[domain.Issue](db, id, "storyNotFound")
}
func findParticipant(db *gorm.DB, id string) domain.Participant {
	return findByID[domain.Participant](db, id, "participantNotFound")
}
func nextIssuePosition(db *gorm.DB, id string) int {
	var n int
	must(db.Model(&domain.Issue{}).Select("COALESCE(MAX(position),0)+1").Where("room_id = ?", id).Scan(&n).Error)
	return n
}
