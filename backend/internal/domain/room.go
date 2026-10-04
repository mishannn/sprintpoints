package domain

import "time"

// Room holds the shared planning session and private host credential.
type Room struct {
	ID            string      `gorm:"column:id;type:varchar(36);primaryKey" json:"id"`
	Code          string      `gorm:"column:code;type:varchar(16);not null;uniqueIndex:ix_rooms_code" json:"code"`
	Name          string      `gorm:"column:name;type:varchar(255);not null" json:"name"`
	HostToken     string      `gorm:"column:host_token;type:varchar(255);not null;unique" json:"-"`
	OwnerID       *string     `gorm:"column:owner_id;type:varchar(36)" json:"owner_id"`
	CardSet       JSONStrings `gorm:"column:card_set;type:json;not null" json:"card_set"`
	Revealed      bool        `gorm:"column:revealed;not null" json:"revealed"`
	ActiveIssueID *string     `gorm:"column:active_issue_id;type:varchar(36)" json:"active_issue_id"`
	CreatedAt     time.Time   `gorm:"column:created_at;not null;autoCreateTime:false" json:"created_at"`
	// UpdatedAt is explicitly managed by room operations, never GORM hooks.
	UpdatedAt time.Time `gorm:"column:updated_at;not null;autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}

func (Room) TableName() string { return "rooms" }
