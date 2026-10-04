package validation

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestParseBoolAcceptsNumericJSONForms(t *testing.T) {
	for input, want := range map[string]bool{"1": true, "1e0": true, "0e1": false, "1.000": true, "0.00": false} {
		var value any
		dec := json.NewDecoder(bytes.NewBufferString(input))
		dec.UseNumber()
		if err := dec.Decode(&value); err != nil {
			t.Fatal(err)
		}
		got, ok := parseBool(value)
		if !ok || got != want {
			t.Errorf("parseBool(%s) = %v, %v; want %v, true", input, got, ok, want)
		}
	}
	if _, ok := parseBool(json.Number("1.5")); ok {
		t.Error("1.5 unexpectedly accepted")
	}
}

func TestParseContentTypeAndRawInput(t *testing.T) {
	fields := []Field{String("name")}
	for _, tc := range []struct {
		contentType string
		wantOK      bool
	}{
		{"", false}, {"application/json", true}, {"application/vnd.example+json", true}, {"text/plain", false},
	} {
		t.Run(tc.contentType, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/", bytes.NewBufferString(`{"name":"x"}`))
			if tc.contentType != "" {
				r.Header.Set("Content-Type", tc.contentType)
			}
			got, err := Parse(r, fields)
			if tc.wantOK {
				if err != nil || got["name"] != "x" {
					t.Errorf("got %#v, %v", got, err)
				}
			} else {
				if err == nil {
					t.Fatal("expected validation error")
				}
				if _, ok := err.(*Error); !ok {
					t.Fatalf("unexpected error %#v", err)
				}
			}
		})
	}
}

func TestValidationDoesNotNormalizeErrorInput(t *testing.T) {
	input := map[string]any{"enabled": json.Number("1e0"), "title": json.Number("4")}
	_, errs := validate(input, []Field{Boolean("enabled"), String("title")}, []any{"body"})
	if input["enabled"] != json.Number("1e0") {
		t.Fatalf("input mutated: %#v", input)
	}
	if got := errs[0].(map[string]any)["input"].(json.Number); got != json.Number("4") {
		t.Fatalf("error input changed: %#v", errs[0])
	}
}

func TestJSONInvalidUsesUnicodeCharacterOffset(t *testing.T) {
	raw := []byte(`{"x":"é",}`)
	var value any
	dec := json.NewDecoder(bytes.NewReader(raw))
	err := dec.Decode(&value)
	if err == nil {
		t.Fatal("expected invalid JSON")
	}
	got := jsonInvalid(raw, err)
	loc := got["loc"].([]any)
	if loc[1] != 9 {
		t.Fatalf("offset = %#v, want character offset 9", loc[1])
	}
}
