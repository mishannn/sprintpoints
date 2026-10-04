package domain

import "time"

// FormatTimestamp emits UTC timestamps with the same microsecond precision
// used by the API and persisted records.
func FormatTimestamp(t time.Time) string {
	t = t.UTC().Truncate(time.Microsecond)
	if t.Nanosecond() == 0 {
		return t.Format("2006-01-02T15:04:05Z")
	}
	return t.Format("2006-01-02T15:04:05.000000Z")
}
