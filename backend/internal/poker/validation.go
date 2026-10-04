package poker

import (
	"encoding/json"
	"io"
	"net/http"
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
				case string, json.Number:
					typ = "bool_parsing"
					msg = "Input should be a valid boolean, unable to interpret input"
				}
				errs = append(errs, validation(typ, msg, path, val))
			} else {
				obj[f.name] = b
			}
		case "object":
			_, e := validate(val, f.children, path)
			errs = append(errs, e...)
		case "array":
			arr, ok := val.([]any)
			if !ok {
				errs = append(errs, validation("list_type", "Input should be a valid list", path, val))
				continue
			}
			for i, item := range arr {
				_, e := validate(item, f.children, append(append([]any{}, path...), i))
				errs = append(errs, e...)
			}
		}
	}
	return obj, errs
}
func parseBool(v any) (bool, bool) {
	switch x := v.(type) {
	case bool:
		return x, true
	case json.Number:
		if x == "1" || x == "1.0" {
			return true, true
		}
		if x == "0" || x == "0.0" {
			return false, true
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
	var v any
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	err := dec.Decode(&v)
	if err != nil {
		if err == io.EOF {
			panic(apiError{422, []any{validation("missing", "Field required", []any{"body"}, nil)}})
		}
		panic(apiError{422, []any{validation("json_invalid", "JSON decode error", []any{"body"}, nil)}})
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		panic(apiError{422, []any{validation("json_invalid", "JSON decode error", []any{"body"}, nil)}})
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
func stringValue(p map[string]any, key string) string { s, _ := p[key].(string); return s }
func nullableValue(p map[string]any, key string) *string {
	if p[key] == nil {
		return nil
	}
	return ptr(p[key].(string))
}
