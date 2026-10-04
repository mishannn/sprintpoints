package httpapi

import (
	"net"
	"net/http"
	"strings"
)

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	allowed := false
	wildcard := false
	for _, o := range s.origins {
		if o == "*" {
			allowed = true
			wildcard = true
		}
		if o == origin {
			allowed = true
		}
	}
	if origin != "" {
		if r.Method == "OPTIONS" && r.Header.Get("Access-Control-Request-Method") != "" {
			if !wildcard {
				w.Header().Add("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT")
			w.Header().Set("Access-Control-Max-Age", "600")
			if h := r.Header.Get("Access-Control-Request-Headers"); h != "" {
				w.Header().Set("Access-Control-Allow-Headers", h)
			}
			if allowed {
				if wildcard {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
				}
			}
			methodOK := false
			for _, m := range []string{"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"} {
				if m == r.Header.Get("Access-Control-Request-Method") {
					methodOK = true
				}
			}
			if !allowed || !methodOK {
				w.WriteHeader(400)
				failures := []string{}
				if !allowed {
					failures = append(failures, "origin")
				}
				if !methodOK {
					failures = append(failures, "method")
				}
				_, _ = w.Write([]byte("Disallowed CORS " + strings.Join(failures, ", ")))
			} else {
				_, _ = w.Write([]byte("OK"))
			}
			return
		}
		if allowed {
			if wildcard {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
			}
		}
	}
	// API failures stay JSON; slash redirects preserve the method and query string.
	_, pattern := s.mux.Handler(r)
	if pattern == "" && r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
		clone := r.Clone(r.Context())
		clone.URL.Path = strings.TrimSuffix(r.URL.Path, "/")
		matchedRoute := false
		for _, method := range []string{r.Method, "GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"} {
			probe := clone.Clone(clone.Context())
			probe.Method = method
			if _, matched := s.mux.Handler(probe); matched != "" {
				matchedRoute = true
				break
			}
		}
		if matchedRoute {
			// Use an absolute redirect and trust forwarded scheme only from loopback
			// proxies; the request Host still determines the destination.
			scheme := r.URL.Scheme
			if scheme == "" {
				scheme = "http"
				if r.TLS != nil {
					scheme = "https"
				}
			}
			if isLoopbackRemote(r.RemoteAddr) {
				if proto := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]); proto == "http" || proto == "https" {
					scheme = proto
				}
			}
			location := scheme + "://" + r.Host + clone.URL.RequestURI()
			w.Header().Set("Location", location)
			w.Header().Set("Content-Length", "0")
			w.WriteHeader(http.StatusTemporaryRedirect)
			return
		}
	}
	if pattern == "" || (r.Method == "HEAD" && strings.HasPrefix(pattern, "GET ")) {
		allowed := []string{}
		for _, method := range []string{"GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"} {
			clone := r.Clone(r.Context())
			clone.Method = method
			_, matched := s.mux.Handler(clone)
			if method == "HEAD" && !strings.HasPrefix(matched, "HEAD ") {
				continue
			}
			if matched != "" {
				allowed = append(allowed, method)
			}
		}
		if len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			writeJSON(w, 405, map[string]any{"detail": "Method Not Allowed"})
		} else {
			writeJSON(w, 404, map[string]any{"detail": "Not Found"})
		}
		return
	}
	s.mux.ServeHTTP(w, r)
}

func isLoopbackRemote(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
