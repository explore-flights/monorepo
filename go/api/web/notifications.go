package web

import (
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/labstack/echo/v4"
	"net/http"
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

func NewNotificationsEndpoint(s3c adapt.S3Header, dataBucket string) echo.HandlerFunc {
	return func(c echo.Context) error {
		resp, err := s3c.HeadObject(c.Request().Context(), &s3.HeadObjectInput{
			Bucket: aws.String(dataBucket),
			Key:    aws.String("processed/metadata/flightNumbers.json"),
		})
		if err != nil {
			return c.NoContent(http.StatusBadGateway)
		}

		notifications := make([]notification, 0)

		timeSinceLastUpdate := time.Now().Sub(*resp.LastModified)
		if timeSinceLastUpdate >= time.Hour*36 {
			notifications = append(notifications, notification{
				Type:    notificationTypeInfo,
				Header:  "Issues with the Lufthansa API",
				Content: fmt.Sprintf("The official Lufthansa API experiences issues right now. The schedules have last been updated at %s (%s ago).", (*resp.LastModified).Format(time.RFC3339), humanReadableDuration(timeSinceLastUpdate)),
			})
		}

		return c.JSON(http.StatusOK, notifications)
	}
}

func humanReadableDuration(d time.Duration) string {
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
