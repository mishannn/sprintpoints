package domain

import (
	"encoding/json"
	"time"
)

// Issue is a planned work item belonging to a room.
type Issue struct {
	ID          string     `gorm:"column:id;type:varchar(36);primaryKey" json:"id"`
	RoomID      string     `gorm:"column:room_id;type:varchar(36);not null;index:issues_room_id_position_idx,priority:1" json:"room_id"`
	Title       string     `gorm:"column:title;type:varchar(500);not null" json:"title"`
	Description string     `gorm:"column:description;type:text;not null" json:"description"`
	Link        string     `gorm:"column:link;type:varchar(2048);not null" json:"link"`
	Position    int        `gorm:"column:position;not null;index:issues_room_id_position_idx,priority:2" json:"position"`
	Estimate    *string    `gorm:"column:estimate;type:varchar(64)" json:"estimate"`
	ArchivedAt  *time.Time `gorm:"column:archived_at" json:"archived_at"`
	CreatedAt   time.Time  `gorm:"column:created_at;not null;autoCreateTime:false" json:"created_at"`
}

func (Issue) TableName() string { return "issues" }

func (i Issue) MarshalJSON() ([]byte, error) {
	type plain Issue
	var archivedAt *string
	if i.ArchivedAt != nil {
		value := FormatTimestamp(*i.ArchivedAt)
		archivedAt = &value
	}
	return json.Marshal(struct {
		plain
		CreatedAt  string  `json:"created_at"`
		ArchivedAt *string `json:"archived_at"`
	}{plain: plain(i), CreatedAt: FormatTimestamp(i.CreatedAt), ArchivedAt: archivedAt})
}
