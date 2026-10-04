package domain

import (
	"time"
)

// Issue is a planned work item belonging to a room.
type Issue struct {
	ID          string     `json:"id"`
	RoomID      string     `json:"room_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Link        string     `json:"link"`
	Position    int        `json:"position"`
	Estimate    *string    `json:"estimate"`
	ArchivedAt  *time.Time `json:"archived_at"`
	CreatedAt   time.Time  `gorm:"autoCreateTime:false" json:"created_at"`
}
