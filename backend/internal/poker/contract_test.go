package poker

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type legacyHTTPResult struct {
	Name        string   `json:"name"`
	Status      int      `json:"status"`
	Body        any      `json:"body"`
	Location    *string  `json:"location"`
	Allow       []string `json:"allow"`
	ContentType string   `json:"content_type"`
}

// This table records the legacy FastAPI HTTP contract so transport behavior
// remains covered after the Python implementation is removed.
func TestLegacyHTTPEdgeContract(t *testing.T) {
	fixtureBytes, err := os.ReadFile(filepath.Join("testdata", "http_contract.json"))
	if err != nil {
		t.Fatal(err)
	}
	var legacy []legacyHTTPResult
	if err := json.Unmarshal(fixtureBytes, &legacy); err != nil {
		t.Fatal(err)
	}
	wantByName := make(map[string]legacyHTTPResult, len(legacy))
	for _, item := range legacy {
		wantByName[item.Name] = item
	}
	f := newAPIFixture(t)
	status, created := f.request(http.MethodPost, "/api/rooms", map[string]any{
		"roomName": "Edges", "participantName": "Owner",
		"defaults": map[string]any{"roomName": "Fallback", "facilitatorName": "Facilitator", "firstStoryTitle": "First"},
	}, nil)
	if status != http.StatusCreated {
		t.Fatalf("create room: status=%d", status)
	}
	room := created["state"].(map[string]any)["room"].(map[string]any)
	code := room["code"].(string)

	tests := []struct {
		name, method, path, body, contentType string
		want                                  int
	}{
		{"null_body", "POST", "/api/rooms", `null`, "application/json", 422},
		{"empty_body_no_type", "POST", "/api/rooms", ``, "", 422},
		{"empty_body_plain", "POST", "/api/rooms", ``, "text/plain", 422},
		{"empty_body_json", "POST", "/api/rooms", ``, "application/json", 422},
		{"malformed_object", "POST", "/api/rooms", `{`, "application/json", 422},
		{"malformed_property", "POST", "/api/rooms", `{"x":1,}`, "application/json", 422},
		{"malformed_value", "POST", "/api/rooms", `{"x":}`, "application/json", 422},
		{"missing_colon", "POST", "/api/rooms", `{"x" 1}`, "application/json", 422},
		{"missing_comma", "POST", "/api/rooms", `{"x":1 "y":2}`, "application/json", 422},
		{"unterminated_string", "POST", "/api/rooms", `{"x":"abc}`, "application/json", 422},
		{"invalid_escape", "POST", "/api/rooms", `{"x":"\q"}`, "application/json", 422},
		{"invalid_unicode_escape", "POST", "/api/rooms", `{"x":"\uZZZZ"}`, "application/json", 422},
		{"literal_control", "POST", "/api/rooms", "{\"x\":\"a\nb\"}", "application/json", 422},
		{"trailing_data", "POST", "/api/rooms", `{} {}`, "application/json", 422},
		{"leading_zero", "POST", "/api/rooms", `{"x":01}`, "application/json", 422},
		{"unicode_error_offset", "POST", "/api/rooms", `{"я":1,}`, "application/json", 422},
		{"blank_whitespace", "POST", "/api/rooms", ` `, "application/json", 422},
		{"text_plain", "POST", "/api/rooms", `{"roomName":"Edges","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`, "text/plain", 422},
		{"json_without_type", "POST", "/api/rooms", `{"roomName":"Edges","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`, "", 422},
		{"vendor_json", "POST", "/api/rooms", `{"roomName":"Edges","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`, "application/vnd.test+json", 201},
		{"json_charset", "POST", "/api/rooms", `{"roomName":"Edges","participantName":"Owner","defaults":{"roomName":"Fallback","facilitatorName":"Facilitator","firstStoryTitle":"First"}}`, "application/json; charset=utf-8", 201},
		{"bool_exponent", "POST", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":1e0}`, "application/json", 201},
		{"bool_fraction_zero", "POST", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":0.000}`, "application/json", 201},
		{"bool_fraction_one", "POST", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":1.000}`, "application/json", 201},
		{"bool_invalid_float", "POST", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":1.5}`, "application/json", 422},
		{"bool_invalid_integer", "POST", "/api/rooms/" + code + "/join", `{"name":"Member","isSpectator":2}`, "application/json", 422},
		{"bool_string_preserved_input", "POST", "/api/rooms/" + code + "/join", `{"isSpectator":"yes"}`, "application/json", 422},
		{"head_docs", "HEAD", "/docs", ``, "", 200},
		{"head_redoc", "HEAD", "/redoc", ``, "", 200},
		{"head_openapi", "HEAD", "/openapi.json", ``, "", 200},
		{"head_oauth_redirect", "HEAD", "/docs/oauth2-redirect", ``, "", 200},
		{"head_health", "HEAD", "/api/health", ``, "", 405},
		{"slash_redirect", "GET", "/api/health/?x=1", ``, "", 307},
		{"slash_wrong_method", "POST", "/api/health/", ``, "", 307},
		{"unknown_slash", "GET", "/unknown/", ``, "", 404},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, f.h.URL+tc.path, bytes.NewBufferString(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			if tc.contentType != "" {
				req.Header.Set("Content-Type", tc.contentType)
			}
			client := *f.h.Client()
			client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
			response, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			responseBody, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			res := httptest.NewRecorder()
			res.Code = response.StatusCode
			for key, values := range response.Header {
				for _, value := range values {
					res.Header().Add(key, value)
				}
			}
			_, _ = res.Body.Write(responseBody)
			if res.Code != tc.want {
				t.Fatalf("status=%d want=%d body=%q", res.Code, tc.want, res.Body.String())
			}
			got := contractResult(tc.name, res, tc.name == "vendor_json" || tc.name == "json_charset", strings.HasPrefix(tc.name, "bool_"))
			if got.Location != nil {
				normalized := strings.Replace(*got.Location, f.h.URL, "$ORIGIN", 1)
				got.Location = &normalized
			}
			want, ok := wantByName[tc.name]
			if !ok {
				t.Fatalf("legacy fixture has no %q", tc.name)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("legacy response mismatch\n got: %#v (location %q)\nwant: %#v (location %q)", got, locationValue(got.Location), want, locationValue(want.Location))
			}
		})
	}

	// Exercise a missing schema on an isolated SQLite database, independent of
	// TEST_POSTGRES_URL so the test remains portable to PostgreSQL CI runs.
	db, err := OpenDatabase(sqliteURL(filepath.Join(t.TempDir(), "http-500.db")))
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	handler := NewServer(db, []string{"*"})
	defer handler.Close()
	h := httptest.NewRecorder()
	if err := db.Exec("DROP TABLE rooms").Error; err != nil {
		t.Fatal(err)
	}
	handler.ServeHTTP(h, httptest.NewRequest(http.MethodGet, "/api/rooms/unused", nil))
	got := contractResult("internal_error", h, false, false)
	want, ok := wantByName["internal_error"]
	if !ok {
		t.Fatal("legacy fixture has no internal_error")
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("legacy internal error mismatch: got %#v want %#v", got, want)
	}
}

func locationValue(location *string) string {
	if location == nil {
		return ""
	}
	return *location
}

func contractResult(name string, res *httptest.ResponseRecorder, roomCreate, boolJoin bool) legacyHTTPResult {
	var body any
	if res.Body.Len() > 0 {
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			body = strings.TrimSuffix(res.Body.String(), "\n")
		}
	}
	if res.Code == http.StatusCreated {
		if boolJoin {
			body = map[string]any{"is_spectator": body.(map[string]any)["participant"].(map[string]any)["is_spectator"]}
		}
		if roomCreate {
			body = map[string]any{"name": body.(map[string]any)["state"].(map[string]any)["room"].(map[string]any)["name"]}
		}
	}
	var location *string
	if got := res.Header().Get("Location"); got != "" {
		location = &got
	}
	allow := strings.Split(res.Header().Get("Allow"), ",")
	filtered := make([]string, 0, len(allow))
	for _, item := range allow {
		if item = strings.TrimSpace(item); item != "" {
			filtered = append(filtered, item)
		}
	}
	if filtered == nil {
		filtered = []string{}
	}
	ct := res.Header().Get("Content-Type")
	return legacyHTTPResult{Name: name, Status: res.Code, Body: body, Location: location, Allow: filtered, ContentType: ct}
}
