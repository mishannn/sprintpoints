package validation

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
)

// Error carries the structured detail that an HTTP layer may put in a 422 response.
type Error struct{ Detail any }

func (e *Error) Error() string { return fmt.Sprint(e.Detail) }

// Parse reads and validates a request body. Callers decide how to map Error.Detail
// to their own transport response format.
func Parse(r *http.Request, fields []Field) (map[string]any, error) {
	body, readErr := io.ReadAll(r.Body)
	if readErr != nil {
		return nil, &Error{Detail: []any{jsonInvalid(body, readErr)}}
	}
	if len(body) == 0 {
		return nil, &Error{Detail: []any{validation("missing", "Field required", []any{"body"}, nil)}}
	}
	ct := r.Header.Get("Content-Type")
	isJSON := false
	if ct != "" {
		media, _, err := mime.ParseMediaType(ct)
		isJSON = err == nil && (strings.EqualFold(media, "application/json") || (strings.HasPrefix(strings.ToLower(media), "application/") && strings.HasSuffix(strings.ToLower(media), "+json")))
	}
	if !isJSON {
		_, errs := validate(string(body), fields, []any{"body"})
		if len(errs) == 0 {
			return nil, nil
		}
		return nil, &Error{Detail: errs}
	}
	var v any
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return nil, &Error{Detail: []any{jsonInvalid(body, err)}}
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return nil, &Error{Detail: []any{jsonInvalid(body, err)}}
	}
	if v == nil {
		return nil, &Error{Detail: []any{validation("missing", "Field required", []any{"body"}, nil)}}
	}
	obj, errs := validate(v, fields, []any{"body"})
	if len(errs) > 0 {
		return nil, &Error{Detail: errs}
	}
	return obj, nil
}
