package action

import (
	"bytes"
	"cmp"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"io"
	"maps"
	"net/url"
	"slices"
	"strings"
	"time"
)

type UpdateAllegrisFeedParams struct {
	InputBucket  string `json:"inputBucket"`
	InputPrefix  string `json:"inputPrefix"`
	OutputBucket string `json:"outputBucket"`
	OutputPrefix string `json:"outputPrefix"`
}

type UpdateAllegrisFeedOutput struct{}

type uafAction struct {
	s3c MinimalS3Client
}

func NewUpdateAllegrisFeedAction(s3c MinimalS3Client) Action[UpdateAllegrisFeedParams, UpdateAllegrisFeedOutput] {
	return &uafAction{s3c}
}

func (a *uafAction) Handle(ctx context.Context, params UpdateAllegrisFeedParams) (UpdateAllegrisFeedOutput, error) {
	feed, err := a.generateFeed(ctx, params.InputBucket, params.InputPrefix)
	if err != nil {
		return UpdateAllegrisFeedOutput{}, err
	}

	err = errors.Join(
		a.saveFeed(ctx, feed, params.OutputBucket, params.OutputPrefix+"feed.rss", "application/rss+xml", (*feeds.Feed).WriteRss),
		a.saveFeed(ctx, feed, params.OutputBucket, params.OutputPrefix+"feed.atom", "application/atom+xml", (*feeds.Feed).WriteAtom),
		a.saveFeed(ctx, feed, params.OutputBucket, params.OutputPrefix+"feed.json", "application/json", (*feeds.Feed).WriteJSON),
	)

	return UpdateAllegrisFeedOutput{}, err
}

func (a *uafAction) saveFeed(ctx context.Context, feed *feeds.Feed, bucket, key, contentType string, writer func(*feeds.Feed, io.Writer) error) error {
	var buf bytes.Buffer
	if err := writer(feed, &buf); err != nil {
		return err
	}

	b := buf.Bytes()
	_, err := a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(b),
		ContentType: aws.String(contentType),
	})

	return err
}

func (a *uafAction) generateFeed(ctx context.Context, bucket, prefix string) (*feeds.Feed, error) {
	const (
		feedId                                 = "https://explore.flights/allegris"
		allegrisAircraftType                   = "359"
		allegrisAircraftConfigurationNoFirst   = "C38E24M201"
		allegrisAircraftConfigurationWithFirst = "F4C38E24M201"
	)

	schedules, err := a.loadLHSchedules(ctx, bucket, prefix)
	if err != nil {
		return nil, err
	}

	results := make(map[string]map[common.FlightNumber][]*common.FlightScheduleVariant)
	for fn, fs := range schedules {
		for _, variant := range fs.Variants {
			if variant.Data.ServiceType == "J" && variant.Data.AircraftType == allegrisAircraftType && variant.Data.OperatedAs == fn {
				if variant.Data.AircraftConfigurationVersion == allegrisAircraftConfigurationNoFirst || variant.Data.AircraftConfigurationVersion == allegrisAircraftConfigurationWithFirst {
					byFn, ok := results[variant.Data.AircraftConfigurationVersion]
					if !ok {
						byFn = make(map[common.FlightNumber][]*common.FlightScheduleVariant)
						results[variant.Data.AircraftConfigurationVersion] = byFn
					}

					byFn[fn] = append(byFn[fn], variant)
				}
			}
		}
	}

	feed := &feeds.Feed{
		Id:    feedId,
		Title: "Lufthansa Allegris Flights",
		Link: &feeds.Link{
			Href: feedId,
			Rel:  "alternate",
			Type: "text/html",
		},
	}

	for aircraftConfigurationVersion, byFn := range results {
		for fn, variants := range byFn {
			if len(variants) < 0 {
				continue
			}

			itemLink := a.buildItemLink(fn, allegrisAircraftType, aircraftConfigurationVersion)
			var created time.Time
			var updated time.Time

			for _, variant := range variants {
				if created.IsZero() || created.After(variant.Metadata.CreationTime) {
					created = variant.Metadata.CreationTime
				}

				updateTime := common.Max(variant.Metadata.RangesUpdateTime, variant.Metadata.DataUpdateTime)
				if updated.IsZero() || updated.Before(updateTime) {
					updated = updateTime
				}
			}

			var suffix string
			if aircraftConfigurationVersion == allegrisAircraftConfigurationNoFirst {
				suffix = "without first"
			} else {
				suffix = "with first"
			}

			content := a.buildItemContent(fn, variants)
			feed.Items = append(feed.Items, &feeds.Item{
				Id:          itemLink,
				IsPermaLink: "false",
				Title:       fmt.Sprintf("Flight %s operates on Allegris %s (%s)", fn.String(), suffix, aircraftConfigurationVersion),
				Link: &feeds.Link{
					Href: itemLink,
					Rel:  "alternate",
					Type: "text/html",
				},
				Created:     created,
				Updated:     updated,
				Content:     content,
				Description: content,
			})

			if feed.Created.IsZero() || feed.Created.After(created) {
				feed.Created = created
			}

			if feed.Updated.IsZero() || feed.Updated.Before(updated) {
				feed.Updated = updated
			}
		}
	}

	return feed, nil
}

func (a *uafAction) loadLHSchedules(ctx context.Context, bucket, prefix string) (map[common.FlightNumber]*common.FlightSchedule, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + "LH.json.gz"),
	})

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	r, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, err
	}

	defer r.Close()

	var schedules map[common.FlightNumber]*common.FlightSchedule
	return schedules, json.NewDecoder(r).Decode(&schedules)
}

func (a *uafAction) buildItemLink(fn common.FlightNumber, aircraftType, aircraftConfigurationVersion string) string {
	q := make(url.Values)
	q.Set("aircraft_type", aircraftType)
	q.Set("aircraft_configuration_version", aircraftConfigurationVersion)

	return fmt.Sprintf("https://explore.flights/flight/%s?%s", fn.String(), q.Encode())
}

func (a *uafAction) buildItemContent(fn common.FlightNumber, variants []*common.FlightScheduleVariant) string {
	rangeByRoute := make(map[[2]string]xtime.LocalDateRanges)

	for _, variant := range variants {
		route := [2]string{variant.Data.DepartureAirport, variant.Data.ArrivalAirport}

		if ldrs, ok := rangeByRoute[route]; ok {
			rangeByRoute[route] = ldrs.ExpandAll(variant.Ranges)
		} else {
			rangeByRoute[route] = variant.Ranges
		}
	}

	routesSorted := slices.SortedFunc(maps.Keys(rangeByRoute), func(a [2]string, b [2]string) int {
		return cmp.Or(
			cmp.Compare(a[0], b[0]),
			cmp.Compare(a[1], b[1]),
		)
	})

	result := fmt.Sprintf("Flight %s operates Allegris on:\n", fn.String())
	for _, route := range routesSorted {
		ldrs := rangeByRoute[route]
		if cnt, span := ldrs.Span(); cnt > 0 {
			result += fmt.Sprintf("%s - %s from %s until %s (%d days)\n", route[0], route[1], span[0].String(), span[1].String(), cnt)
		}
	}

	return strings.TrimSpace(result)
}
