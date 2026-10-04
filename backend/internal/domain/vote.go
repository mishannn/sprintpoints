package domain

import (
	"time"
)

// Vote is one participant's estimate for an issue.
type Vote struct {
	ID            string    `json:"id"`
	RoomID        string    `json:"room_id"`
	IssueID       string    `json:"issue_id"`
	ParticipantID string    `json:"participant_id"`
	Value         string    `json:"value"`
	CreatedAt     time.Time `gorm:"autoCreateTime:false" json:"created_at"`
	// UpdatedAt is set by vote operations; automatic ORM updates would distort history.
	UpdatedAt time.Time `gorm:"autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}
