//go:build !prod

package main

import "log/slog"

func init() {
	slog.SetLogLoggerLevel(slog.LevelDebug)
}
