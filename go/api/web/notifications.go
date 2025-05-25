package web

import (
	"fmt"
	"github.com/labstack/echo/v4"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type notificationType string

const (
	notificationTypeSuccess    = notificationType("success")
	notificationTypeInfo       = notificationType("info")
	notificationTypeWarning    = notificationType("warning")
	notificationTypeError      = notificationType("error")
	notificationTypeInProgress = notificationType("in-progress")
)

type notification struct {
	Type    notificationType `json:"type"`
	Header  string           `json:"header,omitempty"`
	Content string           `json:"content,omitempty"`
}

type NotificationHandler struct {
	versionTxtPath string
}

func NewNotificationHandler(versionTxtPath string) *NotificationHandler {
	return &NotificationHandler{versionTxtPath: versionTxtPath}
}

func (nh *NotificationHandler) Notifications(c echo.Context) error {
	f, err := os.Open(nh.versionTxtPath)
	if err != nil {
		return err
	}
	defer f.Close()

	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}

	t, err := time.Parse(time.RFC3339, string(b))
	if err != nil {
		return err
	}

	notifications := make([]notification, 0)
	if timeSinceLastUpdate := time.Since(t); timeSinceLastUpdate >= time.Hour*36 {
		notifications = append(notifications, notification{
			Type:    notificationTypeInfo,
			Header:  "Issues with the Lufthansa API",
			Content: fmt.Sprintf("The official Lufthansa API experiences issues right now. The schedules have last been updated at %s (%s ago).", t.Format(time.RFC3339), nh.humanReadableDuration(timeSinceLastUpdate)),
		})
	}

	return c.JSON(http.StatusOK, notifications)
}

func (nh *NotificationHandler) humanReadableDuration(d time.Duration) string {
	var parts []string
	if d >= time.Hour*24 {
		days := d / (time.Hour * 24)
		d %= time.Hour * 24
		parts = append(parts, fmt.Sprintf("%d days", days))
	}

	if d >= time.Hour {
		hours := d / time.Hour
		d %= time.Hour
		parts = append(parts, fmt.Sprintf("%d hours", hours))
	}

	return strings.Join(parts, " ")
}
