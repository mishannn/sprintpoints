package validation

import (
	"encoding/json"
	"io"
	"strings"
)

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
