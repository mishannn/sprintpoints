package httpapi

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strings"
	"time"

	"github.com/google/uuid"
)

func tokensEqual(a, b string) bool {
	return a != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func nowUTC() time.Time { return time.Now().UTC().Truncate(time.Microsecond) }
func newID() string     { return uuid.NewString() }
func newToken() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	must(err)
	return base64.RawURLEncoding.EncodeToString(b)
}
func stringPointer(s string) *string    { return &s }
func normalizeRoomCode(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }
