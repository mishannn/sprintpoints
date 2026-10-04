package domain

import "time"

// Participant represents a room member; Token is a credential and must not
// be exposed in JSON responses.
type Participant struct {
	ID          string    `json:"id"`
	RoomID      string    `json:"room_id"`
	Name        string    `json:"name"`
	Token       string    `json:"-"`
	IsSpectator bool      `json:"is_spectator"`
	LastSeenAt  time.Time `gorm:"autoCreateTime:false" json:"last_seen_at"`
	CreatedAt   time.Time `gorm:"autoCreateTime:false" json:"created_at"`
}
