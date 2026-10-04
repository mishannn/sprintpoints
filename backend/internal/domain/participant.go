package domain

import "time"

// Participant represents a room member; Token is a credential and must not
// be exposed in JSON responses.
type Participant struct {
	ID          string    `gorm:"column:id;type:varchar(36);primaryKey" json:"id"`
	RoomID      string    `gorm:"column:room_id;type:varchar(36);not null;index:participants_room_id_idx" json:"room_id"`
	Name        string    `gorm:"column:name;type:varchar(255);not null" json:"name"`
	Token       string    `gorm:"column:token;type:varchar(255);not null;unique" json:"-"`
	IsSpectator bool      `gorm:"column:is_spectator;not null" json:"is_spectator"`
	LastSeenAt  time.Time `gorm:"column:last_seen_at;not null;autoCreateTime:false" json:"last_seen_at"`
	CreatedAt   time.Time `gorm:"column:created_at;not null;autoCreateTime:false" json:"created_at"`
}

func (Participant) TableName() string { return "participants" }
