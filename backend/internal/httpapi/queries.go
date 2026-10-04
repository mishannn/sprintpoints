package httpapi

import (
	"errors"

	"github.com/mishannn/sprintpoints/backend/internal/domain"

	"gorm.io/gorm"
)

func findRoom(db *gorm.DB, id string) domain.Room {
	var v domain.Room
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "roomNotFound")
	}
	must(err)
	return v
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
	var v domain.Issue
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "storyNotFound")
	}
	must(err)
	return v
}
func findParticipant(db *gorm.DB, id string) domain.Participant {
	var v domain.Participant
	err := db.First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(404, "participantNotFound")
	}
	must(err)
	return v
}
func nextIssuePosition(db *gorm.DB, id string) int {
	var n int
	must(db.Model(&domain.Issue{}).Select("COALESCE(MAX(position),0)+1").Where("room_id = ?", id).Scan(&n).Error)
	return n
}
