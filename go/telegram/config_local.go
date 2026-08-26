//go:build !lambda

package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
)

func telegramConfig(ctx context.Context) (Config, error) {
	adminChatID, err := strconv.ParseInt(os.Getenv("TELEGRAM_ADMIN_CHAT_ID"), 10, 64)
	if err != nil {
		return Config{}, fmt.Errorf("failed to parse admin chat id: %w", err)
	}

	return Config{
		Token:       os.Getenv("TELEGRAM_TOKEN"),
		WebhookURL:  nil,
		AdminChatID: adminChatID,
	}, nil
}
