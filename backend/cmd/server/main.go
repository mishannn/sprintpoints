package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mishannn/sprintpoints/backend/internal/httpapi"
	"github.com/mishannn/sprintpoints/backend/internal/storage"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "check the running server and exit")
	flag.Parse()
	if *healthcheck {
		client := http.Client{Timeout: 4 * time.Second}
		r, err := client.Get("http://127.0.0.1:8000/api/health")
		if err != nil {
			os.Exit(1)
		}
		_ = r.Body.Close()
		if r.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	db, err := storage.OpenDatabase(storage.DatabaseURLFromEnv())
	if err != nil {
		log.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	defer sqlDB.Close()
	origins := []string{}
	originEnv, ok := os.LookupEnv("PLANNING_POKER_CORS_ORIGINS")
	if !ok {
		originEnv = "*"
	}
	for _, v := range strings.Split(originEnv, ",") {
		if v = strings.TrimSpace(v); v != "" {
			origins = append(origins, v)
		}
	}
	handler := httpapi.NewServer(db, origins)
	defer handler.Close()
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8000"
	}
	server := &http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()
	log.Printf("Sprint Points listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
