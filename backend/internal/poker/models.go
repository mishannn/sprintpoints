package poker

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// formatISO matches datetime.isoformat() for persisted UTC timestamps: omit
// fractional seconds at whole-second precision and otherwise emit six digits.
func formatISO(t time.Time) string {
	t = t.UTC().Truncate(time.Microsecond)
	if t.Nanosecond() == 0 {
		return t.Format("2006-01-02T15:04:05Z")
	}
	return t.Format("2006-01-02T15:04:05.000000Z")
}

// CardSet stores the JSON array used by SQLAlchemy's JSON column.
type JSONStrings []string

func (c JSONStrings) Value() (driver.Value, error) {
	b, err := json.Marshal([]string(c))
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (c *JSONStrings) Scan(value any) error {
	if value == nil {
		*c = nil
		return nil
	}
	var b []byte
	switch v := value.(type) {
	case []byte:
		b = v
	case string:
		b = []byte(v)
	default:
		return fmt.Errorf("cannot scan %T into JSONStrings", value)
	}
	return json.Unmarshal(b, c)
}

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
	UpdatedAt     time.Time   `gorm:"column:updated_at;not null;autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}

func (Room) TableName() string { return "rooms" }

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
		value := formatISO(*i.ArchivedAt)
		archivedAt = &value
	}
	return json.Marshal(struct {
		plain
		CreatedAt  string  `json:"created_at"`
		ArchivedAt *string `json:"archived_at"`
	}{plain: plain(i), CreatedAt: formatISO(i.CreatedAt), ArchivedAt: archivedAt})
}

type Vote struct {
	ID            string    `gorm:"column:id;type:varchar(36);primaryKey" json:"id"`
	RoomID        string    `gorm:"column:room_id;type:varchar(36);not null;index:votes_room_id_idx" json:"room_id"`
	IssueID       string    `gorm:"column:issue_id;type:varchar(36);not null;uniqueIndex:uq_votes_issue_participant,priority:1" json:"issue_id"`
	ParticipantID string    `gorm:"column:participant_id;type:varchar(36);not null;uniqueIndex:uq_votes_issue_participant,priority:2" json:"participant_id"`
	Value         string    `gorm:"column:value;type:varchar(64);not null" json:"value"`
	CreatedAt     time.Time `gorm:"column:created_at;not null;autoCreateTime:false" json:"created_at"`
	UpdatedAt     time.Time `gorm:"column:updated_at;not null;autoCreateTime:false;autoUpdateTime:false" json:"updated_at"`
}

func (Vote) TableName() string { return "votes" }

func (v Vote) MarshalJSON() ([]byte, error) {
	type plain Vote
	return json.Marshal(struct {
		plain
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	}{plain: plain(v), CreatedAt: formatISO(v.CreatedAt), UpdatedAt: formatISO(v.UpdatedAt)})
}
