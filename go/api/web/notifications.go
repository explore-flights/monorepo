package web

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
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
	version string
}

func NewNotificationHandler(version string) *NotificationHandler {
	return &NotificationHandler{version: version}
}

func (nh *NotificationHandler) Notifications(c echo.Context) error {
	t, err := time.Parse(time.RFC3339, nh.version)
	if err != nil {
		return err
	}

	notifications := make([]notification, 0)
	if timeSinceLastUpdate := time.Since(t); timeSinceLastUpdate >= time.Hour*36 {
		notifications = append(notifications, notification{
			Type:    notificationTypeInfo,
			Header:  "Information outdated",
			Content: fmt.Sprintf("We are having issues updating the data shown on this website and are working on a fix. The schedules have last been updated at %s (%s ago).", t.Format(time.RFC3339), nh.humanReadableDuration(timeSinceLastUpdate)),
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
