package domain

import "time"

// Room holds the shared planning session and private host credential.
type Room struct {
	ID            string    `json:"id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	HostToken     string    `json:"-"`
	OwnerID       *string   `json:"owner_id"`
	CardSet       []string  `gorm:"serializer:json" json:"card_set"`
	Revealed      bool      `json:"revealed"`
	ActiveIssueID *string   `json:"active_issue_id"`
	CreatedAt     time.Time `gorm:"autoCreateTime:false" json:"created_at"`
	// UpdatedAt is explicitly managed by room operations, never GORM hooks.
	UpdatedAt time.Time `gorm:"autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}
