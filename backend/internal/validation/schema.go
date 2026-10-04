// Package validation parses request bodies and validates them against small
// schemas, without depending on an HTTP application or response framework.
package validation

import (
	"encoding/json"
	"strconv"
	"strings"
)

// Field describes one validated value. Kind is string, bool, object, or array.
type Field struct {
	Name     string
	Kind     string
	Optional bool
	Nullable bool
	Children []Field
}

func String(name string) Field         { return Field{Name: name, Kind: "string"} }
func Boolean(name string) Field        { return Field{Name: name, Kind: "bool"} }
func OptionalString(name string) Field { return Field{Name: name, Kind: "string", Optional: true} }
func Nullable(name string, optional bool) Field {
	return Field{Name: name, Kind: "string", Optional: optional, Nullable: true}
}

// Details is the shared title/description/link schema used by issue endpoints.
var Details = []Field{String("title"), OptionalString("description"), OptionalString("link")}

func validation(typ, msg string, loc []any, input any) map[string]any {
	return map[string]any{"type": typ, "loc": loc, "msg": msg, "input": input}
}

func validate(v any, fields []Field, loc []any) (map[string]any, []any) {
	obj, ok := v.(map[string]any)
	if !ok {
		return nil, []any{validation("model_attributes_type", "Input should be a valid dictionary or object to extract fields from", loc, v)}
	}
	// Coercion operates on a normalized copy so the original decoded input stays
	// available for precise validation error details.
	out := make(map[string]any, len(obj))
	for k, value := range obj {
		out[k] = value
	}
	var errs []any
	for _, f := range fields {
		path := append(append([]any{}, loc...), f.Name)
		val, exists := obj[f.Name]
		if !exists {
			if !f.Optional {
				errs = append(errs, validation("missing", "Field required", path, obj))
			}
			continue
		}
		if val == nil && f.Nullable {
			continue
		}
		switch f.Kind {
		case "string":
			if _, ok := val.(string); !ok {
				errs = append(errs, validation("string_type", "Input should be a valid string", path, val))
			}
		case "bool":
			b, valid := parseBool(val)
			if !valid {
				typ, msg := "bool_type", "Input should be a valid boolean"
				switch x := val.(type) {
				case string:
					typ, msg = "bool_parsing", "Input should be a valid boolean, unable to interpret input"
				case json.Number:
					if !strings.ContainsAny(string(x), ".eE") {
						typ, msg = "bool_parsing", "Input should be a valid boolean, unable to interpret input"
					}
				}
				errs = append(errs, validation(typ, msg, path, val))
			} else {
				out[f.Name] = b
			}
		case "object":
			normalized, e := validate(val, f.Children, path)
			if normalized != nil {
				out[f.Name] = normalized
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
				child, e := validate(item, f.Children, append(append([]any{}, path...), i))
				if child != nil {
					normalized[i] = child
				} else {
					normalized[i] = item
				}
				errs = append(errs, e...)
			}
			out[f.Name] = normalized
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
