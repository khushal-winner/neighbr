package redis 

import (
	"context"
	"fmt"
	"os"

	goredis "github.com/redis/go-redis/v9"
)

var Client *goredis.Client

// init connects once at startup - all handlers share the client
func Init() error {
	opt, err := goredis.ParseURL(os.Getenv("REDIS_URL"))
	if err != nil {
		return fmt.Errorf("invalid REDIS_URL: %w", err)
	}

	Client = goredis.NewClient(opt)
	
	// verify connection is alive before accepting traffic
	if err := Client.Ping(context.Background()).Err(); err != nil {
		return fmt.Errorf("redis ping failed: %w", err)
	}

	fmt.Println("[Redis] connected")
	return nil
}
