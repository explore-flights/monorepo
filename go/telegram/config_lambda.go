//go:build lambda

package main

import (
	"context"
	"fmt"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

func telegramConfig(ctx context.Context) (Config, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return Config{}, fmt.Errorf("failed to load default config: %w", err)
	}

	ssmc := ssm.NewFromConfig(cfg)
	resp, err := ssmc.GetParameters(ctx, &ssm.GetParametersInput{
		Names:          []string{"/telegram/token", "/telegram/webhookurl", "/telegram/admin-chat-id"},
		WithDecryption: aws.Bool(true),
	})
	if err != nil {
		return Config{}, fmt.Errorf("failed to get telegram parameters: %w", err)
	}

	var result Config
	for _, p := range resp.Parameters {
		switch *p.Name {
		case "/telegram/token":
			result.Token = *p.Value
		case "/telegram/webhookurl":
			result.WebhookURL = p.Value
		case "/telegram/admin-chat-id":
			result.AdminChatID, err = strconv.ParseInt(*p.Value, 10, 64)
			if err != nil {
				return Config{}, fmt.Errorf("failed to parse admin chat id: %w", err)
			}
		}
	}

	return result, nil
}
