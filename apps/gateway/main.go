package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/neighbr/gateway/handlers"
	"github.com/neighbr/gateway/hub"
	redisclient "github.com/neighbr/gateway/redis"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("[Gateway] No .env file, resing from enviroment")
	}

	if err := redisclient.Init(); err != nil {
		log.Fatalf("[Gateway] Redis init failed: %v", err)
	}

	// heartbeat goroutine refreshes presence for all connected users
	go hub.StartHeartBeat()

	mux := http.NewServeMux()

	// Websocket upgrade endpoint - all clients connect here
	mux.HandleFunc("GET /ws", handlers.HandleWS)

	// health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"gateway"}`)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	// graceful shutdown — finish in-flight connections before exiting
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig

		log.Println("[Gateway] Shutting down...")
		server.Close()
	}()

	log.Printf("[Gateway] Listening on port %s", port)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[Gateway] Server error: %v", err)
	}

}
