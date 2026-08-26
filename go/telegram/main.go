package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

func webhookSecretToken(token, webhookUrl string) string {
	sum := sha256.Sum256([]byte(token + webhookUrl))
	return hex.EncodeToString(sum[:])
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	cfg, err := telegramConfig(ctx)
	if err != nil {
		panic(err)
	}

	opts := make([]bot.Option, 0)
	opts = append(opts, bot.WithDefaultHandler(handler(cfg.AdminChatID)), bot.WithNotAsyncHandlers(), bot.WithUpdatesChannelCap(0))

	var whSecretToken string
	if cfg.WebhookURL != nil {
		whSecretToken = webhookSecretToken(cfg.Token, *cfg.WebhookURL)
		opts = append(opts, bot.WithWebhookSecretToken(whSecretToken))
	}

	b, err := bot.New(cfg.Token, opts...)
	if err != nil {
		panic(err)
	}

	if cfg.WebhookURL != nil {
		whInfo, err := b.GetWebhookInfo(ctx)
		if err != nil {
			panic(err)
		}

		if whInfo == nil || whInfo.URL != *cfg.WebhookURL {
			_, err = b.SetWebhook(ctx, &bot.SetWebhookParams{
				URL:         *cfg.WebhookURL,
				SecretToken: whSecretToken,
			})
			if err != nil {
				panic(err)
			}
		}

		if err = runWebhook(ctx, b, whSecretToken); err != nil {
			panic(err)
		}
	} else {
		b.Start(ctx)
	}
}

func runWebhook(ctx context.Context, b *bot.Bot, whSecretToken string) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	srv := http.Server{
		Addr:    ":8080",
		Handler: lambdaWebhookHandler(b, whSecretToken),
	}

	go func() {
		<-ctx.Done()
		if err := srv.Shutdown(context.Background()); err != nil {
			slog.Error("error shutting down the echo server", "err", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil {
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}

	return nil
}

func lambdaWebhookHandler(b *bot.Bot, secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != secret {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var update models.Update
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			http.Error(w, "invalid update", http.StatusBadRequest)
			return
		}

		b.ProcessUpdate(r.Context(), &update)
		w.WriteHeader(http.StatusOK)
	}
}

func handler(adminChatId int64) func(ctx context.Context, b *bot.Bot, update *models.Update) {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		if update.Message.Chat.ID != adminChatId {
			return
		}

		_, err := b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   "pong: " + update.Message.Text,
		})

		if err != nil {
			slog.Warn("failed to send message", "err", err)
		}
	}
}
