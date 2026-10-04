package httpapi

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"
)

func tokensEqual(a, b string) bool {
	return a != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func nowUTC() time.Time { return time.Now().UTC().Truncate(time.Microsecond) }
func newID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	must(err)
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	s := hex.EncodeToString(b)
	return s[:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:]
}
func newToken() string {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	must(err)
	return base64.RawURLEncoding.EncodeToString(b)
}
func stringPointer(s string) *string    { return &s }
func normalizeRoomCode(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }
