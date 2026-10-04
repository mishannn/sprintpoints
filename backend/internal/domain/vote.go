package domain

import (
	"encoding/json"
	"time"
)

// Vote is one participant's estimate for an issue.
type Vote struct {
	ID            string    `gorm:"column:id;type:varchar(36);primaryKey" json:"id"`
	RoomID        string    `gorm:"column:room_id;type:varchar(36);not null;index:votes_room_id_idx" json:"room_id"`
	IssueID       string    `gorm:"column:issue_id;type:varchar(36);not null;uniqueIndex:uq_votes_issue_participant,priority:1" json:"issue_id"`
	ParticipantID string    `gorm:"column:participant_id;type:varchar(36);not null;uniqueIndex:uq_votes_issue_participant,priority:2" json:"participant_id"`
	Value         string    `gorm:"column:value;type:varchar(64);not null" json:"value"`
	CreatedAt     time.Time `gorm:"column:created_at;not null;autoCreateTime:false" json:"created_at"`
	// UpdatedAt is set by vote operations; automatic ORM updates would distort history.
	UpdatedAt time.Time `gorm:"column:updated_at;not null;autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}

func (Vote) TableName() string { return "votes" }

func (v Vote) MarshalJSON() ([]byte, error) {
	type plain Vote
	return json.Marshal(struct {
		plain
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	}{plain: plain(v), CreatedAt: FormatTimestamp(v.CreatedAt), UpdatedAt: FormatTimestamp(v.UpdatedAt)})
}
