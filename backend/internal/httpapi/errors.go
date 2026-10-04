package httpapi

import (
	"fmt"
)

type apiError struct {
	status int
	detail any
}

func (e apiError) Error() string { return fmt.Sprint(e.detail) }

// fail unwinds the handler so GORM rolls back before the HTTP boundary responds.
func fail(code int, detail string) { panic(apiError{code, detail}) }
func must(err error) {
	if err != nil {
		panic(err)
	}
}
