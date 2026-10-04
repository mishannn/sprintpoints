package domain

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// JSONStrings stores a card set as a JSON array in the database.
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
