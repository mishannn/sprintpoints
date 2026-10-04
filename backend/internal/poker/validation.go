package poker

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
)

// payload validates the request before entering a transaction, including required
// versus nullable fields. Unknown fields are ignored, matching Pydantic defaults.
type field struct {
	name, kind         string
	optional, nullable bool
	children           []field
}

func str(name string) field     { return field{name: name, kind: "string"} }
func optstr(name string) field  { return field{name: name, kind: "string", optional: true} }
func boolean(name string) field { return field{name: name, kind: "bool"} }
func nullable(name string, optional bool) field {
	return field{name: name, kind: "string", optional: optional, nullable: true}
}

var details = []field{str("title"), optstr("description"), optstr("link")}

func validation(typ, msg string, loc []any, input any) map[string]any {
	return map[string]any{"type": typ, "loc": loc, "msg": msg, "input": input}
}
func validate(v any, fields []field, loc []any) (map[string]any, []any) {
	obj, ok := v.(map[string]any)
	if !ok {
		return nil, []any{validation("model_attributes_type", "Input should be a valid dictionary or object to extract fields from", loc, v)}
	}
	out := make(map[string]any, len(obj))
	for k, value := range obj {
		out[k] = value
	}
	errs := []any{}
	for _, f := range fields {
		path := append(append([]any{}, loc...), f.name)
		val, exists := obj[f.name]
		if !exists {
			if !f.optional {
				errs = append(errs, validation("missing", "Field required", path, obj))
			}
			continue
		}
		if val == nil && f.nullable {
			continue
		}
		switch f.kind {
		case "string":
			if _, ok := val.(string); !ok {
				errs = append(errs, validation("string_type", "Input should be a valid string", path, val))
			}
		case "bool":
			b, valid := parseBool(val)
			if !valid {
				typ, msg := "bool_type", "Input should be a valid boolean"
				switch val.(type) {
				case string:
					typ = "bool_parsing"
					msg = "Input should be a valid boolean, unable to interpret input"
				case json.Number:
					n := string(val.(json.Number))
					if !strings.ContainsAny(n, ".eE") {
						typ = "bool_parsing"
						msg = "Input should be a valid boolean, unable to interpret input"
					}
				}
				errs = append(errs, validation(typ, msg, path, val))
			} else {
				// Keep the decoded request intact: Pydantic's error `input` values
				// refer to the original input, even when another field is coerced.
				out[f.name] = b
			}
		case "object":
			normalized, e := validate(val, f.children, path)
			if normalized != nil {
				out[f.name] = normalized
			}
			errs = append(errs, e...)
		case "array":
			arr, ok := val.([]any)
			if !ok {
				errs = append(errs, validation("list_type", "Input should be a valid list", path, val))
				continue
			}
			normalized := make([]any, len(arr))
			for i, item := range arr {
				child, e := validate(item, f.children, append(append([]any{}, path...), i))
				if child != nil {
					normalized[i] = child
				} else {
					normalized[i] = item
				}
				errs = append(errs, e...)
			}
			out[f.name] = normalized
		}
	}
	return out, errs
}
func parseBool(v any) (bool, bool) {
	switch x := v.(type) {
	case bool:
		return x, true
	case json.Number:
		if n, err := strconv.ParseFloat(string(x), 64); err == nil {
			if n == 1 {
				return true, true
			}
			if n == 0 {
				return false, true
			}
		}
	case string:
		switch strings.ToLower(x) {
		case "1", "on", "t", "true", "y", "yes":
			return true, true
		case "0", "off", "f", "false", "n", "no":
			return false, true
		}
	}
	return false, false
}
func payload(r *http.Request, fields []field) map[string]any {
	body, readErr := io.ReadAll(r.Body)
	if readErr != nil {
		panic(apiError{422, []any{jsonInvalid(body, readErr)}})
	}
	if len(body) == 0 {
		panic(apiError{422, []any{validation("missing", "Field required", []any{"body"}, nil)}})
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
			return nil
		}
		panic(apiError{422, errs})
	}
	var v any
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.UseNumber()
	err := dec.Decode(&v)
	if err != nil {
		if err == io.EOF && len(body) == 0 {
			panic(apiError{422, []any{validation("missing", "Field required", []any{"body"}, nil)}})
		}
		panic(apiError{422, []any{jsonInvalid(body, err)}})
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		panic(apiError{422, []any{jsonInvalid(body, err)}})
	}
	if v == nil {
		panic(apiError{422, []any{validation("missing", "Field required", []any{"body"}, nil)}})
	}
	obj, errs := validate(v, fields, []any{"body"})
	if len(errs) > 0 {
		panic(apiError{422, errs})
	}
	return obj
}

// jsonInvalid maps encoding/json's byte-based syntax positions and diagnostics
// to the shape emitted by Python's JSON decoder / Pydantic.
func jsonInvalid(raw []byte, err any) map[string]any {
	msg, off := diagnoseJSON(string(raw))
	if msg == "" {
		msg, off = "Expecting value", 0
	}
	// The grammar scanner handles valid JSON syntax diagnostics and Unicode
	// offsets. Keep encoding/json as the authority for its uncommon failures.
	if _, ok := err.(*json.SyntaxError); !ok {
		if err == io.EOF && len(raw) == 0 {
			msg, off = "", 0
		}
	}
	if msg == "" {
		return validation("missing", "Field required", []any{"body"}, nil)
	}
	return map[string]any{"type": "json_invalid", "loc": []any{"body", off}, "msg": "JSON decode error", "input": map[string]any{}, "ctx": map[string]any{"error": msg}}
}

// diagnoseJSON is a small recursive-descent diagnostic scanner. The standard
// decoder still decides acceptance; this scanner only mirrors Python's error
// category and character position for malformed JSON.
type jsonScanner struct {
	r   []rune
	i   int
	msg string
	pos int
}

func diagnoseJSON(s string) (string, int) {
	p := &jsonScanner{r: []rune(s)}
	p.ws()
	if p.i == len(p.r) {
		return "Expecting value", p.i
	}
	if !p.value() {
		return p.msg, p.pos
	}
	p.ws()
	if p.i < len(p.r) {
		return "Extra data", p.i
	}
	return "", 0
}
func (p *jsonScanner) fail(msg string) bool { p.msg, p.pos = msg, p.i; return false }
func (p *jsonScanner) ws() {
	for p.i < len(p.r) && (p.r[p.i] == ' ' || p.r[p.i] == '\n' || p.r[p.i] == '\r' || p.r[p.i] == '\t') {
		p.i++
	}
}
func (p *jsonScanner) value() bool {
	p.ws()
	if p.i >= len(p.r) {
		return p.fail("Expecting value")
	}
	switch p.r[p.i] {
	case '{':
		return p.object()
	case '[':
		return p.array()
	case '"':
		return p.str()
	case 't':
		return p.literal("true")
	case 'f':
		return p.literal("false")
	case 'n':
		return p.literal("null")
	default:
		if p.r[p.i] == '-' || (p.r[p.i] >= '0' && p.r[p.i] <= '9') {
			return p.number()
		}
		return p.fail("Expecting value")
	}
}
func (p *jsonScanner) literal(word string) bool {
	start := p.i
	for _, c := range word {
		if p.i >= len(p.r) || p.r[p.i] != c {
			p.i = start
			return p.fail("Expecting value")
		}
		p.i++
	}
	return true
}
func (p *jsonScanner) str() bool {
	start := p.i
	p.i++
	for p.i < len(p.r) {
		c := p.r[p.i]
		if c == '"' {
			p.i++
			return true
		}
		if c < 0x20 {
			return p.fail("Invalid control character at")
		}
		if c != '\\' {
			p.i++
			continue
		}
		escapePos := p.i
		p.i++
		if p.i >= len(p.r) {
			p.i = start
			return p.fail("Unterminated string starting at")
		}
		e := p.r[p.i]
		if strings.ContainsRune(`"\\/bfnrt`, e) {
			p.i++
			continue
		}
		if e == 'u' {
			p.i++
			for n := 0; n < 4; n++ {
				if p.i >= len(p.r) || !isHex(p.r[p.i]) {
					p.msg = "Invalid \\uXXXX escape"
					p.pos = escapePos + 1
					return false
				}
				p.i++
			}
			continue
		}
		p.pos = escapePos
		p.msg = "Invalid \\escape"
		return false
	}
	p.i = start
	return p.fail("Unterminated string starting at")
}
func isHex(c rune) bool { return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' }
func (p *jsonScanner) object() bool {
	p.i++
	p.ws()
	if p.i >= len(p.r) {
		return p.fail("Expecting property name enclosed in double quotes")
	}
	if p.r[p.i] == '}' {
		p.i++
		return true
	}
	for {
		if p.i >= len(p.r) || p.r[p.i] != '"' {
			return p.fail("Expecting property name enclosed in double quotes")
		}
		if !p.str() {
			return false
		}
		p.ws()
		if p.i >= len(p.r) || p.r[p.i] != ':' {
			return p.fail("Expecting ':' delimiter")
		}
		p.i++
		if !p.value() {
			return false
		}
		p.ws()
		if p.i >= len(p.r) || p.r[p.i] != '}' && p.r[p.i] != ',' {
			return p.fail("Expecting ',' delimiter")
		}
		if p.r[p.i] == '}' {
			p.i++
			return true
		}
		p.i++
		p.ws()
	}
}
func (p *jsonScanner) array() bool {
	p.i++
	p.ws()
	if p.i < len(p.r) && p.r[p.i] == ']' {
		p.i++
		return true
	}
	for {
		if !p.value() {
			return false
		}
		p.ws()
		if p.i >= len(p.r) || p.r[p.i] != ']' && p.r[p.i] != ',' {
			return p.fail("Expecting ',' delimiter")
		}
		if p.r[p.i] == ']' {
			p.i++
			return true
		}
		p.i++
		p.ws()
	}
}
func (p *jsonScanner) number() bool {
	start := p.i
	if p.r[p.i] == '-' {
		p.i++
	}
	if p.i >= len(p.r) {
		return p.fail("Expecting value")
	}
	if p.r[p.i] == '0' {
		p.i++
	} else if p.r[p.i] >= '1' && p.r[p.i] <= '9' {
		for p.i < len(p.r) && p.r[p.i] >= '0' && p.r[p.i] <= '9' {
			p.i++
		}
	} else {
		p.i = start
		return p.fail("Expecting value")
	}
	if p.i < len(p.r) && p.r[p.i] == '.' {
		p.i++
		d := p.i
		for p.i < len(p.r) && p.r[p.i] >= '0' && p.r[p.i] <= '9' {
			p.i++
		}
		if d == p.i {
			return p.fail("Expecting value")
		}
	}
	if p.i < len(p.r) && (p.r[p.i] == 'e' || p.r[p.i] == 'E') {
		p.i++
		if p.i < len(p.r) && (p.r[p.i] == '+' || p.r[p.i] == '-') {
			p.i++
		}
		d := p.i
		for p.i < len(p.r) && p.r[p.i] >= '0' && p.r[p.i] <= '9' {
			p.i++
		}
		if d == p.i {
			return p.fail("Expecting value")
		}
	}
	return true
}
func stringValue(p map[string]any, key string) string { s, _ := p[key].(string); return s }
func nullableValue(p map[string]any, key string) *string {
	if p[key] == nil {
		return nil
	}
	return ptr(p[key].(string))
}
