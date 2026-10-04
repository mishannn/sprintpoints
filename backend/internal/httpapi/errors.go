package httpapi

type apiError struct {
	status int
	detail string
}

// fail unwinds the handler so GORM rolls back before the HTTP boundary responds.
func fail(code int, detail string) { panic(apiError{code, detail}) }
func must(err error) {
	if err != nil {
		panic(err)
	}
}
